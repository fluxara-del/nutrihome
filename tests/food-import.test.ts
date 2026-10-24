import { describe, it, expect } from "vitest";
import { parseLabel } from "../src/lib/label-parser";
import { offDraft, usdaDraft, usdaQuery } from "../src/lib/food-providers";
import { validBarcode } from "../src/lib/food-draft";
import { reviewedProduct } from "../src/lib/catalog";
import { randomUUID } from "node:crypto";
export function review(overrides: Record<string, unknown> = {}) {
  return { name: "Čokoladne zobene", brand: "Test", barcode: "", category: "Žitarice", calories: "200", protein: "10", carbs: "20", fat: "5", fiber: "", basis: "PER_100_G", servingQuantity: "", servingUnit: "G", density: "", densityConfirmed: false, nutritionState: "RAW", packageQuantity: "500", packageUnit: "G", source: "OCR", reference: "", estimatedNutrition: false, confirmed: true, requestKey: randomUUID(), ...overrides };
}
describe("conservative local label parser", () => {
  it("reads Croatian labels, decimal commas and the per-100g column", () => {
    const result = parseLabel("Zobene pahuljice\nNa 100 g | Po porciji (30 g)\nEnergija 840 kJ / 200 kcal 252 kJ / 60 kcal\nBjelančevine 10,5 g 3,15 g\nUgljikohidrati 20 g 6 g\nMasti 5,2 g 1,56 g\nVlakna 4 g 1,2 g\nNeto količina 500 g");
    expect(result).toMatchObject({ name: "Zobene pahuljice", basis: "PER_100_G", calories: "200", protein: "10.5", carbs: "20", fat: "5.2", fiber: "4", packageQuantity: "500", packageUnit: "G", servingQuantity: "30" });
  });
  it("handles the reversed order of portion and 100 ml columns", () => {
    expect(parseLabel("Per serving (200 ml) | Per 100 ml\nEnergy 100 kcal 50 kcal\nProtein 6 g 3 g\nCarbohydrate 8 g 4 g\nFat 4 g 2 g")).toMatchObject({ basis: "PER_100_ML", calories: "50", protein: "3", carbs: "4", fat: "2", fiber: "" });
  });
  it("converts kJ only with a recognized unit", () => {
    expect(parseLabel("Na 100 g\nEnergija 418,4 kJ").calories).toBe("100");
    expect(parseLabel("Na 100 g\nEnergija 418,4").calories).toBe("");
  });
  it("retains per-serving data rather than pretending they are per 100 g", () => {
    expect(parseLabel("Po porciji (25 g)\nEnergija 100 kcal\nProteini 3.5 g")).toMatchObject({ basis: "PER_SERVING", servingQuantity: "25", calories: "100", protein: "3.5" });
  });
  it("leaves ambiguous, duplicate and missing values blank", () => {
    expect(parseLabel("Na 100 g | Po porciji\nMasti 2 g\nVlakna <0,5 g\nProteini 2 g\nProteini 3 g")).toMatchObject({ fat: "", fiber: "", protein: "", calories: "" });
    expect(parseLabel("Na 100 g\nPo porciji\nMasti 2 g 1 g").fat).toBe("");
    expect(parseLabel("Proteini 2 g").basis).toBe("UNKNOWN");
  });
  it("does not use sugar or saturated-fat rows as carbohydrate or total fat", () => {
    expect(parseLabel("Na 100 g\nOd kojih šećeri 5 g\nOd kojih zasićene masti 2 g")).toMatchObject({ carbs: "", fat: "" });
  });
  it("requires manual resolution of a combined 100 g/ml header", () => {
    expect(parseLabel("Na 100 g/ml\nEnergija 200 kcal").basis).toBe("UNKNOWN");
    expect(parseLabel("Na 100 g / 100 ml\nEnergija 200 kcal").basis).toBe("UNKNOWN");
  });
});
describe("provider boundaries", () => {
  it("checks EAN/UPC/GTIN checksums", () => {
    for (const code of ["4006381333931", "012345678905", "96385074"]) expect(validBarcode(code), code).toBe(true);
    for (const code of ["4006381333932", "https://example.org", "123", "000000000000001"]) expect(validBarcode(code)).toBe(false);
  });
  it("preserves OFF units, zeros and absent values", () => {
    const result = offDraft({ code: "4006381333931", product_name_hr: "Mlijeko TEST", brands: "Test", nutrition_data_per: "100ml", product_quantity: 1, product_quantity_unit: "l", nutriments: { "energy-kcal_100g": 50, proteins_100g: 0, carbohydrates_100g: 4, fat_100g: 2 } });
    expect(result).toMatchObject({ basis: "PER_100_ML", protein: "0", fiber: "", packageQuantity: "1", packageUnit: "L" });
    expect(offDraft({ product_name: "Nepoznata osnova", nutriments: {} })?.basis).toBe("UNKNOWN");
  });
  it("rejects malicious/unusable numbers and does not guess prepared nutrition", () => {
    expect(offDraft({ product_name: "Test", nutrition_data_per: "100g", nutriments: { proteins_100g: -2, fat_100g: Infinity, carbohydrates_100g: "23", "energy-kcal_100g": 900000 } })).toMatchObject({ protein: "", carbs: "", fat: "", calories: "" });
    expect(offDraft({})).toBeNull();
  });
  it("uses USDA nutrient identifiers, correct units and optional Croatian translation", () => {
    expect(usdaQuery("PILEĆA PRSA")).toBe("chicken breast");
    expect(usdaDraft({ fdcId: 123, description: "Chicken", dataType: "Foundation", foodNutrients: [{ nutrientId: 1008, value: 120, unitName: "KCAL" }, { nutrientId: 1003, value: 23, unitName: "G" }, { nutrientId: 1004, value: 200, unitName: "MG" }] })).toMatchObject({ basis: "PER_100_G", calories: "120", protein: "23", fat: "", fiber: "", reference: "123" });
    expect(usdaDraft({ description: "Branded serving", dataType: "Branded" })).toBeNull();
  });
});
describe("confirmed canonical nutrition", () => {
  it("requires confirmation and required nutrients; unknown fiber remains flagged", () => {
    expect(() => reviewedProduct(review({ confirmed: false }))).toThrow();
    expect(() => reviewedProduct(review({ protein: "" }))).toThrow();
    expect(() => reviewedProduct(review({ basis: "UNKNOWN" }))).toThrow();
    expect(reviewedProduct(review()).data).toMatchObject({ fiberKnown: false, estimatedNutrition: true, fiberPer100gCenti: 0 });
  });
  it("normalizes a weighed portion using fixed point", () => {
    expect(reviewedProduct(review({ basis: "PER_SERVING", servingQuantity: "25", calories: "100", protein: "2,5", carbs: "10", fat: "1" })).data).toMatchObject({ caloriesPer100gCenti: 40000, proteinPer100gCenti: 1000, sourceNutritionBasis: "PER_SERVING" });
    expect(() => reviewedProduct(review({ basis: "PER_SERVING" }))).toThrow(/porciji/);
  });
  it("never assumes 1 ml equals 1 g", () => {
    expect(() => reviewedProduct(review({ basis: "PER_100_ML" }))).toThrow(/gustoća/);
    expect(() => reviewedProduct(review({ basis: "PER_100_ML", density: "1" }))).toThrow(/gustoću/);
    expect(reviewedProduct(review({ basis: "PER_100_ML", density: "0,8", densityConfirmed: true })).data).toMatchObject({ caloriesPer100gCenti: 25000, densityMgPerMl: 800, defaultUnit: "ML" });
    expect(reviewedProduct(review({ basis: "PER_SERVING", servingQuantity: "200", servingUnit: "ML", density: "0,8", densityConfirmed: true })).data.caloriesPer100gCenti).toBe(12500);
  });
  it("rejects impossible nutrients, invalid barcodes and empty/zero packages", () => {
    expect(() => reviewedProduct(review({ protein: "101" }))).toThrow();
    expect(() => reviewedProduct(review({ barcode: "4006381333932" }))).toThrow();
    expect(() => reviewedProduct(review({ packageQuantity: "0" }))).toThrow();
    expect(reviewedProduct(review({ packageQuantity: "" })).data.packageUnit).toBeNull();
  });
});
