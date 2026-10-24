"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSameOrigin, requireUser } from "@/lib/session";
import { saveFoodLog, deleteFoodLog, saveWeight, deleteWeight, saveSettings, nutritionMessage, type NutritionResult } from "@/lib/nutrition-diary";
export type NutritionState = { error?: string; success?: string; savedRequestId?: string; date?: string; values?: Record<string, string> };
const strings = (form: FormData, keys: string[]) => Object.fromEntries(keys.map(key => [key, String(form.get(key) ?? "")]));
function revision(form: FormData) { const value = form.get("version"); return typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : NaN; }
function base(form: FormData) { return { ...strings(form, ["requestKey"]), confirmed: form.get("confirmed") === "on" }; }
async function actor() { await requireSameOrigin(); const user = await requireUser(); return { userId: user.id, householdId: user.householdId }; }
function refresh() { for (const path of ["/", "/dnevnik", "/napredak", "/postavke"]) revalidatePath(path); revalidatePath("/zalihe", "layout"); }
function success(result: NutritionResult, date?: string): NutritionState { refresh(); return { savedRequestId: result.requestId, date, success: result.replayed ? "Ovaj zahtjev već je spremljen. Nije ponovljen." : "Promjena je spremljena." }; }
export async function foodAction(_previous: NutritionState, form: FormData): Promise<NutritionState> {
  const user = await actor(); const values = strings(form, ["id", "date", "sourceType", "sourceId", "quantity", "unit", "foodState", "yield"]);
  try {
    const result = await saveFoodLog(db(), user, { ...base(form), ...values, version: revision(form), estimated: form.get("estimated") === "on", yieldConfirmed: form.get("yieldConfirmed") === "on", deductInventory: form.get("deductInventory") === "on", confirmedStock: form.get("confirmedStock") === "on" });
    return success(result, values.date);
  } catch (error) { return { error: nutritionMessage(error), values }; }
}
export async function deleteFoodAction(_previous: NutritionState, form: FormData): Promise<NutritionState> {
  const user = await actor();
  try { return success(await deleteFoodLog(db(), user, { ...base(form), id: String(form.get("id") ?? ""), version: revision(form) })); }
  catch (error) { return { error: nutritionMessage(error) }; }
}
export async function weightAction(_previous: NutritionState, form: FormData): Promise<NutritionState> {
  const user = await actor(), values = strings(form, ["id", "date", "weight"]);
  try { return success(await saveWeight(db(), user, { ...base(form), ...values, version: revision(form) }), values.date); }
  catch (error) { return { error: nutritionMessage(error), values }; }
}
export async function deleteWeightAction(_previous: NutritionState, form: FormData): Promise<NutritionState> {
  const user = await actor();
  try { return success(await deleteWeight(db(), user, { ...base(form), id: String(form.get("id") ?? ""), version: revision(form) })); }
  catch (error) { return { error: nutritionMessage(error) }; }
}
export async function settingsAction(_previous: NutritionState, form: FormData): Promise<NutritionState> {
  const user = await actor(), values = strings(form, ["calories", "protein", "carbs", "fat", "weeklyBudget", "preferences", "excluded", "timezone"]);
  const count = String(form.get("mealCount") ?? "");
  try { return success(await saveSettings(db(), user, { ...base(form), ...values, version: revision(form), mealCount: /^\d{1,2}$/.test(count) ? Number(count) : NaN })); }
  catch (error) { return { error: nutritionMessage(error), values: { ...values, mealCount: count } }; }
}
