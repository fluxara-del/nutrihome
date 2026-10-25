import { validBarcode } from "./food-draft";
import { z } from "zod";
import { calendarDate, localDate } from "./calendar";
import { fixed } from "./quantities";
export const units = ["G", "KG", "ML", "L", "PIECE"] as const;
export const locations = ["FRIDGE", "FREEZER", "PANTRY"] as const;
export const unitLabels = { G: "g", KG: "kg", ML: "ml", L: "l", PIECE: "kom" };
export const locationLabels = { FRIDGE: "Hladnjak", FREEZER: "Zamrzivač", PANTRY: "Smočnica" };
export class InventoryError extends Error {}
const text = (max: number) => z.string().trim().max(max, `Unos može imati najviše ${max} znakova.`);
const decimal = z.string().trim().min(1, "Unesite količinu ili nutritivnu vrijednost.").max(24).regex(/^\d+(?:[.,]\d+)?$/, "Koristite pozitivan decimalni broj.");
const optionalDecimal = z.union([decimal, z.literal("")]);
const date = z.string().refine(value => { try { if (value) calendarDate(value); return true; } catch { return false; } }, "Datum nije ispravan.");
export const productSchema = z.strictObject({
  name: text(120).min(2, "Naziv mora imati najmanje 2 znaka."), brand: text(100), category: text(60).min(1, "Unesite kategoriju."),
  barcode: text(14).refine(value => !value || validBarcode(value), "Barkod mora biti valjan EAN/UPC/GTIN s kontrolnom znamenkom."),
  calories: decimal, protein: decimal, carbs: decimal, fat: decimal, fiber: optionalDecimal,
  defaultUnit: z.enum(units), density: optionalDecimal, pieceWeight: optionalDecimal, lowStock: decimal,
  estimatedNutrition: z.boolean(), nutritionState: z.enum(["RAW", "COOKED"]).default("RAW"),
});
const operationBase = { productId: z.string().min(1).max(100), requestKey: z.uuid(), confirmed: z.literal(true, { error: "Potvrdite promjenu zalihe." }) };
const metadata = { storageLocation: z.enum(locations), expirationDate: date, purchaseDate: date, purchasePrice: optionalDecimal };
export const batchSchema = z.strictObject({ ...operationBase, ...metadata, quantity: decimal, unit: z.enum(units) });
export const consumeSchema = z.strictObject({ ...operationBase, quantity: decimal, unit: z.enum(units) });
export const adjustSchema = z.strictObject({ ...operationBase, batchId: z.string().min(1).max(100), version: z.number().int().nonnegative(), quantity: decimal, unit: z.enum(units), reason: text(200).min(5, "Opišite razlog promjene (najmanje 5 znakova).") });
export const editBatchSchema = z.strictObject({ ...operationBase, ...metadata, batchId: z.string().min(1).max(100), version: z.number().int().nonnegative() });
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "";
    throw new InventoryError(/^(Invalid|Too|Unrecognized)/.test(message) || !message ? "Provjerite obavezna polja, jedinicu i potvrdu promjene." : message);
  }
  return result.data;
}
export function checkedFixed(value: string, decimals: number) {
  try { return fixed(value, decimals); } catch { throw new InventoryError("Provjerite količinu: previše decimalnih mjesta ili prevelika vrijednost."); }
}
export function productData(input: z.infer<typeof productSchema>) {
  const calories = checkedFixed(input.calories, 2);
  const nutrients = [input.protein, input.carbs, input.fat, input.fiber].map(value => checkedFixed(value || "0", 2));
  if (calories > 100000 || nutrients.some(value => value > 10000)) throw new InventoryError("Vrijednosti na 100 g: najviše 1000 kcal i 100 g pojedinog nutrijenta.");
  const densityMgPerMl = input.density ? checkedFixed(input.density, 3) : null;
  const pieceWeightMg = input.pieceWeight ? checkedFixed(input.pieceWeight, 3) : null;
  if ((densityMgPerMl !== null && (densityMgPerMl <= 0 || densityMgPerMl > 20000)) || (pieceWeightMg !== null && pieceWeightMg <= 0)) throw new InventoryError("Masa komada i gustoća moraju biti veće od nule; gustoća najviše 20 g/ml.");
  if (["ML", "L"].includes(input.defaultUnit) && !densityMgPerMl) throw new InventoryError("Za ml ili l unesite potvrđenu gustoću u g/ml.");
  if (input.defaultUnit === "PIECE" && !pieceWeightMg) throw new InventoryError("Za komade unesite masu jednog komada u gramima.");
  return { name: input.name, brand: input.brand || null, barcode: input.barcode || null, category: input.category,
    caloriesPer100gCenti: calories, proteinPer100gCenti: nutrients[0], carbsPer100gCenti: nutrients[1], fatPer100gCenti: nutrients[2], fiberPer100gCenti: nutrients[3],
    nutritionState: input.nutritionState, defaultUnit: input.defaultUnit, densityMgPerMl, pieceWeightMg, lowStockThresholdMg: checkedFixed(input.lowStock, 3), estimatedNutrition: input.estimatedNutrition || !input.fiber, fiberKnown: input.fiber !== "" };
}
export function batchMetadata(input: z.infer<typeof batchSchema> | z.infer<typeof editBatchSchema>, today = localDate()) {
  if (input.purchaseDate > today) throw new InventoryError("Datum kupnje ne može biti u budućnosti.");
  if (input.expirationDate && input.purchaseDate && input.expirationDate < input.purchaseDate) throw new InventoryError("Rok trajanja ne može biti prije datuma kupnje.");
  return { storageLocation: input.storageLocation, expirationDate: input.expirationDate || null, purchaseDate: input.purchaseDate || null,
    purchasePriceCents: input.purchasePrice ? checkedFixed(input.purchasePrice, 2) : null };
}
export function formatMass(mg: number) {
  const kg = Math.abs(mg) >= 1000000;
  return `${new Intl.NumberFormat("hr-HR", { maximumFractionDigits: kg ? 6 : 3 }).format(mg / (kg ? 1000000 : 1000))} ${kg ? "kg" : "g"}`;
}
