"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireSameOrigin } from "@/lib/session";
import { saveProduct, deleteProduct, addBatch, consumeStock, adjustBatch, editBatch, inventoryMessage } from "@/lib/inventory";
export type InventoryState = { error?: string; success?: string; operationId?: string; values?: Record<string, string> };
function values(form: FormData, keys: string[]) { return Object.fromEntries(keys.map(key => [key, String(form.get(key) ?? "")])); }
async function actor() { await requireSameOrigin(); const user = await requireUser(); return { userId: user.id, householdId: user.householdId }; }
function refresh(id?: string) { revalidatePath("/"); revalidatePath("/zalihe"); if (id) { revalidatePath(`/zalihe/${id}`); revalidatePath(`/zalihe/${id}/uredi`); } }
export async function productAction(_previous: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await actor();
  const input = values(form, ["name", "brand", "category", "barcode", "calories", "protein", "carbs", "fat", "fiber", "defaultUnit", "density", "pieceWeight", "lowStock", "nutritionState"]);
  let id: string;
  try { id = await saveProduct(db(), user, { ...input, estimatedNutrition: form.get("estimatedNutrition") === "on" }, String(form.get("id") ?? "") || undefined); }
  catch (error) { return { error: inventoryMessage(error), values: { ...input, estimatedNutrition: form.get("estimatedNutrition") === "on" ? "on" : "" } }; }
  refresh(id); redirect(`/zalihe/${id}`);
}
export async function deleteProductAction(_previous: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await actor();
  try { await deleteProduct(db(), user, String(form.get("productId") ?? ""), form.get("confirmed") === "on"); }
  catch (error) { return { error: inventoryMessage(error) }; }
  refresh(); redirect("/zalihe");
}
export async function stockAction(_previous: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await actor();
  const mode = String(form.get("mode") ?? "");
  const input = values(form, ["productId", "requestKey"]);
  const payload: Record<string, unknown> = { ...input, confirmed: form.get("confirmed") === "on" };
  const fields = mode === "ADD" ? ["quantity", "unit", "storageLocation", "expirationDate", "purchaseDate", "purchasePrice"] :
    mode === "CONSUME" ? ["quantity", "unit"] : mode === "ADJUST" ? ["batchId", "quantity", "unit", "reason"] :
      mode === "UPDATE_BATCH" ? ["batchId", "storageLocation", "expirationDate", "purchaseDate", "purchasePrice"] : [];
  const entered = values(form, fields); Object.assign(payload, entered);
  if (mode === "ADJUST" || mode === "UPDATE_BATCH") {
    const version = form.get("version");
    payload.version = typeof version === "string" && /^\d{1,10}$/.test(version) ? Number(version) : NaN;
  }
  try {
    const result = mode === "ADD" ? await addBatch(db(), user, payload) : mode === "CONSUME" ? await consumeStock(db(), user, payload) :
      mode === "ADJUST" ? await adjustBatch(db(), user, payload) : mode === "UPDATE_BATCH" ? await editBatch(db(), user, payload) : null;
    if (!result) return { error: "Nepoznata promjena zalihe." };
    refresh(input.productId);
    return { operationId: result.operationId, success: result.replayed ? "Ova promjena već je spremljena. Zaliha nije ponovno promijenjena." : "Promjena je spremljena u povijest." };
  } catch (error) { return { error: inventoryMessage(error), values: entered }; }
}
