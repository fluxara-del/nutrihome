import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { consumeProductInTransaction, type InventoryActor } from "./inventory";
import { productSnapshot, legacySnapshot, calculateSnapshot, type NutritionSnapshot, type RecipeSnapshot } from "./nutrition-snapshot";
import { NutritionError, parseNutrition, foodSchema, weightSchema, deleteSchema, settingsSchema, numberFixed, actualDate, lines } from "./nutrition-input";
import { localDate } from "./calendar";
import { InventoryError } from "./inventory-input";
type Tx = Prisma.TransactionClient;
export const defaultSettings = { calorieTargetCenti: 200000, proteinTargetCenti: 10000, fatTargetCenti: 7000, carbohydrateTargetCenti: 25000, mealCount: 3, weeklyBudgetCents: null as number | null, dietaryPreferences: "[]", excludedIngredients: "[]", timezone: "Europe/Zagreb", goalsConfirmed: false, version: 0 };
export async function authorizeNutrition(client: Tx, actor: InventoryActor) {
  if (!await client.user.findFirst({ where: { id: actor.userId, householdId: actor.householdId }, select: { id: true } })) throw new NutritionError("Pristup nije dopušten.");
}
const code = (error: unknown) => (error as { code?: string })?.code;
export function nutritionMessage(error: unknown) {
  if (error instanceof NutritionError || error instanceof InventoryError) return error.message;
  if (code(error) === "P2002") return "Za taj datum već postoji mjerenje. Uredite postojeći zapis.";
  return "Promjena nije spremljena. Osvježite podatke i pokušajte ponovno.";
}
export type NutritionResult = { targetId: string; requestId: string; replayed: boolean };
async function request(client: PrismaClient, actor: InventoryActor, kind: string, input: { requestKey: string }, targetId: string, apply: (tx: Tx, id: string, receiptId: string) => Promise<void>): Promise<NutritionResult> {
  const requestHash = createHash("sha256").update(JSON.stringify({ kind, input })).digest("hex"), key = { userId: actor.userId, requestKey: input.requestKey };
  const replay = (receipt: { id: string; targetId: string; requestHash: string }): NutritionResult => {
    if (receipt.requestHash !== requestHash) throw new NutritionError("Isti zahtjev već je upotrijebljen za drugu promjenu. Osvježite obrazac.");
    return { targetId: receipt.targetId, requestId: receipt.id, replayed: true };
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        await authorizeNutrition(tx, actor);
        const previous = await tx.nutritionRequest.findUnique({ where: { userId_requestKey: key } });
        if (previous) return replay(previous);
        const receipt = await tx.nutritionRequest.create({ data: { ...key, kind, targetId, requestHash } });
        await apply(tx, targetId, receipt.id);
        return { targetId, requestId: receipt.id, replayed: false };
      }, { timeout: 15000 });
    } catch (error) {
      if (code(error) === "P2002") {
        const previous = await client.nutritionRequest.findUnique({ where: { userId_requestKey: key } });
        if (previous) return replay(previous);
      }
      const busy = ["P2034", "P1008"].includes(code(error) ?? "") || /SQLITE_BUSY|database is locked/i.test(error instanceof Error ? error.message : "");
      if (!busy) throw error;
      if (attempt >= 2) throw new NutritionError("Podaci se upravo mijenjaju. Pokušajte ponovno s istim obrascem.");
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
async function snapshotFor(tx: Tx, actor: InventoryActor, sourceType: "PRODUCT" | "RECIPE", sourceId: string): Promise<NutritionSnapshot> {
  if (sourceType === "PRODUCT") {
    const product = await tx.foodProduct.findFirst({ where: { id: sourceId, householdId: actor.householdId } });
    if (!product) throw new NutritionError("Proizvod nije dostupan u ovom kućanstvu.");
    return productSnapshot(product);
  }
  const recipe = await tx.recipe.findFirst({ where: { id: sourceId, householdId: actor.householdId, archived: false }, include: { ingredients: { orderBy: { id: "asc" }, include: { product: true } } } });
  if (!recipe || !recipe.ingredients.length || recipe.ingredients.some(item => item.product.householdId !== actor.householdId)) throw new NutritionError("Recept nije dostupan ili nema ispravne sastojke.");
  return { kind: "recipe", version: 1, sourceId: recipe.id, name: recipe.title, state: recipe.cookingMinutes > 0 ? "COOKED" : "RAW", servingsMilli: recipe.servingsMilli,
    estimated: recipe.ingredients.some(item => item.product.estimatedNutrition || !item.product.fiberKnown) || recipe.cookingMinutes > 0 && recipe.ingredients.some(item => item.product.nutritionState === "RAW"), ingredients: recipe.ingredients.map(item => ({ productId: item.productId, quantityMg: item.quantityMg, product: productSnapshot(item.product) })) } satisfies RecipeSnapshot;
}
export async function saveFoodLog(client: PrismaClient, actor: InventoryActor, raw: unknown, today = localDate()) {
  const input = parseNutrition(foodSchema, raw); actualDate(input.date, today);
  if (input.id && input.deductInventory) throw new NutritionError("Uređivanje dnevnika ne oduzima ponovno zalihe. Ispravak zalihe napravite u Zalihama.");
  if (input.deductInventory && !input.confirmedStock) throw new NutritionError("Zasebno potvrdite oduzimanje iz zaliha.");
  return request(client, actor, input.id ? "FOOD_UPDATE" : "FOOD_CREATE", input, input.id || randomUUID(), async (tx, targetId, receiptId) => {
    let snapshot: NutritionSnapshot;
    if (input.id) {
      const old = await tx.foodLog.findFirst({ where: { id: input.id, userId: actor.userId }, include: { product: { select: { name: true } }, recipe: { select: { title: true } } } });
      if (!old || old.version !== input.version) throw new NutritionError("Unos nije dostupan ili je u međuvremenu promijenjen.");
      if (input.sourceId !== (old.productId ?? old.recipeId) || input.sourceType !== (old.productId ? "PRODUCT" : "RECIPE")) throw new NutritionError("Izvor postojećeg unosa ne može se zamijeniti. Dodajte novi unos.");
      snapshot = old.nutritionSnapshot ? JSON.parse(old.nutritionSnapshot) as NutritionSnapshot : legacySnapshot(old, old.sourceName ?? old.product?.name ?? old.recipe?.title ?? "Raniji unos");
    } else snapshot = await snapshotFor(tx, actor, input.sourceType, input.sourceId);
    const calculation = calculateSnapshot(snapshot, input), { totals } = calculation;
    const data = { date: input.date, enteredQuantity: input.quantity, enteredUnit: input.unit, quantityMilli: calculation.quantityMilli, foodState: calculation.foodState, estimatedNutrition: calculation.estimated, sourceName: snapshot.name,
      nutritionSnapshot: JSON.stringify(snapshot), yieldMilli: calculation.yieldMilli, calculatedCaloriesCenti: totals.calories, calculatedProteinCenti: totals.protein, calculatedCarbsCenti: totals.carbs, calculatedFatCenti: totals.fat, calculatedFiberCenti: calculation.fiberKnown ? totals.fiber : null };
    if (input.id) {
      const updated = await tx.foodLog.updateMany({ where: { id: input.id, userId: actor.userId, version: input.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new NutritionError("Unos je promijenjen. Osvježite stranicu.");
    } else {
      if (input.deductInventory) {
        if (!calculation.stocks.length || calculation.stocks.some(item => item.quantityMg <= 0)) throw new NutritionError("Količina je premala ili nema podataka za knjiženje zaliha.");
        for (const item of calculation.stocks) {
          const operation = await tx.inventoryOperation.create({ data: { userId: actor.userId, householdId: actor.householdId, productId: item.productId, requestKey: `diary:${receiptId}:${item.productId}`, requestHash: createHash("sha256").update(`${receiptId}:${item.productId}:${item.quantityMg}`).digest("hex"), kind: "CONSUME", summary: `Potrošnja uz dnevnik: ${snapshot.name}`, detail: JSON.stringify({ foodLogId: targetId, quantityMg: item.quantityMg }) } });
          await consumeProductInTransaction(tx, actor, item.productId, item.quantityMg, operation.id, today, "Potvrđena potrošnja uz dnevnik");
        }
      }
      await tx.foodLog.create({ data: { id: targetId, userId: actor.userId, productId: input.sourceType === "PRODUCT" ? input.sourceId : null, recipeId: input.sourceType === "RECIPE" ? input.sourceId : null, ...data, inventoryDeducted: input.deductInventory } });
    }
  });
}
export async function deleteFoodLog(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parseNutrition(deleteSchema, raw);
  return request(client, actor, "FOOD_DELETE", input, input.id, async tx => {
    const deleted = await tx.foodLog.deleteMany({ where: { id: input.id, userId: actor.userId, version: input.version } });
    if (deleted.count !== 1) throw new NutritionError("Unos nije dostupan ili je promijenjen. Osvježite podatke.");
  });
}
export async function saveWeight(client: PrismaClient, actor: InventoryActor, raw: unknown, today = localDate()) {
  const input = parseNutrition(weightSchema, raw); actualDate(input.date, today);
  const weightG = numberFixed(input.weight, 3);
  if (weightG <= 0 || weightG > 1000000) throw new NutritionError("Unesite težinu veću od 0 i najviše 1000 kg.");
  return request(client, actor, input.id ? "WEIGHT_UPDATE" : "WEIGHT_CREATE", input, input.id || randomUUID(), async (tx, targetId) => {
    if (input.id) {
      const updated = await tx.weightLog.updateMany({ where: { id: input.id, userId: actor.userId, version: input.version }, data: { date: input.date, weightG, version: { increment: 1 } } });
      if (updated.count !== 1) throw new NutritionError("Mjerenje nije dostupno ili je u međuvremenu promijenjeno.");
    } else await tx.weightLog.create({ data: { id: targetId, userId: actor.userId, date: input.date, weightG } });
  });
}
export async function deleteWeight(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parseNutrition(deleteSchema, raw);
  return request(client, actor, "WEIGHT_DELETE", input, input.id, async tx => {
    const deleted = await tx.weightLog.deleteMany({ where: { id: input.id, userId: actor.userId, version: input.version } });
    if (deleted.count !== 1) throw new NutritionError("Mjerenje nije dostupno ili je promijenjeno.");
  });
}
export async function saveSettings(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parseNutrition(settingsSchema, raw);
  const calories = numberFixed(input.calories, 2), protein = numberFixed(input.protein, 2), carbs = numberFixed(input.carbs, 2), fat = numberFixed(input.fat, 2);
  if (calories <= 0 || calories > 2000000 || [protein, carbs, fat].some(value => value > 200000)) throw new NutritionError("Kalorije moraju biti veće od 0 i najviše 20000 kcal; makronutrijenti 0–2000 g.");
  const data = { calorieTargetCenti: calories, proteinTargetCenti: protein, carbohydrateTargetCenti: carbs, fatTargetCenti: fat, mealCount: input.mealCount, weeklyBudgetCents: input.weeklyBudget ? numberFixed(input.weeklyBudget, 2) : null,
    dietaryPreferences: JSON.stringify(lines(input.preferences)), excludedIngredients: JSON.stringify(lines(input.excluded)), timezone: "Europe/Zagreb", goalsConfirmed: true };
  return request(client, actor, "SETTINGS", input, actor.userId, async tx => {
    const old = await tx.userSettings.findUnique({ where: { userId: actor.userId } });
    if (!old) {
      if (input.version !== 0) throw new NutritionError("Postavke su promijenjene. Osvježite podatke.");
      await tx.userSettings.create({ data: { userId: actor.userId, ...data, version: 1 } });
    } else {
      const updated = await tx.userSettings.updateMany({ where: { userId: actor.userId, version: input.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new NutritionError("Postavke su u međuvremenu promijenjene. Osvježite stranicu.");
    }
  });
}
