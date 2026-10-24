import "server-only";
import { db } from "./db";
import { requireUser } from "./session";
import { addDays } from "./calendar";
import { defaultSettings } from "./nutrition-diary";
import { dailyNutrition, progressWindow, zeroTotals } from "./nutrition-trends";
import { actualDate } from "./nutrition-input";
export async function loadDiary(date: string) {
  actualDate(date);
  const user = await requireUser();
  const [logs, products, recipes, savedSettings] = await Promise.all([
    db().foodLog.findMany({ where: { userId: user.id, date }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { product: { select: { name: true } }, recipe: { select: { title: true } } } }),
    db().foodProduct.findMany({ where: { householdId: user.householdId }, orderBy: { name: "asc" }, select: { id: true, name: true, nutritionState: true, estimatedNutrition: true, densityMgPerMl: true, pieceWeightMg: true } }),
    db().recipe.findMany({ where: { householdId: user.householdId, ingredients: { some: {} } }, orderBy: { title: "asc" }, select: { id: true, title: true, cookingMinutes: true, ingredients: { select: { product: { select: { householdId: true, estimatedNutrition: true } } } } } }),
    db().userSettings.findUnique({ where: { userId: user.id } }),
  ]);
  const sources = [
    ...products.map(product => ({ id: product.id, name: product.name, type: "PRODUCT" as const, state: product.nutritionState, estimated: product.estimatedNutrition, hasDensity: product.densityMgPerMl !== null, hasPieceWeight: product.pieceWeightMg !== null })),
    ...recipes.filter(recipe => recipe.ingredients.every(item => item.product.householdId === user.householdId)).map(recipe => ({ id: recipe.id, name: recipe.title, type: "RECIPE" as const, state: recipe.cookingMinutes > 0 ? "COOKED" as const : "RAW" as const, estimated: recipe.ingredients.some(item => item.product.estimatedNutrition), hasDensity: false, hasPieceWeight: false })),
  ];
  return { date, logs, sources, settings: savedSettings ?? defaultSettings, totals: dailyNutrition(logs)[0]?.totals ?? zeroTotals() };
}
export async function loadSettings() {
  const user = await requireUser();
  return await db().userSettings.findUnique({ where: { userId: user.id } }) ?? defaultSettings;
}
export async function loadProgress(end: string, days: 7 | 30) {
  actualDate(end); const user = await requireUser();
  const [weights, foods] = await Promise.all([
    db().weightLog.findMany({ where: { userId: user.id, date: { gte: addDays(end, -35), lte: end } }, orderBy: { date: "asc" } }),
    db().foodLog.findMany({ where: { userId: user.id, date: { gte: addDays(end, -29), lte: end } }, orderBy: { date: "asc" }, select: { date: true, calculatedCaloriesCenti: true, calculatedProteinCenti: true, calculatedCarbsCenti: true, calculatedFatCenti: true } }),
  ]);
  return { seven: progressWindow(weights, foods, end, 7), thirty: progressWindow(weights, foods, end, 30),
    selected: progressWindow(weights, foods, end, days), weights: weights.filter(item => item.date >= addDays(end, 1 - days)).reverse() };
}
