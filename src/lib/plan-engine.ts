import { z } from "zod";
import type { UserSettings } from "@prisma/client";
import { calendarDate, addDays } from "./calendar";
import { normalizeFoodName } from "./food-draft";
import { positiveInt } from "./quantities";
import { PlanningError, tagKeys, type RecipeTagKey } from "./planning-input";
import { servingNutrition } from "./recipes";
import type { RecipeSnapshot } from "./nutrition-snapshot";
const int = z.number().int().min(0).max(2147483647),
  nutrients = z.strictObject({
    calories: int,
    protein: int,
    carbs: int,
    fat: int,
    fiber: int,
  });
const product = z.strictObject({
  kind: z.literal("product"),
  version: z.literal(1),
  sourceId: z.string(),
  name: z.string(),
  state: z.enum(["RAW", "COOKED"]),
  estimated: z.boolean(),
  fiberKnown: z.boolean().optional(),
  per100g: nutrients,
  densityMgPerMl: int.nullable(),
  pieceWeightMg: int.nullable(),
});
export const storedMealSchema = z.strictObject({
  nutrition: z.strictObject({
    kind: z.literal("recipe"),
    version: z.literal(1),
    sourceId: z.string(),
    name: z.string(),
    state: z.enum(["RAW", "COOKED"]),
    estimated: z.boolean(),
    servingsMilli: int.refine((n) => n > 0),
    ingredients: z
      .array(
        z.strictObject({
          productId: z.string(),
          quantityMg: int.refine((n) => n > 0),
          product,
        }),
      )
      .min(1)
      .max(50),
  }),
  recipeVersion: int,
  productVersions: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  preparationMinutes: int,
  cookingMinutes: int,
  ingredientTerms: z.record(z.string(), z.string()),
});
export type StoredMeal = z.infer<typeof storedMealSchema>;
export function decodeMeal(value: string | null): StoredMeal {
  try {
    return storedMealSchema.parse(JSON.parse(value ?? ""));
  } catch {
    throw new PlanningError(
      "Plan nema valjanu nutritivnu snimku. Obnovi nacrt; postojeći zapisi nisu mijenjani.",
    );
  }
}
export const settingsSchema = z.strictObject({
  version: int,
  calories: int.refine((n) => n > 0),
  protein: int,
  mealCount: z.number().int().min(1).max(12),
  budget: int.nullable(),
  requiredTags: z.array(z.enum(tagKeys)),
  preferredTags: z.array(z.enum(tagKeys)),
  excluded: z.array(z.string()).max(50),
  under20: z.boolean(),
});
export type PlanSettings = z.infer<typeof settingsSchema>;
const aliases: Record<string, RecipeTagKey> = {
  vegetarijansko: "VEGETARIAN",
  vegetarian: "VEGETARIAN",
  vegansko: "VEGAN",
  vegan: "VEGAN",
  "bez glutena": "GLUTEN_FREE",
  "gluten free": "GLUTEN_FREE",
  "visoki udio proteina": "HIGH_PROTEIN",
  "visok udio proteina": "HIGH_PROTEIN",
  "high protein": "HIGH_PROTEIN",
  "priprema unaprijed": "MEAL_PREP",
  "meal prep": "MEAL_PREP",
  "za posao": "WORK_FRIENDLY",
  "work friendly": "WORK_FRIENDLY",
  "do 20 minuta": "UNDER_20_MINUTES",
  "under 20 minutes": "UNDER_20_MINUTES",
  "za zamrzavanje": "FREEZER_FRIENDLY",
  "freezer friendly": "FREEZER_FRIENDLY",
  "iskoristi uskoro": "USE_SOON",
  "use soon": "USE_SOON",
};
export function planSettings(settings: UserSettings | null): PlanSettings {
  if (!settings?.goalsConfirmed)
    throw new PlanningError(
      "Najprije pregledaj i potvrdi osobne ciljeve u Postavkama.",
    );
  let preferences: string[], excluded: string[];
  try {
    preferences = z
      .array(z.string().max(100))
      .max(50)
      .parse(JSON.parse(settings.dietaryPreferences));
    excluded = z
      .array(z.string().max(100))
      .max(50)
      .parse(JSON.parse(settings.excludedIngredients));
  } catch {
    throw new PlanningError(
      "Postavke ograničenja nisu valjane. Ponovno ih spremi u Postavkama.",
    );
  }
  const requiredTags: RecipeTagKey[] = [],
    preferredTags: RecipeTagKey[] = [];
  let under20 = false;
  for (const value of preferences) {
    const key = aliases[normalizeFoodName(value).replace(/[_-]/g, " ")];
    if (!key)
      throw new PlanningError(
        `Preferencija „${value}” nije podržana. Podržano: vegetarijansko, vegansko, bez glutena, visok udio proteina, priprema unaprijed, za posao, do 20 minuta, za zamrzavanje, iskoristi uskoro.`,
      );
    if (["VEGETARIAN", "VEGAN", "GLUTEN_FREE"].includes(key))
      requiredTags.push(key);
    else if (key === "UNDER_20_MINUTES") under20 = true;
    else preferredTags.push(key);
  }
  return settingsSchema.parse({
    version: settings.version,
    calories: settings.calorieTargetCenti,
    protein: settings.proteinTargetCenti,
    mealCount: settings.mealCount,
    budget: settings.weeklyBudgetCents,
    requiredTags: [...new Set(requiredTags)],
    preferredTags: [...new Set(preferredTags)],
    excluded: excluded.map(normalizeFoodName).filter(Boolean),
    under20,
  });
}
export function decodeSettings(value: string | null) {
  try {
    return settingsSchema.parse(JSON.parse(value ?? ""));
  } catch {
    throw new PlanningError(
      "Plan nema valjane snimljene ciljeve. Obnovi nacrt.",
    );
  }
}
export function recipeAllowed(s: StoredMeal, settings: PlanSettings) {
  return (
    settings.requiredTags.every(
      (t) =>
        s.tags.includes(t) || (t === "VEGETARIAN" && s.tags.includes("VEGAN")),
    ) &&
    (!settings.under20 || s.preparationMinutes + s.cookingMinutes <= 20) &&
    !Object.values(s.ingredientTerms).some((term) =>
      settings.excluded.some((q) => normalizeFoodName(term).includes(q)),
    )
  );
}
export type PlanMeal = {
  id?: string;
  date: string;
  slot: number;
  recipeId: string;
  servingsMilli: number;
  stored: StoredMeal;
};
export type Stock = {
  id: string;
  productId: string;
  quantityMg: number;
  expirationDate: string | null;
  createdAt: Date;
};
export type Price = { productId: string; centsPerKg: number };
export function mealType(
  slot: number,
  count: number,
): "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" {
  if (count === 1) return "LUNCH";
  if (count === 2) return slot === 0 ? "LUNCH" : "DINNER";
  return (["BREAKFAST", "LUNCH", "DINNER"][slot] ?? "SNACK") as
    "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
}
export function mealLabel(slot: number, count: number) {
  return slot >= 3
    ? `Užina ${slot - 2}`
    : {
        BREAKFAST: "Doručak",
        LUNCH: "Ručak",
        DINNER: "Večera",
        SNACK: "Užina",
      }[mealType(slot, count)];
}
function stockIndex(stocks: Stock[]) {
  const map = new Map<string, Stock[]>();
  for (const s of sortedStock(stocks)) {
    const rows = map.get(s.productId) ?? [];
    rows.push(s);
    map.set(s.productId, rows);
  }
  return map;
}
function sortedStock(stocks: Stock[]) {
  return stocks
    .map((s) => ({ ...s }))
    .sort(
      (a, b) =>
        (a.expirationDate ?? "9999").localeCompare(
          b.expirationDate ?? "9999",
        ) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
}
export function allocate(
  stocks: Stock[],
  productId: string,
  quantityMg: number,
  date: string,
) {
  let remaining = quantityMg;
  for (const batch of stocks) {
    if (
      batch.productId !== productId ||
      (batch.expirationDate !== null && batch.expirationDate < date)
    )
      continue;
    const used = Math.min(batch.quantityMg, remaining);
    batch.quantityMg -= used;
    remaining -= used;
    if (remaining === 0) break;
  }
  return remaining;
}
const ceilCost = (mg: number, price: number) =>
  positiveInt(Number((BigInt(mg) * BigInt(price) + 999999n) / 1000000n), true);
export function evaluatePlan(
  weekStart: string,
  meals: PlanMeal[],
  settings: PlanSettings,
  stock: Stock[],
  prices: Price[],
  today: string,
) {
  calendarDate(weekStart);
  const expected = 7 * settings.mealCount;
  if (meals.length !== expected)
    throw new PlanningError("Plan mora sadržavati sedam potpunih dana.");
  const slots = new Set<string>();
  const inventory = stockIndex(stock),
    priceMap = new Map(prices.map((p) => [p.productId, p.centsPerKg]));
  const shortages = new Map<
    string,
    { productId: string; name: string; missingMg: number }
  >();
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0 as number | null,
    estimated: false,
    calorieWithin: false,
    proteinMet: false,
  }));
  for (const meal of [...meals].sort(
    (a, b) => a.date.localeCompare(b.date) || a.slot - b.slot,
  )) {
    const key = meal.date + ":" + meal.slot,
      day = days.find((d) => d.date === meal.date);
    if (
      !day ||
      !Number.isInteger(meal.slot) ||
      meal.slot < 0 ||
      meal.slot >= settings.mealCount ||
      slots.has(key)
    )
      throw new PlanningError("Datum ili redoslijed obroka nije valjan.");
    slots.add(key);
    if (!recipeAllowed(meal.stored, settings))
      throw new PlanningError(
        "Recept ne zadovoljava odabrana ograničenja ili sadrži isključeni pojam.",
      );
    const calculation = servingNutrition(
      meal.stored.nutrition as RecipeSnapshot,
      meal.servingsMilli,
    );
    for (const k of ["calories", "protein", "carbs", "fat"] as const)
      day[k] = positiveInt(day[k] + calculation.totals[k], true);
    day.fiber =
      day.fiber === null || !calculation.fiberKnown
        ? null
        : positiveInt(day.fiber + calculation.totals.fiber, true);
    day.estimated ||= calculation.estimated;
    for (const need of calculation.stocks) {
      const missing = allocate(
        inventory.get(need.productId) ?? [],
        need.productId,
        need.quantityMg,
        meal.date > today ? meal.date : today,
      );
      if (missing) {
        const old = shortages.get(need.productId);
        shortages.set(need.productId, {
          productId: need.productId,
          name: meal.stored.nutrition.ingredients.find(
            (i) => i.productId === need.productId,
          )!.product.name,
          missingMg: positiveInt((old?.missingMg ?? 0) + missing),
        });
      }
    }
  }
  for (const day of days) {
    day.calorieWithin =
      day.calories >= Math.ceil(settings.calories * 0.9) &&
      day.calories <= Math.floor(settings.calories * 1.1);
    day.proteinMet = day.protein >= settings.protein;
  }
  const shortfalls = [...shortages.values()]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((s) => ({
      ...s,
      centsPerKg: priceMap.get(s.productId) ?? null,
      estimateCents: priceMap.has(s.productId)
        ? ceilCost(s.missingMg, priceMap.get(s.productId)!)
        : null,
    }));
  const unknownPriceCount = shortfalls.filter(
      (s) => s.estimateCents === null,
    ).length,
    knownCostEstimateCents = positiveInt(
      shortfalls.reduce((n, s) => n + (s.estimateCents ?? 0), 0),
      true,
    );
  const additionalCostEstimateCents = unknownPriceCount
    ? null
    : knownCostEstimateCents;
  const budgetStatus =
    settings.budget === null
      ? "UNSET"
      : additionalCostEstimateCents === null
        ? "UNKNOWN"
        : additionalCostEstimateCents <= settings.budget
          ? "ESTIMATE_WITHIN"
          : "ESTIMATE_OVER";
  const warnings: string[] = [];
  if (days.some((d) => !d.calorieWithin))
    warnings.push("Neki dani odstupaju više od 10 % od kalorijskog cilja.");
  if (days.some((d) => !d.proteinMet))
    warnings.push("Neki dani ne dosežu cilj proteina.");
  if (budgetStatus === "UNKNOWN")
    warnings.push(
      "Budžet nije provjerljiv jer nedostaju cijene za dio manjka.",
    );
  if (budgetStatus === "ESTIMATE_OVER")
    warnings.push("Procijenjena dodatna nabava prelazi tjedni budžet.");
  if (budgetStatus === "UNSET") warnings.push("Tjedni budžet nije postavljen.");
  if (days.some((d) => d.estimated))
    warnings.push(
      "Nutritivni izračun sadrži procijenjene podatke ili nepoznata vlakna.",
    );
  return {
    days,
    shortfalls,
    unknownPriceCount,
    knownCostEstimateCents,
    additionalCostEstimateCents,
    budgetStatus,
    warnings,
    checkedOn: today,
  };
}
export type PlanReport = ReturnType<typeof evaluatePlan>;
export function generateMeals(
  weekStart: string,
  recipes: { id: string; stored: StoredMeal }[],
  settings: PlanSettings,
  stock: Stock[],
  prices: Price[],
  today: string,
): PlanMeal[] {
  const candidates = recipes
    .filter((r) => recipeAllowed(r.stored, settings))
    .sort(
      (a, b) =>
        a.stored.nutrition.name.localeCompare(b.stored.nutrition.name, "hr") ||
        a.id.localeCompare(b.id),
    );
  if (!candidates.length)
    throw new PlanningError(
      "Nema aktivnih recepata koji zadovoljavaju ograničenja. Dodaj ili prilagodi recepte; ograničenja nisu zanemarena.",
    );
  const choices = candidates.flatMap((r) =>
    [250, 500, 750, 1000, 1250, 1500, 2000, 3000, 4000].flatMap(
      (servingsMilli) => {
        try {
          const nutrition = servingNutrition(
            r.stored.nutrition as RecipeSnapshot,
            servingsMilli,
          );
          return nutrition.totals.calories > 0
            ? [{ ...r, servingsMilli, nutrition }]
            : [];
        } catch {
          return [];
        }
      },
    ),
  );
  if (!choices.length)
    throw new PlanningError(
      "Recepti nemaju prikladne pozitivne nutritivne vrijednosti.",
    );
  const inventory = stockIndex(stock),
    used = new Map<string, number>(),
    priceMap = new Map(prices.map((p) => [p.productId, p.centsPerKg]));
  const meals: PlanMeal[] = [];
  for (let day = 0; day < 7; day++) {
    const date = addDays(weekStart, day);
    let calories = 0,
      protein = 0;
    for (let slot = 0; slot < settings.mealCount; slot++) {
      const cTarget = Math.max(
          1,
          (settings.calories - calories) / (settings.mealCount - slot),
        ),
        pTarget = Math.max(
          0,
          (settings.protein - protein) / (settings.mealCount - slot),
        );
      let best = choices[0],
        bestScore = Infinity;
      for (const choice of choices) {
        let missing = 0,
          total = 0,
          soon = 0,
          cost = 0;
        for (const need of choice.nutrition.stocks) {
          const eligible = (inventory.get(need.productId) ?? []).filter(
            (b) =>
              b.expirationDate === null ||
              b.expirationDate >= (date > today ? date : today),
          );
          const available = eligible.reduce((n, b) => n + b.quantityMg, 0);
          total += need.quantityMg;
          const short = Math.max(0, need.quantityMg - available);
          missing += short;
          soon += Math.min(
            need.quantityMg,
            eligible
              .filter(
                (b) =>
                  b.expirationDate !== null &&
                  b.expirationDate <= addDays(date, 3),
              )
              .reduce((n, b) => n + b.quantityMg, 0),
          );
          cost += priceMap.has(need.productId)
            ? (short * priceMap.get(need.productId)!) / 1000000
            : short > 0
              ? 500
              : 0;
        }
        const preference = settings.preferredTags.filter((t) =>
          choice.stored.tags.includes(t),
        ).length;
        const score =
          (Math.abs(choice.nutrition.totals.calories - cTarget) / cTarget) *
            1000000 +
          (Math.max(0, pTarget - choice.nutrition.totals.protein) /
            Math.max(pTarget, 1)) *
            600000 +
          (missing / Math.max(total, 1)) * 150000 -
          (soon / Math.max(total, 1)) * 100000 +
          cost * 20 +
          (used.get(choice.id) ?? 0) * 20000 -
          preference * 20000;
        if (score < bestScore) {
          best = choice;
          bestScore = score;
        }
      }
      meals.push({
        date,
        slot,
        recipeId: best.id,
        servingsMilli: best.servingsMilli,
        stored: best.stored,
      });
      calories += best.nutrition.totals.calories;
      protein += best.nutrition.totals.protein;
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
      for (const need of best.nutrition.stocks)
        allocate(
          inventory.get(need.productId) ?? [],
          need.productId,
          need.quantityMg,
          date > today ? date : today,
        );
    }
  }
  return meals;
}
