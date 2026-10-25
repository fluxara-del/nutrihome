import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { InventoryActor } from "./inventory";
import { localDate, calendarDate, addDays } from "./calendar";
import {
  recipeInclude,
  snapshotRecipe,
  servingNutrition,
  type FullRecipe,
} from "./recipes";
import { authorizePlanning, planningRequest } from "./planning-request";
import {
  PlanningError,
  generateSchema,
  regenerateMealSchema,
  mealSchema,
  planSchema,
  priceSchema,
  parsePlanning,
  planningFixed,
} from "./planning-input";
import {
  storedMealSchema,
  decodeMeal,
  decodeSettings,
  planSettings,
  generateMeals,
  evaluatePlan,
  mealType,
  recipeAllowed,
  type StoredMeal,
  type PlanMeal,
} from "./plan-engine";
export function storedRecipe(r: FullRecipe): StoredMeal {
  return storedMealSchema.parse({
    nutrition: snapshotRecipe(r),
    instructions: r.instructions,
    recipeVersion: r.version,
    productVersions: Object.fromEntries(
      r.ingredients.map((i) => [
        i.productId,
        i.product.updatedAt.toISOString(),
      ]),
    ),
    tags: r.tags.map((t) => t.tag),
    preparationMinutes: r.preparationMinutes,
    cookingMinutes: r.cookingMinutes,
    ingredientTerms: Object.fromEntries(
      r.ingredients.map((i) => [
        i.productId,
        [i.product.name, i.product.brand, i.product.category].join(" "),
      ]),
    ),
  });
}
async function resources(tx: Prisma.TransactionClient, actor: InventoryActor) {
  const [stock, prices] = await Promise.all([
    tx.inventoryBatch.findMany({
      where: {
        product: { householdId: actor.householdId },
        quantityMg: { gt: 0 },
      },
    }),
    tx.planningPrice.findMany({
      where: { product: { householdId: actor.householdId } },
    }),
  ]);
  return {
    stock,
    prices: prices.flatMap((p) =>
      p.centsPerKg === null
        ? []
        : [{ productId: p.productId, centsPerKg: p.centsPerKg }],
    ),
  };
}
const include = {
  meals: { orderBy: [{ date: "asc" as const }, { slot: "asc" as const }] },
  owner: { select: { username: true } },
};
type Plan = Prisma.MealPlanGetPayload<{ include: typeof include }>;
function unpack(p: Plan): PlanMeal[] {
  return p.meals.map((m) => ({
    id: m.id,
    date: m.date,
    slot: m.slot,
    recipeId: m.recipeId,
    servingsMilli: m.servingsMilli,
    stored: decodeMeal(m.recipeSnapshot),
  }));
}
async function ownDraft(
  tx: Prisma.TransactionClient,
  actor: InventoryActor,
  id: string,
  version: number,
) {
  const p = await tx.mealPlan.findFirst({
    where: {
      id,
      householdId: actor.householdId,
      ownerUserId: actor.userId,
      version,
    },
    include,
  });
  if (!p || p.status !== "DRAFT")
    throw new PlanningError(
      "Nacrt nije dostupan, promijenjen je ili pripada drugom korisniku.",
    );
  return p;
}
export async function generatePlan(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(generateSchema, raw),
    today = localDate();
  let day: number;
  try {
    day = calendarDate(input.weekStart).getUTCDay();
  } catch {
    throw new PlanningError("Datum nije valjan.");
  }
  const monday = addDays(today, -((calendarDate(today).getUTCDay() + 6) % 7));
  if (
    day !== 1 ||
    input.weekStart < monday ||
    input.weekStart > addDays(today, 366)
  )
    throw new PlanningError(
      "Odaberi ponedjeljak ovog ili budućeg tjedna, najviše godinu unaprijed.",
    );
  return planningRequest(
    client,
    actor,
    "PLAN_GENERATE",
    input,
    "",
    async (tx) => {
      const settings = planSettings(
        await tx.userSettings.findUnique({ where: { userId: actor.userId } }),
      );
      const old = await tx.mealPlan.findUnique({
        where: {
          householdId_weekStart: {
            householdId: actor.householdId,
            weekStart: input.weekStart,
          },
        },
        include,
      });
      if (old) {
        await ownDraft(tx, actor, old.id, input.version);
        if (await tx.shoppingListItem.count({ where: { mealPlanId: old.id } }))
          throw new PlanningError(
            "Plan ima povezane stavke kupnje. Sačuvaj postojeći plan.",
          );
      } else if (input.version !== 0)
        throw new PlanningError("Plan više nije dostupan.");
      const recipes = await tx.recipe.findMany({
        where: { householdId: actor.householdId, archived: false },
        include: recipeInclude,
        orderBy: { id: "asc" },
        take: 501,
      });
      if (recipes.length > 500)
        throw new PlanningError(
          "Planner podržava do 500 aktivnih recepata. Arhiviraj suvišne recepte.",
        );
      const { stock, prices } = await resources(tx, actor);
      const meals = generateMeals(
        input.weekStart,
        recipes.map((r) => ({ id: r.id, stored: storedRecipe(r) })),
        settings,
        stock,
        prices,
        today,
      );
      evaluatePlan(input.weekStart, meals, settings, stock, prices, today);
      const data = {
        settingsSnapshot: JSON.stringify(settings),
        targetCaloriesCenti: settings.calories,
        targetProteinCenti: settings.protein,
      };
      const id = old?.id ?? randomUUID();
      if (old) {
        await tx.mealPlan.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        });
        await tx.plannedMeal.deleteMany({ where: { mealPlanId: id } });
      } else
        await tx.mealPlan.create({
          data: {
            id,
            householdId: actor.householdId,
            ownerUserId: actor.userId,
            weekStart: input.weekStart,
            version: 1,
            ...data,
          },
        });
      await tx.plannedMeal.createMany({
        data: meals.map((m) => ({
          mealPlanId: id,
          date: m.date,
          slot: m.slot,
          recipeId: m.recipeId,
          servingsMilli: m.servingsMilli,
          mealType: mealType(m.slot, settings.mealCount),
          recipeSnapshot: JSON.stringify(m.stored),
        })),
      });
      return id;
    },
  );
}
export async function changeMeal(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(mealSchema, raw),
    servingsMilli = planningFixed(input.servings, 3, 100000);
  return planningRequest(
    client,
    actor,
    "PLAN_MEAL",
    input,
    input.planId,
    async (tx) => {
      const p = await ownDraft(tx, actor, input.planId, input.version);
      const recipe = await tx.recipe.findFirst({
        where: {
          id: input.recipeId,
          householdId: actor.householdId,
          archived: false,
        },
        include: recipeInclude,
      });
      if (!recipe) throw new PlanningError("Recept nije dostupan.");
      const stored = storedRecipe(recipe),
        settings = decodeSettings(p.settingsSnapshot);
      if (!recipeAllowed(stored, settings))
        throw new PlanningError("Recept ne zadovoljava ograničenja plana.");
      const meals = unpack(p);
      const meal = meals.find((m) => m.id === input.mealId);
      if (!meal) throw new PlanningError("Obrok nije dostupan.");
      Object.assign(meal, { recipeId: recipe.id, servingsMilli, stored });
      const { stock, prices } = await resources(tx, actor);
      evaluatePlan(p.weekStart, meals, settings, stock, prices, localDate());
      await tx.plannedMeal.update({
        where: { id: input.mealId },
        data: {
          recipeId: recipe.id,
          servingsMilli,
          recipeSnapshot: JSON.stringify(stored),
        },
      });
      await tx.mealPlan.update({
        where: { id: p.id },
        data: { version: { increment: 1 } },
      });
      return p.id;
    },
  );
}
async function stale(
  tx: Prisma.TransactionClient,
  actor: InventoryActor,
  p: Plan,
) {
  const meals = unpack(p);
  const [settings, recipes] = await Promise.all([
    tx.userSettings.findUnique({
      where: { userId: p.ownerUserId ?? actor.userId },
    }),
    tx.recipe.findMany({
      where: {
        id: { in: [...new Set(meals.map((m) => m.recipeId))] },
        householdId: actor.householdId,
      },
      include: recipeInclude,
    }),
  ]);
  if (
    !settings?.goalsConfirmed ||
    settings.version !== decodeSettings(p.settingsSnapshot).version
  )
    return true;
  const lookup = new Map(recipes.map((r) => [r.id, r]));
  return meals.some((m) => {
    const r = lookup.get(m.recipeId);
    return (
      !r ||
      r.archived ||
      r.version !== m.stored.recipeVersion ||
      r.ingredients.some(
        (i) =>
          m.stored.productVersions[i.productId] !==
          i.product.updatedAt.toISOString(),
      )
    );
  });
}
export async function approvePlan(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(planSchema, raw);
  return planningRequest(
    client,
    actor,
    "PLAN_APPROVE",
    input,
    input.planId,
    async (tx) => {
      const p = await ownDraft(tx, actor, input.planId, input.version);
      if (await stale(tx, actor, p))
        throw new PlanningError(
          "Recepti, sastojci ili ciljevi su promijenjeni. Ponovno izradi nacrt.",
        );
      const { stock, prices } = await resources(tx, actor);
      const report = evaluatePlan(
        p.weekStart,
        unpack(p),
        decodeSettings(p.settingsSnapshot),
        stock,
        prices,
        localDate(),
      );
      if (report.warnings.length && !input.acceptWarnings)
        throw new PlanningError(
          "Pregledaj odstupanja i izričito prihvati upozorenja.",
        );
      await tx.mealPlan.update({
        where: { id: p.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedReport: JSON.stringify(report),
          version: { increment: 1 },
        },
      });
      return p.id;
    },
  );
}
export async function reopenPlan(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(planSchema, raw);
  return planningRequest(
    client,
    actor,
    "PLAN_REOPEN",
    input,
    input.planId,
    async (tx) => {
      const p = await tx.mealPlan.findFirst({
        where: {
          id: input.planId,
          householdId: actor.householdId,
          ownerUserId: actor.userId,
          version: input.version,
          status: "APPROVED",
        },
      });
      if (!p)
        throw new PlanningError(
          "Odobreni plan nije dostupan ili je promijenjen.",
        );
      await tx.mealPlan.update({
        where: { id: p.id },
        data: {
          status: "DRAFT",
          approvedAt: null,
          approvedReport: null,
          version: { increment: 1 },
        },
      });
      return p.id;
    },
  );
}
export async function savePlanningPrice(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(priceSchema, raw);
  const centsPerKg = input.eurosPerKg
    ? planningFixed(input.eurosPerKg, 2, 100000000)
    : null;
  return planningRequest(
    client,
    actor,
    "PRICE_SAVE",
    input,
    input.productId,
    async (tx) => {
      if (
        !(await tx.foodProduct.findFirst({
          where: { id: input.productId, householdId: actor.householdId },
        }))
      )
        throw new PlanningError("Proizvod nije dostupan.");
      const old = await tx.planningPrice.findUnique({
        where: { productId: input.productId },
      });
      if ((old?.version ?? 0) !== input.version)
        throw new PlanningError("Cijena je promijenjena. Osvježi obrazac.");
      if (old)
        await tx.planningPrice.update({
          where: { productId: input.productId },
          data: { centsPerKg, version: { increment: 1 } },
        });
      else
        await tx.planningPrice.create({
          data: { productId: input.productId, centsPerKg },
        });
      return input.productId;
    },
  );
}
export async function loadPlan(
  client: PrismaClient,
  actor: InventoryActor,
  weekStart: string,
) {
  await authorizePlanning(client, actor);
  const plan = await client.mealPlan.findFirst({
    where: { householdId: actor.householdId, weekStart },
    include,
  });
  if (!plan) return { plan: null };
  try {
    const settings = decodeSettings(plan.settingsSnapshot),
      meals = unpack(plan);
    const { stock, prices } = await resources(client, actor);
    const report =
      plan.status === "APPROVED" && plan.approvedReport
        ? (JSON.parse(plan.approvedReport) as ReturnType<typeof evaluatePlan>)
        : evaluatePlan(weekStart, meals, settings, stock, prices, localDate());
    return {
      plan,
      settings,
      meals,
      report,
      stale: plan.status === "DRAFT" && (await stale(client, actor, plan)),
    };
  } catch (e) {
    return {
      plan,
      error:
        e instanceof PlanningError
          ? e.message
          : "Stariji plan nije moguće urediti; podaci su sačuvani.",
    };
  }
}
export async function regenerateMeal(
  client: PrismaClient,
  actor: InventoryActor,
  raw: unknown,
) {
  const input = parsePlanning(regenerateMealSchema, raw);
  return planningRequest(
    client,
    actor,
    "PLAN_REGENERATE_MEAL",
    input,
    input.planId,
    async (tx) => {
      const p = await ownDraft(tx, actor, input.planId, input.version),
        settings = decodeSettings(p.settingsSnapshot),
        meals = unpack(p),
        index = meals.findIndex((m) => m.id === input.mealId);
      if (index < 0) throw new PlanningError("Obrok nije dostupan.");
      const current = meals[index];
      const recipes = await tx.recipe.findMany({
        where: { householdId: actor.householdId, archived: false },
        include: recipeInclude,
        orderBy: { id: "asc" },
        take: 501,
      });
      if (recipes.length > 500)
        throw new PlanningError("Planner podržava do 500 aktivnih recepata.");
      const candidates = recipes
        .filter((r) => r.id !== current.recipeId)
        .map((r) => ({ id: r.id, stored: storedRecipe(r) }))
        .filter((r) => recipeAllowed(r.stored, settings));
      const { stock, prices } = await resources(tx, actor);
      const others = meals
        .filter((m) => m.date === current.date && m.id !== current.id)
        .map((m) => servingNutrition(m.stored.nutrition, m.servingsMilli));
      const target = Math.max(
        1,
        settings.calories - others.reduce((n, m) => n + m.totals.calories, 0),
      );
      let best: PlanMeal | undefined,
        bestScore = Infinity;
      for (const c of candidates) {
        try {
          const nutrition = servingNutrition(c.stored.nutrition);
          if (nutrition.totals.calories <= 0) continue;
          const servingsMilli =
            Math.round(
              Math.max(
                250,
                Math.min(4000, (target / nutrition.totals.calories) * 1000),
              ) / 250,
            ) * 250;
          const replacement = {
            ...current,
            recipeId: c.id,
            stored: c.stored,
            servingsMilli,
          };
          const proposal = meals.map((m, i) => (i === index ? replacement : m));
          const report = evaluatePlan(
              p.weekStart,
              proposal,
              settings,
              stock,
              prices,
              localDate(),
            ),
            day = report.days.find((d) => d.date === current.date)!;
          const score =
            (Math.abs(day.calories - settings.calories) / settings.calories) *
              1000000 +
            (Math.max(0, settings.protein - day.protein) /
              Math.max(1, settings.protein)) *
              600000 +
            report.knownCostEstimateCents * 20 +
            report.unknownPriceCount * 10000 -
            settings.preferredTags.filter((t) => c.stored.tags.includes(t))
              .length *
              20000;
          if (score < bestScore) {
            bestScore = score;
            best = replacement;
          }
        } catch {
          continue;
        }
      }
      if (!best)
        throw new PlanningError(
          "Nema drugog aktivnog recepta koji zadovoljava ograničenja. Dodaj alternativni recept.",
        );
      await tx.plannedMeal.update({
        where: { id: input.mealId },
        data: {
          recipeId: best.recipeId,
          servingsMilli: best.servingsMilli,
          recipeSnapshot: JSON.stringify(best.stored),
        },
      });
      await tx.mealPlan.update({
        where: { id: p.id },
        data: { version: { increment: 1 } },
      });
      return p.id;
    },
  );
}
