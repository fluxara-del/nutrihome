import { beforeEach, afterEach, it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/lib/db";
import { migrateFixture } from "./migrations";
import { saveProduct, addBatch } from "../src/lib/inventory";
import {
  saveRecipe,
  archiveRecipe,
  recipeInclude,
  servingNutrition,
  snapshotRecipe,
  listRecipes,
} from "../src/lib/recipes";
import {
  generatePlan,
  regenerateMeal,
  changeMeal,
  approvePlan,
  reopenPlan,
  loadPlan,
  savePlanningPrice,
  storedRecipe,
} from "../src/lib/meal-plans";
import {
  generateMeals,
  evaluatePlan,
  recipeAllowed,
  planSettings,
  type PlanSettings,
} from "../src/lib/plan-engine";
import { nextWeekStart, localDate, addDays } from "../src/lib/calendar";
let dir: string,
  client: ReturnType<typeof createDatabase>,
  productId: string,
  recipeId: string;
const actor = { userId: "owner", householdId: "home" },
  other = { userId: "other", householdId: "other-home" };
const confirmation = () => ({ requestKey: randomUUID(), confirmed: true });
const settings: PlanSettings = {
  version: 1,
  calories: 200000,
  protein: 10000,
  mealCount: 3,
  budget: 2000,
  requiredTags: [],
  preferredTags: [],
  excluded: [],
  under20: false,
};
const recipeInput = () => ({
  ...confirmation(),
  id: "",
  version: 0,
  title: "Zobena kaša",
  instructions: "Izvagati i pomiješati sastojke.",
  servings: "2",
  preparationMinutes: 5,
  cookingMinutes: 0,
  tags: ["VEGAN"],
  ingredients: [{ productId, grams: "200" }],
});
async function recipe() {
  return client.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    include: recipeInclude,
  });
}
async function generated() {
  const input = { ...confirmation(), weekStart: nextWeekStart(), version: 0 };
  return { id: await generatePlan(client, actor, input), input };
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "nutrihome-phase4-"));
  const path = join(dir, "test.db"),
    raw = new Sqlite(path);
  migrateFixture(raw);
  raw.close();
  client = createDatabase(`file:${path}`);
  for (const a of [actor, other])
    await client.household.create({
      data: {
        id: a.householdId,
        name: "Test",
        users: {
          create: {
            id: a.userId,
            username: a.userId,
            passwordHash: "test-only",
          },
        },
      },
    });
  await client.user.create({
    data: {
      id: "member",
      householdId: actor.householdId,
      username: "member",
      passwordHash: "test",
    },
  });
  await client.userSettings.create({
    data: {
      userId: actor.userId,
      goalsConfirmed: true,
      version: 1,
      weeklyBudgetCents: 2000,
    },
  });
  productId = await saveProduct(client, actor, {
    name: "Zobene pahuljice",
    brand: "",
    barcode: "",
    category: "Žitarice",
    calories: "400",
    protein: "20",
    carbs: "60",
    fat: "5",
    fiber: "10",
    defaultUnit: "G",
    density: "",
    pieceWeight: "",
    lowStock: "0",
    estimatedNutrition: false,
  });
  recipeId = await saveRecipe(client, actor, recipeInput());
});
afterEach(async () => {
  await client.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
it("computes fractional portions from total ingredient mass and preserves unknown fibre", async () => {
  const r = await recipe();
  expect(servingNutrition(snapshotRecipe(r), 1500).totals).toMatchObject({
    calories: 60000,
    protein: 3000,
    fiber: 1500,
  });
  r.ingredients[0].product.fiberKnown = false;
  expect(servingNutrition(snapshotRecipe(r)).fiberKnown).toBe(false);
  r.cookingMinutes = 10;
  expect(servingNutrition(snapshotRecipe(r)).estimated).toBe(true);
});
it("scopes recipes, rejects duplicate ingredients and requires explicit confirmation", async () => {
  await expect(saveRecipe(client, other, recipeInput())).rejects.toThrow(
    "kućanstva",
  );
  await expect(
    saveRecipe(client, actor, { ...recipeInput(), confirmed: false }),
  ).rejects.toThrow();
  await expect(
    saveRecipe(client, actor, {
      ...recipeInput(),
      ingredients: [
        { productId, grams: "1" },
        { productId, grams: "2" },
      ],
    }),
  ).rejects.toThrow("jednom");
  expect((await listRecipes(client, other)).count).toBe(0);
});
it("replays identical recipe requests and rejects conflicting or stale edits", async () => {
  const input = {
    ...recipeInput(),
    id: recipeId,
    version: 1,
    title: "Nova kaša",
  };
  await saveRecipe(client, actor, input);
  await saveRecipe(client, actor, input);
  expect((await recipe()).version).toBe(2);
  await expect(
    saveRecipe(client, actor, { ...input, title: "Drugo" }),
  ).rejects.toThrow("iskorišten");
  await expect(
    saveRecipe(client, actor, { ...input, ...confirmation() }),
  ).rejects.toThrow("promijenjen");
});
it("archives without deleting records and search normalizes Croatian accents", async () => {
  expect((await listRecipes(client, actor, "kasa")).count).toBe(1);
  await archiveRecipe(client, actor, {
    ...confirmation(),
    id: recipeId,
    version: 1,
    archived: true,
  });
  expect((await listRecipes(client, actor)).count).toBe(0);
  expect((await recipe()).ingredients).toHaveLength(1);
  await expect(generated()).rejects.toThrow("Nema aktivnih");
});
it("generates deterministic complete plans for 1, 2, 3 and 12 daily slots", async () => {
  const r = { id: recipeId, stored: storedRecipe(await recipe()) };
  for (const count of [1, 2, 3, 12]) {
    const s = { ...settings, mealCount: count };
    const a = generateMeals(nextWeekStart(), [r], s, [], [], localDate());
    expect(a).toHaveLength(count * 7);
    expect(generateMeals(nextWeekStart(), [r], s, [], [], localDate())).toEqual(
      a,
    );
    expect(
      evaluatePlan(nextWeekStart(), a, s, [], [], localDate()).days,
    ).toHaveLength(7);
  }
});
it("enforces dietary and excluded terms, rejects unsupported preferences", async () => {
  const stored = storedRecipe(await recipe());
  expect(
    recipeAllowed(stored, { ...settings, requiredTags: ["VEGETARIAN"] }),
  ).toBe(true);
  expect(
    recipeAllowed(stored, { ...settings, requiredTags: ["GLUTEN_FREE"] }),
  ).toBe(false);
  expect(recipeAllowed(stored, { ...settings, excluded: ["zitarice"] })).toBe(
    false,
  );
  const u = await client.userSettings.findUniqueOrThrow({
    where: { userId: actor.userId },
  });
  expect(() =>
    planSettings({ ...u, dietaryPreferences: '["unrecognized"]' }),
  ).toThrow("nije podržana");
  expect(() => planSettings({ ...u, goalsConfirmed: false })).toThrow(
    "potvrdi",
  );
});
it("allocates expiring stock cumulatively without treating unknown prices as zero", async () => {
  const stored = storedRecipe(await recipe()),
    week = nextWeekStart();
  const meals = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(week, i),
    slot: 0,
    recipeId,
    servingsMilli: 1000,
    stored,
  }));
  const s = { ...settings, mealCount: 1 };
  const stock = [
    {
      id: "x",
      productId,
      quantityMg: 200000,
      expirationDate: week,
      createdAt: new Date(),
    },
  ];
  const r = evaluatePlan(week, meals, s, stock, [], localDate());
  expect(r.shortfalls[0].missingMg).toBe(600000);
  expect(r.additionalCostEstimateCents).toBeNull();
  expect(r.budgetStatus).toBe("UNKNOWN");
  expect(stock[0].quantityMg).toBe(200000);
  const priced = evaluatePlan(
    week,
    meals,
    s,
    stock,
    [{ productId, centsPerKg: 301 }],
    localDate(),
  );
  expect(priced.additionalCostEstimateCents).toBe(181);
  expect(
    evaluatePlan(
      week,
      meals,
      { ...s, budget: 100 },
      stock,
      [{ productId, centsPerKg: 301 }],
      localDate(),
    ).budgetStatus,
  ).toBe("ESTIMATE_OVER");
});
it("preserves stock, food logs and receipt counts when replaying plan creation", async () => {
  await addBatch(client, actor, {
    ...confirmation(),
    productId,
    quantity: "500",
    unit: "G",
    storageLocation: "PANTRY",
    expirationDate: "",
    purchaseDate: "",
    purchasePrice: "",
  });
  const before = await client.inventoryBatch.findMany();
  const { id, input } = await generated();
  expect(await generatePlan(client, actor, input)).toBe(id);
  expect(await client.plannedMeal.count({ where: { mealPlanId: id } })).toBe(
    21,
  );
  expect(await client.inventoryBatch.findMany()).toEqual(before);
  expect(await client.foodLog.count()).toBe(0);
  expect(await client.mealPlan.count()).toBe(1);
});
it("checks owner, household, plan revision, and applies selected portions", async () => {
  const { id } = await generated(),
    meal = await client.plannedMeal.findFirstOrThrow({
      where: { mealPlanId: id },
    });
  const input = {
    ...confirmation(),
    planId: id,
    version: 1,
    mealId: meal.id,
    recipeId,
    servings: "1.25",
  };
  await expect(changeMeal(client, other, input)).rejects.toThrow();
  await expect(
    changeMeal(client, { userId: "member", householdId: "home" }, input),
  ).rejects.toThrow();
  await changeMeal(client, actor, input);
  expect(
    (await client.plannedMeal.findUniqueOrThrow({ where: { id: meal.id } }))
      .servingsMilli,
  ).toBe(1250);
  await expect(
    changeMeal(client, actor, { ...input, ...confirmation() }),
  ).rejects.toThrow();
  expect((await loadPlan(client, other, nextWeekStart())).plan).toBeNull();
});
it("requires warning acceptance, freezes approved report, and explicitly reopens", async () => {
  const { id } = await generated();
  const input = {
    ...confirmation(),
    planId: id,
    version: 1,
    acceptWarnings: false,
  };
  await expect(approvePlan(client, actor, input)).rejects.toThrow("upozorenja");
  await approvePlan(client, actor, {
    ...input,
    ...confirmation(),
    acceptWarnings: true,
  });
  const approved = await client.mealPlan.findUniqueOrThrow({ where: { id } });
  expect(approved.status).toBe("APPROVED");
  await savePlanningPrice(client, actor, {
    ...confirmation(),
    productId,
    version: 0,
    eurosPerKg: "10",
  });
  expect((await loadPlan(client, actor, nextWeekStart())).report).toEqual(
    JSON.parse(approved.approvedReport!),
  );
  await expect(
    generatePlan(client, actor, {
      ...confirmation(),
      weekStart: nextWeekStart(),
      version: 2,
    }),
  ).rejects.toThrow();
  await reopenPlan(client, actor, {
    ...confirmation(),
    planId: id,
    version: 2,
  });
  expect(
    (await client.mealPlan.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("DRAFT");
  expect(await client.foodLog.count()).toBe(0);
  expect(await client.inventoryBatch.count()).toBe(0);
});
it("blocks approval after recipe, product or goal changes", async () => {
  const { id } = await generated();
  await client.foodProduct.update({
    where: { id: productId },
    data: { proteinPer100gCenti: 2100 },
  });
  expect((await loadPlan(client, actor, nextWeekStart())).stale).toBe(true);
  await expect(
    approvePlan(client, actor, {
      ...confirmation(),
      planId: id,
      version: 1,
      acceptWarnings: true,
    }),
  ).rejects.toThrow("promijenjeni");
  await generatePlan(client, actor, {
    ...confirmation(),
    weekStart: nextWeekStart(),
    version: 1,
  });
  await client.userSettings.update({
    where: { userId: actor.userId },
    data: { version: { increment: 1 } },
  });
  await expect(
    approvePlan(client, actor, {
      ...confirmation(),
      planId: id,
      version: 2,
      acceptWarnings: true,
    }),
  ).rejects.toThrow("promijenjeni");
});
it("validates dates and scoped, optimistic price estimates", async () => {
  await expect(
    generatePlan(client, actor, {
      ...confirmation(),
      weekStart: "2026-99-99",
      version: 0,
    }),
  ).rejects.toThrow("Datum");
  await expect(
    savePlanningPrice(client, other, {
      ...confirmation(),
      productId,
      version: 0,
      eurosPerKg: "2",
    }),
  ).rejects.toThrow("dostupan");
  const input = {
    ...confirmation(),
    productId,
    version: 0,
    eurosPerKg: "2.49",
  };
  await savePlanningPrice(client, actor, input);
  await savePlanningPrice(client, actor, input);
  expect(
    (await client.planningPrice.findUniqueOrThrow({ where: { productId } }))
      .centsPerKg,
  ).toBe(249);
  await expect(
    savePlanningPrice(client, actor, { ...input, ...confirmation() }),
  ).rejects.toThrow("promijenjena");
});
it("clearing a price preserves its revision so stale forms cannot overwrite a new price", async () => {
  await savePlanningPrice(client, actor, {
    ...confirmation(),
    productId,
    version: 0,
    eurosPerKg: "2",
  });
  await savePlanningPrice(client, actor, {
    ...confirmation(),
    productId,
    version: 1,
    eurosPerKg: "",
  });
  expect(
    (await client.planningPrice.findUniqueOrThrow({ where: { productId } }))
      .centsPerKg,
  ).toBeNull();
  await expect(
    savePlanningPrice(client, actor, {
      ...confirmation(),
      productId,
      version: 1,
      eurosPerKg: "9",
    }),
  ).rejects.toThrow("promijenjena");
});
it("rejects incomplete or duplicate slots and portions beyond numeric boundaries", async () => {
  const r = { id: recipeId, stored: storedRecipe(await recipe()) };
  const meals = generateMeals(
    nextWeekStart(),
    [r],
    settings,
    [],
    [],
    localDate(),
  );
  expect(() =>
    evaluatePlan(
      nextWeekStart(),
      meals.slice(1),
      settings,
      [],
      [],
      localDate(),
    ),
  ).toThrow("sedam");
  expect(() =>
    evaluatePlan(
      nextWeekStart(),
      [meals[0], ...meals.slice(0, -1)],
      settings,
      [],
      [],
      localDate(),
    ),
  ).toThrow("redoslijed");
  await expect(
    saveRecipe(client, actor, { ...recipeInput(), servings: "0" }),
  ).rejects.toThrow();
  await expect(
    saveRecipe(client, actor, {
      ...recipeInput(),
      ingredients: [{ productId, grams: "2147484" }],
    }),
  ).rejects.toThrow();
});
it("measures the bounded 500-recipe planner against 1000 stock batches", async () => {
  const stored = storedRecipe(await recipe());
  const recipes = Array.from({ length: 500 }, (_, i) => ({
    id: `r${String(i).padStart(3, "0")}`,
    stored: {
      ...stored,
      nutrition: { ...stored.nutrition, name: `Recipe ${i}` },
    },
  }));
  const stocks = Array.from({ length: 1000 }, (_, i) => ({
    id: `b${i}`,
    productId: i < 20 ? productId : `unrelated${i}`,
    quantityMg: 100000,
    expirationDate: null,
    createdAt: new Date(0),
  }));
  const started = performance.now();
  const meals = generateMeals(
    nextWeekStart(),
    recipes,
    settings,
    stocks,
    [],
    localDate(),
  );
  expect(meals).toHaveLength(21);
  console.log(
    `Phase 4 planner: 500 recipes, 1000 batches, 21 slots: ${Math.round(performance.now() - started)} ms`,
  );
});
it("regenerates one meal with a different permitted recipe and leaves all other slots intact", async () => {
  const { id } = await generated(),
    before = await client.plannedMeal.findMany({
      where: { mealPlanId: id },
      orderBy: [{ date: "asc" }, { slot: "asc" }],
    });
  await expect(
    regenerateMeal(client, actor, {
      ...confirmation(),
      planId: id,
      version: 1,
      mealId: before[0].id,
    }),
  ).rejects.toThrow("Nema drugog");
  const second = await saveRecipe(client, actor, {
    ...recipeInput(),
    title: "Alternativa",
    ingredients: [{ productId, grams: "180" }],
  });
  await regenerateMeal(client, actor, {
    ...confirmation(),
    planId: id,
    version: 1,
    mealId: before[0].id,
  });
  const after = await client.plannedMeal.findMany({
    where: { mealPlanId: id },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });
  expect(after[0].recipeId).toBe(second);
  expect(after.slice(1)).toEqual(before.slice(1));
  expect(await client.foodLog.count()).toBe(0);
});
