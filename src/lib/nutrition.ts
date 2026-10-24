import { positiveInt, roundRatio } from "./quantities";
export interface Nutrients { calories: number; protein: number; carbs: number; fat: number; fiber: number }
export function nutritionForMass(per100gCenti: Nutrients, massMg: number): Nutrients {
  positiveInt(massMg);
  return Object.fromEntries(Object.entries(per100gCenti).map(([key, value]) =>
    [key, roundRatio(BigInt(positiveInt(value, true)) * BigInt(massMg), 100_000n)])) as unknown as Nutrients;
}
export function nutritionPerServing(totalCenti: Nutrients, recipeServingsMilli: number): Nutrients {
  positiveInt(recipeServingsMilli);
  return Object.fromEntries(Object.entries(totalCenti).map(([key, value]) =>
    [key, roundRatio(BigInt(positiveInt(value, true)) * 1000n, BigInt(recipeServingsMilli))])) as unknown as Nutrients;
}
