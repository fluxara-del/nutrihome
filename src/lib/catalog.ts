import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { productSchema, productData, parse, InventoryError, checkedFixed } from "./inventory-input";
import type { InventoryActor } from "./inventory";
import { normalizeFoodName, validBarcode } from "./food-draft";
import { roundRatio } from "./quantities";
const decimal = z.string().trim().max(24).regex(/^\d+(?:[.,]\d+)?$/);
export const catalogSchema = z.strictObject({
  name: z.string().trim().min(2).max(120), brand: z.string().trim().max(100), barcode: z.string().trim().max(14).refine(v => !v || validBarcode(v)), category: z.string().trim().min(1).max(60),
  calories: decimal, protein: decimal, carbs: decimal, fat: decimal, fiber: z.union([decimal, z.literal("")]),
  basis: z.enum(["PER_100_G", "PER_100_ML", "PER_SERVING"]), servingQuantity: z.union([decimal, z.literal("")]), servingUnit: z.enum(["G", "ML"]),
  density: z.union([decimal, z.literal("")]), densityConfirmed: z.boolean(), nutritionState: z.enum(["RAW", "COOKED"]),
  packageQuantity: z.union([decimal, z.literal("")]), packageUnit: z.enum(["G", "KG", "ML", "L"]),
  source: z.enum(["MANUAL", "OFF", "USDA", "OCR"]), reference: z.string().trim().max(100),
  estimatedNutrition: z.boolean(), confirmed: z.literal(true), requestKey: z.uuid(),
});
export function reviewedProduct(raw: unknown) {
  const input = parse(catalogSchema, raw);
  const volume = input.basis === "PER_100_ML" || input.basis === "PER_SERVING" && input.servingUnit === "ML";
  const density = input.density ? checkedFixed(input.density, 3) : 0;
  if (input.density && !input.densityConfirmed) throw new InventoryError("Potvrdi unesenu gustoću ili ostavi polje prazno.");
  if (volume && (!input.densityConfirmed || density <= 0 || density > 20000)) throw new InventoryError("Za vrijednosti na ml potrebna je potvrđena gustoća u g/ml. Ne pretpostavlja se da je 1 ml = 1 g.");
  const serving = input.basis === "PER_SERVING" ? input.servingQuantity ? checkedFixed(input.servingQuantity, 3) : 0 : 100000;
  if (!serving) throw new InventoryError("Za podatke po porciji unesi potvrđenu masu ili volumen porcije.");
  function canonical(value: string) {
    if (!value) return "0"; // Only optional fiber reaches here; fiberKnown is stored separately.
    const centi = BigInt(checkedFixed(value, 2));
    const per100g = roundRatio(centi * (input.basis === "PER_SERVING" ? 100000n : 1n) * (volume ? 1000n : 1n), BigInt(input.basis === "PER_SERVING" ? serving : 1) * (volume ? BigInt(density) : 1n));
    return (per100g / 100).toFixed(2);
  }
  const data = productData(parse(productSchema, { name: input.name, brand: input.brand, barcode: input.barcode, category: input.category,
    calories: canonical(input.calories), protein: canonical(input.protein), carbs: canonical(input.carbs), fat: canonical(input.fat), fiber: canonical(input.fiber),
    density: input.density, defaultUnit: volume ? "ML" : "G", pieceWeight: "", lowStock: "0", nutritionState: input.nutritionState, estimatedNutrition: input.estimatedNutrition || !input.fiber }));
  const packageQuantityMilli = input.packageQuantity ? checkedFixed(input.packageQuantity, 3) : null;
  if (packageQuantityMilli === 0) throw new InventoryError("Neto količina mora biti veća od nule ili ostati prazna.");
  return { input, data: { ...data, fiberKnown: !!input.fiber, nutritionSource: input.source, sourceReference: input.reference || null, sourceNutritionBasis: input.basis,
    packageQuantityMilli, packageUnit: packageQuantityMilli === null ? null : input.packageUnit } };
}
export async function saveCatalogProduct(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const { input, data } = reviewedProduct(raw);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return client.$transaction(async tx => {
    if (!await tx.user.findFirst({ where: { id: actor.userId, householdId: actor.householdId } })) throw new InventoryError("Pristup nije dopušten.");
    const receipt = await tx.catalogRequest.findUnique({ where: { userId_requestKey: { userId: actor.userId, requestKey: input.requestKey } } });
    if (receipt) {
      if (receipt.requestHash !== hash) throw new InventoryError("Zahtjev je već iskorišten. Osvježi obrazac.");
      if (!await tx.foodProduct.findFirst({ where: { id: receipt.productId, householdId: actor.householdId } })) throw new InventoryError("Ranije spremljeni proizvod više ne postoji.");
      return receipt.productId;
    }
    const existing = await tx.foodProduct.findMany({ where: { householdId: actor.householdId } });
    const duplicate = existing.find(p => data.barcode && p.barcode === data.barcode || normalizeFoodName(p.name) === normalizeFoodName(data.name) && normalizeFoodName(p.brand ?? "") === normalizeFoodName(data.brand ?? ""));
    if (duplicate) throw new InventoryError("Proizvod već postoji u lokalnom katalogu. Pronađi ga u pretrazi; postojeći podaci nisu prepisani.");
    const product = await tx.foodProduct.create({ data: { ...data, householdId: actor.householdId } });
    await tx.catalogRequest.create({ data: { userId: actor.userId, requestKey: input.requestKey, requestHash: hash, productId: product.id } });
    return product.id;
  });
}
