import {
  generateMeals,
  evaluatePlan,
  type StoredMeal,
  type PlanSettings,
} from "../src/lib/plan-engine";
import { mkdirSync, writeFileSync } from "node:fs";
const ingredients = Array.from({ length: 50 }, (_, i) => ({
  productId: `p${i}`,
  quantityMg: 2000,
  product: {
    kind: "product" as const,
    version: 1 as const,
    sourceId: `p${i}`,
    name: `Product ${i}`,
    state: "RAW" as const,
    estimated: false,
    fiberKnown: true,
    per100g: {
      calories: 40000,
      protein: 2000,
      carbs: 6000,
      fat: 500,
      fiber: 1000,
    },
    densityMgPerMl: null,
    pieceWeightMg: null,
  },
}));
const stored: StoredMeal = {
  instructions: "Performance fixture",
  nutrition: {
    kind: "recipe",
    version: 1,
    sourceId: "r",
    name: "Recipe",
    state: "RAW",
    estimated: false,
    servingsMilli: 1000,
    ingredients,
  },
  recipeVersion: 1,
  productVersions: {},
  tags: [],
  preparationMinutes: 5,
  cookingMinutes: 0,
  ingredientTerms: {},
};
const recipes = Array.from({ length: 500 }, (_, i) => ({
  id: `r${String(i).padStart(3, "0")}`,
  stored: {
    ...stored,
    nutrition: { ...stored.nutrition, name: `Recipe ${i}` },
  },
}));
const stock = Array.from({ length: 1000 }, (_, i) => ({
  id: `b${i}`,
  productId: `p${i % 50}`,
  quantityMg: 10000,
  expirationDate: "2026-11-01",
  createdAt: new Date(0),
}));
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
const result = [];
for (const count of [3, 12]) {
  const s = { ...settings, mealCount: count };
  const start = performance.now();
  const meals = generateMeals(
    "2026-10-26",
    recipes,
    s,
    stock,
    [],
    "2026-10-25",
  );
  const report = evaluatePlan("2026-10-26", meals, s, stock, [], "2026-10-25");
  result.push({
    recipes: 500,
    ingredientsPerRecipe: 50,
    stockBatches: 1000,
    mealCount: count,
    slots: meals.length,
    durationMs: Math.round(performance.now() - start),
    unknownPrices: report.unknownPriceCount,
  });
}
mkdirSync("qa-results", { recursive: true });
writeFileSync(
  "qa-results/planner-performance.json",
  JSON.stringify(
    { platform: process.platform, node: process.version, result },
    null,
    2,
  ),
);
console.log(JSON.stringify(result));
