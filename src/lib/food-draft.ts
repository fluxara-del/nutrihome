// Serializable provider boundary. Empty strings mean unknown, never zero.
export const nutrientFields = ["calories", "protein", "carbs", "fat", "fiber"] as const;
export type FoodDraft = {
  name: string; brand: string; barcode: string;
  calories: string; protein: string; carbs: string; fat: string; fiber: string;
  basis: "PER_100_G" | "PER_100_ML" | "PER_SERVING" | "UNKNOWN";
  servingQuantity: string; servingUnit: "G" | "ML";
  packageQuantity: string; packageUnit: "G" | "KG" | "ML" | "L";
  source: "MANUAL" | "LOCAL" | "OFF" | "USDA" | "OCR"; reference: string;
  localId?: string; warnings: string[];
};
export function emptyDraft(source: FoodDraft["source"] = "MANUAL"): FoodDraft {
  return { name: "", brand: "", barcode: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", basis: "UNKNOWN", servingQuantity: "", servingUnit: "G", packageQuantity: "", packageUnit: "G", source, reference: "", warnings: [] };
}
export const sourceLabels = { MANUAL: "Ručni unos", LOCAL: "Lokalni katalog", OFF: "Open Food Facts", USDA: "USDA FoodData Central", OCR: "Lokalni OCR" };
export const basisLabels = { PER_100_G: "Na 100 g", PER_100_ML: "Na 100 ml", PER_SERVING: "Po porciji", UNKNOWN: "Osnova nije jasna — odaberi nakon provjere" };
export function normalizeFoodName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hr-HR").replace(/đ/g, "d").trim().replace(/\s+/g, " "); }
export function validBarcode(value: string) {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number), check = digits.pop()!;
  return (10 - digits.reverse().reduce((sum, n, i) => sum + n * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10 === check;
}
