import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/lib/db";
import { migrateFixture } from "./migrations";
import { saveProduct, addBatch } from "../src/lib/inventory";
import { saveFoodLog, deleteFoodLog, saveWeight, deleteWeight, saveSettings } from "../src/lib/nutrition-diary";
import { calculateSnapshot, productSnapshot } from "../src/lib/nutrition-snapshot";
let dir: string, client: ReturnType<typeof createDatabase>, url: string, productId: string;
const actor = { userId: "owner", householdId: "home" }, family = { userId: "family", householdId: "home" }, stranger = { userId: "stranger", householdId: "elsewhere" };
const TODAY = "2026-10-24";
const request = () => ({ requestKey: randomUUID(), confirmed: true as const });
const product = (overrides = {}) => ({ name: "Zob TEST", brand: "", barcode: "", category: "Žitarice", calories: "370", protein: "13", carbs: "60", fat: "7", fiber: "10", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "0", estimatedNutrition: false, ...overrides });
const food = (overrides = {}) => ({ ...request(), id: "", version: 0, date: TODAY, sourceType: "PRODUCT", sourceId: productId, quantity: "100", unit: "G", foodState: "RAW", yield: "", yieldConfirmed: false, estimated: false, deductInventory: false, confirmedStock: false, ...overrides });
const weight = (overrides = {}) => ({ ...request(), id: "", version: 0, date: TODAY, weight: "81,234", ...overrides });
const settings = (overrides = {}) => ({ ...request(), version: 0, calories: "2200", protein: "120,5", carbs: "260", fat: "75", mealCount: 3, weeklyBudget: "65,99", preferences: "visoki udio proteina\nvisoki udio proteina\nbez alkohola", excluded: "kikiriki", timezone: "Europe/Zagreb", ...overrides });
async function stock(id = productId, amount = "500") { await addBatch(client, actor, { ...request(), productId: id, quantity: amount, unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" }); }
async function recipe(secondId?: string) {
  return client.recipe.create({ data: { householdId: actor.householdId, title: "Testni recept", instructions: "Test", servingsMilli: 2000, preparationMinutes: 5, cookingMinutes: 10,
    ingredients: { create: [{ productId, quantityMg: 200000 }, ...(secondId ? [{ productId: secondId, quantityMg: 100000 }] : [])] } } });
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "nutrihome-nutrition-")); const path = join(dir, "test.db"); url = `file:${path}`;
  const raw = new Sqlite(path); raw.pragma("journal_mode = WAL"); migrateFixture(raw); raw.close(); client = createDatabase(url);
  await client.household.create({ data: { id: actor.householdId, name: "Test", users: { create: [{ id: actor.userId, username: "owner", passwordHash: "test-only", settings: { create: {} } }, { id: family.userId, username: "family", passwordHash: "test-only", settings: { create: {} } }] } } });
  await client.household.create({ data: { id: stranger.householdId, name: "Other", users: { create: { id: stranger.userId, username: "stranger", passwordHash: "test-only" } } } });
  productId = await saveProduct(client, actor, product());
});
afterEach(async () => { await client.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
describe("food diary snapshots", () => {
  it("calculates food exactly, preserves entered units, and leaves stock alone by default", async () => {
    await stock();
    const result = await saveFoodLog(client, actor, food({ quantity: "75" }), TODAY);
    const log = await client.foodLog.findUniqueOrThrow({ where: { id: result.targetId } });
    expect(log).toMatchObject({ quantityMilli: 75000, enteredQuantity: "75", enteredUnit: "G", sourceName: "Zob TEST", calculatedCaloriesCenti: 27750, calculatedProteinCenti: 975, calculatedCarbsCenti: 4500, calculatedFatCenti: 525, calculatedFiberCenti: 750, inventoryDeducted: false });
    expect(JSON.parse(log.nutritionSnapshot!).per100g.calories).toBe(37000);
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(500000);
    expect(await client.inventoryOperation.count()).toBe(1);
  });
  it("never recalculates history from edited catalogue data, including after quantity edits", async () => {
    const added = await saveFoodLog(client, actor, food(), TODAY);
    await saveProduct(client, actor, product({ name: "Drugi naziv", calories: "100", protein: "1", nutritionState: "COOKED" }), productId);
    expect((await client.foodLog.findUniqueOrThrow({ where: { id: added.targetId } })).calculatedCaloriesCenti).toBe(37000);
    await saveFoodLog(client, actor, food({ id: added.targetId, quantity: "150", date: "2026-10-23" }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: added.targetId } })).toMatchObject({ sourceName: "Zob TEST", calculatedCaloriesCenti: 55500, calculatedProteinCenti: 1950, foodState: "RAW", version: 1, date: "2026-10-23" });
    await expect(saveFoodLog(client, actor, food({ id: added.targetId, version: 0 }), TODAY)).rejects.toThrow("promijenjen");
  });
  it("converts cooked mass only with a confirmed measured yield, including the reverse direction", async () => {
    await stock();
    await expect(saveFoodLog(client, actor, food({ foodState: "COOKED", quantity: "250" }), TODAY)).rejects.toThrow("omjer");
    await expect(saveFoodLog(client, actor, food({ foodState: "COOKED", quantity: "250", yield: "2,5" }), TODAY)).rejects.toThrow("omjer");
    const result = await saveFoodLog(client, actor, food({ foodState: "COOKED", quantity: "250", yield: "2,5", yieldConfirmed: true, deductInventory: true, confirmedStock: true }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: result.targetId } })).toMatchObject({ quantityMilli: 250000, yieldMilli: 2500, foodState: "COOKED", calculatedCaloriesCenti: 37000, estimatedNutrition: true });
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(400000);
    const cookedId = await saveProduct(client, actor, product({ name: "Kuhana namirnica", nutritionState: "COOKED", calories: "130" }));
    const reverse = await saveFoodLog(client, actor, food({ sourceId: cookedId, foodState: "RAW", yield: "3", yieldConfirmed: true }), TODAY);
    expect((await client.foodLog.findUniqueOrThrow({ where: { id: reverse.targetId } })).calculatedCaloriesCenti).toBe(39000);
  });
  it("preserves raw/cooked identity of products with stock", async () => {
    await stock();
    await expect(saveProduct(client, actor, product({ nutritionState: "COOKED" }), productId)).rejects.toThrow("ima zalihu");
  });
  it("uses saved density and marks estimated products/ingredients even when the manual flag is off", async () => {
    const milk = await saveProduct(client, actor, product({ name: "Mlijeko TEST", calories: "40", density: "1,03", estimatedNutrition: true }));
    await expect(saveFoodLog(client, actor, food({ sourceId: milk, quantity: "250", unit: "ML", foodState: "COOKED", yield: "2,5", yieldConfirmed: true }), TODAY)).rejects.toThrow("izvaganu masu");
    const entry = await saveFoodLog(client, actor, food({ sourceId: milk, quantity: "250", unit: "ML" }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: entry.targetId } })).toMatchObject({ quantityMilli: 257500, enteredUnit: "ML", calculatedCaloriesCenti: 10300, estimatedNutrition: true });
    const r = await recipe(milk);
    const portion = await saveFoodLog(client, actor, food({ sourceType: "RECIPE", sourceId: r.id, quantity: "1,5", unit: "SERVING" }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: portion.targetId } })).toMatchObject({ quantityMilli: 1500, calculatedCaloriesCenti: 58500, estimatedNutrition: true, foodState: "COOKED" });
  });
  it("takes fractional recipe ingredients from inventory atomically", async () => {
    await stock(); const r = await recipe();
    const entry = await saveFoodLog(client, actor, food({ sourceType: "RECIPE", sourceId: r.id, quantity: "1,5", unit: "SERVING", deductInventory: true, confirmedStock: true }), TODAY);
    expect((await client.foodLog.findUniqueOrThrow({ where: { id: entry.targetId } })).calculatedCaloriesCenti).toBe(55500);
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(350000);
    await client.recipe.update({ where: { id: r.id }, data: { title: "Promijenjeni recept", servingsMilli: 1000 } });
    await saveFoodLog(client, actor, food({ id: entry.targetId, sourceType: "RECIPE", sourceId: r.id, quantity: "1", unit: "SERVING" }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: entry.targetId } })).toMatchObject({ calculatedCaloriesCenti: 37000, sourceName: "Testni recept" });
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(350000);
  });
  it("rolls back all ingredients, the diary and receipts when any recipe stock is insufficient", async () => {
    await stock(); const second = await saveProduct(client, actor, product({ name: "Nedostaje u zalihi" })); const r = await recipe(second);
    await expect(saveFoodLog(client, actor, food({ sourceType: "RECIPE", sourceId: r.id, quantity: "1", unit: "SERVING", deductInventory: true, confirmedStock: true }), TODAY)).rejects.toThrow("Nema dovoljno");
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(500000);
    expect(await client.foodLog.count()).toBe(0); expect(await client.nutritionRequest.count()).toBe(0); expect(await client.inventoryOperation.count()).toBe(1);
  });
  it("does not repeat deductions, resurrect deleted records, or silently reverse stock on edit/delete", async () => {
    await stock(); const input = food({ deductInventory: true, confirmedStock: true });
    const first = await saveFoodLog(client, actor, input, TODAY);
    expect((await saveFoodLog(client, actor, input, TODAY)).replayed).toBe(true);
    await expect(saveFoodLog(client, actor, { ...input, quantity: "101" }, TODAY)).rejects.toThrow("drugu promjenu");
    await expect(saveFoodLog(client, actor, food({ id: first.targetId, deductInventory: true, confirmedStock: true }), TODAY)).rejects.toThrow("ponovno");
    await deleteFoodLog(client, actor, { ...request(), id: first.targetId, version: 0 });
    expect((await saveFoodLog(client, actor, input, TODAY)).replayed).toBe(true);
    expect(await client.foodLog.count()).toBe(0);
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(400000);
    expect(await client.inventoryTransaction.count()).toBe(2);
  });
  it("rolls back inventory if the final diary insert fails", async () => {
    await stock();
    await client.$executeRawUnsafe(`CREATE TRIGGER fail_diary_test BEFORE INSERT ON FoodLog BEGIN SELECT RAISE(ABORT,'test failure'); END`);
    await expect(saveFoodLog(client, actor, food({ deductInventory: true, confirmedStock: true }), TODAY)).rejects.toThrow();
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(500000);
    expect(await client.inventoryOperation.count()).toBe(1); expect(await client.nutritionRequest.count()).toBe(0);
  });
  it("validates explicit confirmation, dates, precision, quantities, source units and yield", async () => {
    for (const override of [{ confirmed: false }, { date: "2026-02-30" }, { date: "2026-10-25" }, { quantity: "-1" }, { quantity: "0" }, { quantity: "1.0001" }, { unit: "ML" }, { unit: "SERVING" }, { yield: "2" }, { deductInventory: true, confirmedStock: false }]) await expect(saveFoodLog(client, actor, food(override), TODAY)).rejects.toThrow();
    expect(await client.foodLog.count()).toBe(0); expect(await client.nutritionRequest.count()).toBe(0);
  });
  it("scales legacy stored totals without inventing current catalogue values", async () => {
    const old = await client.foodLog.create({ data: { userId: actor.userId, productId, date: TODAY, quantityMilli: 50000, calculatedCaloriesCenti: 12000, calculatedProteinCenti: 1000, calculatedCarbsCenti: 2000, calculatedFatCenti: 300 } });
    await saveFoodLog(client, actor, food({ id: old.id, quantity: "100" }), TODAY);
    expect(await client.foodLog.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ calculatedCaloriesCenti: 24000, calculatedProteinCenti: 2000, estimatedNutrition: true });
  });
  it("deduplicates concurrent diary requests and prevents stock overselling across clients", async () => {
    await stock(productId, "100"); const second = createDatabase(url);
    try {
      const input = food({ deductInventory: true, confirmedStock: true });
      const saved = await Promise.all([saveFoodLog(client, actor, input, TODAY), saveFoodLog(second, actor, input, TODAY)]);
      expect(saved[0].targetId).toBe(saved[1].targetId); expect(await client.foodLog.count()).toBe(1);
      await expect(saveFoodLog(second, actor, food({ deductInventory: true, confirmedStock: true }), TODAY)).rejects.toThrow("Nema dovoljno");
      expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(0);
    } finally { await second.$disconnect(); }
  }, 30000);
});
describe("private weight and settings records", () => {
  it("creates, edits and deletes exact weight without silently replacing another measurement", async () => {
    const input = weight(); const created = await saveWeight(client, actor, input, TODAY);
    expect((await saveWeight(client, actor, input, TODAY)).replayed).toBe(true);
    await expect(saveWeight(client, actor, weight({ weight: "90" }), TODAY)).rejects.toMatchObject({ code: "P2002" });
    await saveWeight(client, actor, weight({ id: created.targetId, weight: "81.235" }), TODAY);
    expect(await client.weightLog.findUniqueOrThrow({ where: { id: created.targetId } })).toMatchObject({ weightG: 81235, version: 1 });
    await expect(saveWeight(client, actor, weight({ id: created.targetId }), TODAY)).rejects.toThrow("promijenjeno");
    await deleteWeight(client, actor, { ...request(), id: created.targetId, version: 1 });
    await saveWeight(client, actor, input, TODAY); expect(await client.weightLog.count()).toBe(0);
  });
  it("rejects invalid weights, future dates and unconfirmed mutations", async () => {
    for (const values of [{ weight: "0" }, { weight: "-1" }, { weight: "1001" }, { weight: "81.0001" }, { date: "2026-02-30" }, { date: "2026-10-25" }, { confirmed: false }]) await expect(saveWeight(client, actor, weight(values), TODAY)).rejects.toThrow();
    expect(await client.weightLog.count()).toBe(0);
  });
  it("saves user-chosen targets/preferences exactly, and refuses stale settings", async () => {
    const input = settings(); await saveSettings(client, actor, input); await saveSettings(client, actor, input);
    const current = await client.userSettings.findUniqueOrThrow({ where: { userId: actor.userId } });
    expect(current).toMatchObject({ calorieTargetCenti: 220000, proteinTargetCenti: 12050, weeklyBudgetCents: 6599, goalsConfirmed: true, version: 1, dietaryPreferences: '["visoki udio proteina","bez alkohola"]', excludedIngredients: '["kikiriki"]' });
    await expect(saveSettings(client, actor, settings())).rejects.toThrow("međuvremenu");
    await saveSettings(client, stranger, settings());
    expect((await client.userSettings.findUniqueOrThrow({ where: { userId: stranger.userId } })).version).toBe(1);
    await expect(saveSettings(client, stranger, settings())).rejects.toThrow("međuvremenu");
    for (const values of [{ confirmed: false }, { calories: "0" }, { protein: "-1" }, { mealCount: 0 }, { timezone: "UTC" }, { preferences: Array.from({ length: 51 }, (_, i) => `pojam${i}`).join("\n") }]) await expect(saveSettings(client, actor, settings({ ...values, version: 1 }))).rejects.toThrow();
  });
  it("keeps diaries/weights/settings private even within the same household", async () => {
    const log = await saveFoodLog(client, actor, food(), TODAY), measurement = await saveWeight(client, actor, weight(), TODAY);
    await expect(saveFoodLog(client, family, food({ id: log.targetId }), TODAY)).rejects.toThrow("dostupan");
    await expect(deleteFoodLog(client, family, { ...request(), id: log.targetId, version: 0 })).rejects.toThrow();
    await expect(saveWeight(client, family, weight({ id: measurement.targetId }), TODAY)).rejects.toThrow();
    await expect(deleteWeight(client, family, { ...request(), id: measurement.targetId, version: 0 })).rejects.toThrow();
    await saveSettings(client, family, settings({ calories: "2500" }));
    expect((await client.userSettings.findUniqueOrThrow({ where: { userId: actor.userId } })).goalsConfirmed).toBe(false);
    expect(await client.foodLog.count()).toBe(1); expect(await client.weightLog.count()).toBe(1);
    await expect(saveFoodLog(client, stranger, food(), TODAY)).rejects.toThrow("kućanstvu");
    await expect(saveSettings(client, { ...actor, householdId: stranger.householdId }, settings())).rejects.toThrow("Pristup");
    await expect(saveFoodLog(client, actor, { ...food(), userId: family.userId }, TODAY)).rejects.toThrow();
  });
  it("rejects foreign and empty recipes and altered source IDs", async () => {
    const foreign = await saveProduct(client, stranger, product());
    const empty = await client.recipe.create({ data: { householdId: actor.householdId, title: "Prazan TEST recept", instructions: "Test", servingsMilli: 1000, preparationMinutes: 0, cookingMinutes: 0 } });
    await expect(saveFoodLog(client, actor, food({ sourceType: "RECIPE", sourceId: empty.id, unit: "SERVING" }), TODAY)).rejects.toThrow("Recept");
    const r = await recipe(foreign);
    await expect(saveFoodLog(client, actor, food({ sourceType: "RECIPE", sourceId: r.id, unit: "SERVING" }), TODAY)).rejects.toThrow("Recept");
    const first = await saveFoodLog(client, actor, food(), TODAY);
    await expect(saveFoodLog(client, actor, food({ id: first.targetId, sourceId: foreign }), TODAY)).rejects.toThrow("Izvor");
  });
});
it("rounds recipe nutrition only after summing fractional ingredient contributions", async () => {
  const p = await client.foodProduct.findUniqueOrThrow({ where: { id: productId } });
  const snapshot = productSnapshot(p); snapshot.per100g = { calories: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const calculated = calculateSnapshot({ kind: "recipe", version: 1, sourceId: "r", name: "Test", state: "RAW", estimated: false, servingsMilli: 1000,
    ingredients: [{ productId: "a", quantityMg: 49000, product: snapshot }, { productId: "b", quantityMg: 49000, product: snapshot }] }, { quantity: "1", unit: "SERVING", foodState: "RAW", yield: "", yieldConfirmed: false, estimated: false });
  expect(calculated.totals.calories).toBe(1);
});
it("upgrades phase 2 records without changing existing food totals, weights, or targets", () => {
  const raw = new Sqlite(":memory:");
  try {
    for (const name of ["20261024000000_foundation", "20261024010000_inventory_operations"]) raw.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
    raw.exec(`INSERT INTO Household (id,name) VALUES ('h','T'); INSERT INTO User (id,householdId,username,passwordHash) VALUES ('u','h','test','test-only'); INSERT INTO FoodProduct (id,householdId,name,category,caloriesPer100gCenti,proteinPer100gCenti,carbsPer100gCenti,fatPer100gCenti,updatedAt) VALUES ('p','h','P','C',100,1,1,1,CURRENT_TIMESTAMP); INSERT INTO FoodLog (id,userId,date,productId,quantityMilli,calculatedCaloriesCenti,calculatedProteinCenti,calculatedCarbsCenti,calculatedFatCenti) VALUES ('f','u','2026-10-24','p',12345,22222,333,444,555); INSERT INTO WeightLog (id,userId,date,weightG) VALUES ('w','u','2026-10-24',81234); INSERT INTO UserSettings (id,userId,calorieTargetCenti) VALUES ('s','u',234500)`);
    raw.exec(readFileSync("prisma/migrations/20261024020000_nutrition_diary/migration.sql", "utf8"));
    expect(raw.prepare("SELECT calculatedCaloriesCenti,version,nutritionSnapshot,calculatedFiberCenti FROM FoodLog").get()).toEqual({ calculatedCaloriesCenti: 22222, version: 0, nutritionSnapshot: null, calculatedFiberCenti: null });
    expect(raw.prepare("SELECT weightG,version FROM WeightLog").get()).toEqual({ weightG: 81234, version: 0 });
    expect(raw.prepare("SELECT calorieTargetCenti FROM UserSettings").get()).toEqual({ calorieTargetCenti: 234500 });
    expect(raw.pragma("foreign_key_check")).toEqual([]);
  } finally { raw.close(); }
});
