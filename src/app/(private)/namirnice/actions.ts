"use server";
import { requireSameOrigin, requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { saveCatalogProduct } from "@/lib/catalog";
import { inventoryMessage } from "@/lib/inventory";
import { revalidatePath } from "next/cache";
export type CatalogState = { error?: string; productId?: string };
export async function catalogAction(_state: CatalogState, form: FormData): Promise<CatalogState> {
  await requireSameOrigin(); const user = await requireUser();
  const keys = ["name", "brand", "barcode", "category", "calories", "protein", "carbs", "fat", "fiber", "basis", "servingQuantity", "servingUnit", "density", "nutritionState", "packageQuantity", "packageUnit", "source", "reference", "requestKey"];
  const input = Object.fromEntries(keys.map(key => [key, String(form.get(key) ?? "")]));
  try {
    const productId = await saveCatalogProduct(db(), { userId: user.id, householdId: user.householdId }, { ...input, confirmed: form.get("confirmed") === "on", densityConfirmed: form.get("densityConfirmed") === "on", estimatedNutrition: form.get("estimatedNutrition") === "on" });
    for (const path of ["/", "/zalihe", "/dnevnik", "/namirnice"]) revalidatePath(path);
    return { productId };
  } catch (error) { return { error: inventoryMessage(error) }; }
}
