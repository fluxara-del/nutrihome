import type { FoodLog, FoodProduct, FoodState } from "@prisma/client";
import { positiveInt, roundRatio, toMilligrams } from "./quantities";
import type { Nutrients } from "./nutrition";
import { numberFixed, NutritionError } from "./nutrition-input";
export type ProductSnapshot = {
  kind: "product"; version: 1; sourceId: string; name: string; state: FoodState; estimated: boolean;
  fiberKnown?: boolean; per100g: Nutrients; densityMgPerMl: number | null; pieceWeightMg: number | null;
};
export type RecipeSnapshot = {
  kind: "recipe"; version: 1; sourceId: string; name: string; state: FoodState; estimated: boolean;
  servingsMilli: number; ingredients: { productId: string; quantityMg: number; product: ProductSnapshot }[];
};
export type LegacySnapshot = { kind: "legacy"; version: 1; sourceId: string; sourceType: "PRODUCT" | "RECIPE"; name: string; state: FoodState; estimated: true; fiberKnown?: boolean; quantityMilli: number; totals: Nutrients };
export type NutritionSnapshot = ProductSnapshot | RecipeSnapshot | LegacySnapshot;
export function productSnapshot(product: FoodProduct): ProductSnapshot {
  return { kind: "product", version: 1, sourceId: product.id, name: product.name, state: product.nutritionState, estimated: product.estimatedNutrition || !product.fiberKnown, fiberKnown: product.fiberKnown,
    per100g: { calories: product.caloriesPer100gCenti, protein: product.proteinPer100gCenti, carbs: product.carbsPer100gCenti, fat: product.fatPer100gCenti, fiber: product.fiberPer100gCenti },
    densityMgPerMl: product.densityMgPerMl, pieceWeightMg: product.pieceWeightMg };
}
export function legacySnapshot(log: FoodLog, name: string): LegacySnapshot {
  return { kind: "legacy", version: 1, sourceId: log.productId ?? log.recipeId!, sourceType: log.productId ? "PRODUCT" : "RECIPE", name, state: log.foodState, estimated: true,
    fiberKnown: log.calculatedFiberCenti !== null, quantityMilli: log.quantityMilli, totals: { calories: log.calculatedCaloriesCenti, protein: log.calculatedProteinCenti, carbs: log.calculatedCarbsCenti, fat: log.calculatedFatCenti, fiber: log.calculatedFiberCenti ?? 0 } };
}
const nutrientKeys = ["calories", "protein", "carbs", "fat", "fiber"] as const;
export type CalculationInput = { quantity: string; unit: "G" | "KG" | "ML" | "L" | "PIECE" | "SERVING"; foodState: FoodState; yield: string; yieldConfirmed: boolean; estimated: boolean };
export function calculateSnapshot(snapshot: NutritionSnapshot, input: CalculationInput) {
  if (snapshot.kind === "product" && input.foodState !== snapshot.state && !["G", "KG"].includes(input.unit)) throw new NutritionError("Za sirovo/kuhano unesite izvaganu masu u g ili kg. Gustoća i masa komada vrijede samo za stanje iz etikete.");
  let quantityMilli: number;
  const isRecipe = snapshot.kind === "recipe" || snapshot.kind === "legacy" && snapshot.sourceType === "RECIPE";
  try {
    if (isRecipe) {
      if (input.unit !== "SERVING") throw new NutritionError("Recept se unosi u porcijama.");
      quantityMilli = positiveInt(numberFixed(input.quantity, 3));
    } else {
      if (input.unit === "SERVING") throw new NutritionError("Proizvod zahtijeva masu, volumen ili broj komada.");
      quantityMilli = toMilligrams(input.quantity, input.unit, snapshot.kind === "product" ? { densityMgPerMl: snapshot.densityMgPerMl ?? undefined, pieceWeightMg: snapshot.pieceWeightMg ?? undefined } : {});
    }
  } catch (error) { if (error instanceof NutritionError) throw error; throw new NutritionError("Količina nije ispravna ili nedostaje podatak za pretvorbu jedinice."); }
  let numerator = 1n, denominator = 1n, yieldMilli: number | null = null;
  const foodState = isRecipe ? snapshot.state : input.foodState;
  if (snapshot.kind === "product" && foodState !== snapshot.state) {
    yieldMilli = input.yield ? numberFixed(input.yield, 3) : 0;
    if (!input.yieldConfirmed || yieldMilli <= 0 || yieldMilli > 100000) throw new NutritionError("Za sirovo/kuhano potreban je potvrđen omjer kuhane i sirove mase (0,001–100).");
    [numerator, denominator] = snapshot.state === "RAW" ? [1000n, BigInt(yieldMilli)] : [BigInt(yieldMilli), 1000n];
  } else if (input.yield) throw new NutritionError("Faktor je potreban samo za pretvorbu sirovo/kuhano. Očistite polje faktora.");
  if (snapshot.kind === "legacy" && foodState !== snapshot.state) throw new NutritionError("Raniji zapis nema podatke za pretvorbu sirovo/kuhano. Dodajte novi unos s potvrđenim podacima.");
  const totals = {} as Nutrients;
  for (const key of nutrientKeys) {
    let value: bigint, divisor: bigint;
    if (snapshot.kind === "product") { value = BigInt(snapshot.per100g[key]) * BigInt(quantityMilli) * numerator; divisor = 100000n * denominator; }
    else if (snapshot.kind === "recipe") {
      value = snapshot.ingredients.reduce((sum, item) => sum + BigInt(item.product.per100g[key]) * BigInt(item.quantityMg), 0n) * BigInt(quantityMilli);
      divisor = 100000n * BigInt(snapshot.servingsMilli);
    } else { value = BigInt(snapshot.totals[key]) * BigInt(quantityMilli); divisor = BigInt(snapshot.quantityMilli); }
    try { totals[key] = roundRatio(value, divisor); } catch { throw new NutritionError("Unesena količina daje prevelik nutritivni rezultat."); }
  }
  const stocks = snapshot.kind === "product" ? [{ productId: snapshot.sourceId, quantityMg: roundRatio(BigInt(quantityMilli) * numerator, denominator) }] : snapshot.kind === "recipe" ? snapshot.ingredients.map(item => ({ productId: item.productId, quantityMg: roundRatio(BigInt(item.quantityMg) * BigInt(quantityMilli), BigInt(snapshot.servingsMilli)) })) : [];
  const fiberKnown = snapshot.kind === "recipe" ? snapshot.ingredients.every(item => item.product.fiberKnown !== false) : snapshot.fiberKnown !== false;
  return { fiberKnown, totals, quantityMilli, foodState, yieldMilli, estimated: snapshot.estimated || input.estimated || yieldMilli !== null, stocks };
}
