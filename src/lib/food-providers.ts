import { Prisma, type FoodProduct, type PrismaClient } from "@prisma/client";
import { emptyDraft, normalizeFoodName, validBarcode, type FoodDraft } from "./food-draft";
import type { InventoryActor } from "./inventory";
import { InventoryError } from "./inventory-input";
import { searchReference, referenceDraft } from "./reference-food";
type Json = Record<string, unknown>;
const object = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const text = (v: unknown, max = 120) => typeof v === "string" ? v.trim().slice(0, max) : "";
function number(v: unknown, max = 1000) { return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? String(Math.round(v * 100) / 100) : ""; }
function packageData(draft: FoodDraft, quantity: unknown, unit: unknown, label?: unknown) {
  const u = text(unit).toUpperCase();
  if (["G", "KG", "ML", "L"].includes(u) && typeof quantity === "number" && quantity > 0 && quantity <= 100000) {
    draft.packageQuantity = number(quantity, 100000); draft.packageUnit = u as FoodDraft["packageUnit"];
  } else {
    const m = /^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)$/i.exec(text(label));
    if (m) { draft.packageQuantity = m[1].replace(",", "."); draft.packageUnit = m[2].toUpperCase() as FoodDraft["packageUnit"]; }
  }
}
export function offDraft(raw: unknown): FoodDraft | null {
  const p = object(raw), n = object(p.nutriments), draft = emptyDraft("OFF");
  draft.name = text(p.product_name_hr) || text(p.product_name) || text(p.generic_name);
  if (draft.name.length < 2) return null;
  draft.brand = text(p.brands, 100); draft.barcode = validBarcode(text(p.code)) ? text(p.code) : "";
  draft.reference = draft.barcode;
  const per = text(p.nutrition_data_per).toLowerCase();
  draft.basis = per === "100g" ? "PER_100_G" : per === "100ml" ? "PER_100_ML" : per === "serving" ? "PER_SERVING" : "UNKNOWN";
  const suffix = draft.basis === "PER_SERVING" ? "serving" : "100g";
  for (const [key, off] of [["protein", "proteins"], ["carbs", "carbohydrates"], ["fat", "fat"], ["fiber", "fiber"]] as const) draft[key] = number(n[`${off}_${suffix}`], 1000);
  draft.calories = number(n[`energy-kcal_${suffix}`], 10000);
  if (!draft.calories) {
    const kj = n[`energy-kj_${suffix}`] ?? (text(n.energy_unit).toLowerCase() === "kj" ? n[`energy_${suffix}`] : undefined);
    if (typeof kj === "number" && kj >= 0 && kj <= 41840) { draft.calories = String(Math.round(kj / 4.184 * 100) / 100); draft.warnings.push("Energija preračunata iz kJ u kcal."); }
  }
  packageData(draft, p.product_quantity, p.product_quantity_unit, p.quantity);
  const serving = /^(\d+(?:[.,]\d+)?)\s*(g|ml)$/i.exec(text(p.serving_size));
  if (serving) { draft.servingQuantity = serving[1].replace(",", "."); draft.servingUnit = serving[2].toUpperCase() as "G" | "ML"; }
  draft.warnings.push("Open Food Facts je zajednička baza. Provjeri etiketu, osnovu i nedostajuće vrijednosti. Izvor: Open Food Facts, ODbL.");
  return draft;
}
export function usdaDraft(raw: unknown): FoodDraft | null {
  const p = object(raw), draft = emptyDraft("USDA");
  if (!["Foundation", "SR Legacy", "Survey (FNDDS)"].includes(text(p.dataType))) return null;
  draft.name = text(p.description); if (draft.name.length < 2) return null;
  draft.reference = typeof p.fdcId === "number" && Number.isSafeInteger(p.fdcId) ? String(p.fdcId) : "";
  draft.basis = "PER_100_G";
  const nutrients = Array.isArray(p.foodNutrients) ? p.foodNutrients.slice(0, 200).map(object) : [];
  for (const [key, id] of [["calories", 1008], ["protein", 1003], ["carbs", 1005], ["fat", 1004], ["fiber", 1079]] as const) {
    const found = nutrients.find(n => n.nutrientId === id);
    if (!found) continue;
    const unit = text(found.unitName).toLowerCase();
    if (unit === (key === "calories" ? "kcal" : "g")) draft[key] = number(found.value, key === "calories" ? 1000 : 100);
  }
  if (!draft.calories) {
    const kj = nutrients.find(n => n.nutrientId === 1062 && text(n.unitName).toLowerCase() === "kj");
    if (kj && typeof kj.value === "number" && kj.value >= 0 && kj.value <= 4184) draft.calories = String(Math.round(kj.value / 4.184 * 100) / 100);
  }
  draft.warnings.push("USDA generička namirnica, na 100 g jestivog dijela. Provjeri naziv, stanje i vrijednosti; naziv može biti na engleskom.");
  return draft;
}
export function localDraft(p: FoodProduct): FoodDraft {
  const draft = emptyDraft("LOCAL");
  Object.assign(draft, { name: p.name, brand: p.brand ?? "", barcode: p.barcode ?? "", localId: p.id, reference: p.id, basis: "PER_100_G",
    calories: String(p.caloriesPer100gCenti / 100), protein: String(p.proteinPer100gCenti / 100), carbs: String(p.carbsPer100gCenti / 100), fat: String(p.fatPer100gCenti / 100), fiber: p.fiberKnown ? String(p.fiberPer100gCenti / 100) : "",
    packageQuantity: p.packageQuantityMilli === null ? "" : String(p.packageQuantityMilli / 1000), packageUnit: p.packageUnit ?? "G" });
  return draft;
}
// Deliberately small Croatian vocabulary for USDA's English search index.
const translations: Record<string, string> = { jabuka: "apple", banana: "banana", piletina: "chicken", "pileca prsa": "chicken breast", riza: "rice", krumpir: "potato", zob: "oats", "zobene pahuljice": "oats", jaje: "egg", jaja: "egg", mlijeko: "milk", jogurt: "yogurt", sir: "cheese", govedina: "beef", svinjetina: "pork", rajcica: "tomato", brokula: "broccoli", mrkva: "carrot", losos: "salmon", tuna: "tuna", leca: "lentils", grah: "beans", kruh: "bread", "maslinovo ulje": "olive oil" };
export function usdaQuery(q: string) { return translations[normalizeFoodName(q)] ?? q; }
export type ProviderFetch = typeof fetch;
async function json(url: URL, init: RequestInit, fetcher: ProviderFetch) {
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(6000), redirect: "error", cache: "no-store" });
  if (!res.ok || !res.body) throw new Error("Provider unavailable");
  const reader = res.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2_000_000) throw new Error("Response too large"); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
export async function searchFoods(client: PrismaClient, actor: InventoryActor, raw: string, barcode = false, options: { fetcher?: ProviderFetch; usdaKey?: string; localOnly?: boolean; external?: boolean; page?: number } = {}) {
  if (!await client.user.findFirst({ where: { id: actor.userId, householdId: actor.householdId }, select: { id: true } })) throw new InventoryError("Pristup nije dopušten.");
  const q = raw.trim();
  if (q.length < 2 || q.length > 100 || /[\x00-\x1f]/.test(q)) throw new InventoryError("Upiši naziv duljine 2–100 znakova.");
  if (barcode && !validBarcode(q)) throw new InventoryError("Barkod mora biti valjan EAN/UPC/GTIN s kontrolnom znamenkom.");
  const page = Math.min(499, Math.max(0, Math.trunc(options.page ?? 0) || 0));
  // SQLite performs bounded paging. Explicit replacements also cover Croatian capitals.
  const haystack = Prisma.sql`lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(name || ' ' || coalesce(brand,'') || ' ' || category || ' ' || coalesce(barcode,''), 'č','c'),'ć','c'),'š','s'),'ž','z'),'đ','d'),'Č','c'),'Ć','c'),'Š','s'),'Ž','z'),'Đ','d'))`;
  const tokens = normalizeFoodName(q).split(/\s+/).slice(0,12);
  const conditions = tokens.map(token=>Prisma.sql`instr(${haystack}, ${token}) > 0`);
  const local = await client.$queryRaw<FoodProduct[]>(Prisma.sql`SELECT * FROM FoodProduct WHERE householdId = ${actor.householdId} AND ${barcode ? Prisma.sql`barcode = ${q}` : Prisma.join(conditions," AND ")} ORDER BY name, id LIMIT 21 OFFSET ${page*20}`);
  const references = barcode ? [] : await searchReference(client,q,page);
  const hasMore = local.length>20 || references.length>20;
  const results = [...local.slice(0,20).map(localDraft),...references.slice(0,20).map(referenceDraft)];
  const warnings: string[] = [], fetcher = options.fetcher ?? fetch;
  if (options.localOnly || !options.external || barcode && local.length > 0 || page > 0) return { results, warnings, hasMore };
  const key = options.usdaKey ?? process.env.USDA_API_KEY;
  await Promise.all([
    (async () => {
      try {
        const url = new URL(barcode ? `https://world.openfoodfacts.org/api/v2/product/${q}.json` : "https://world.openfoodfacts.org/cgi/search.pl");
        if (!barcode) { url.searchParams.set("search_terms", q); url.searchParams.set("search_simple", "1"); url.searchParams.set("action", "process"); url.searchParams.set("json", "1"); url.searchParams.set("page_size", "12"); url.searchParams.set("lc", "hr"); }
        const fields = "code,product_name,product_name_hr,generic_name,brands,nutriments,nutrition_data_per,quantity,product_quantity,product_quantity_unit,serving_size";
        url.searchParams.set("fields", fields);
        const data = await json(url, { headers: { "User-Agent": "NutriHome/0.1 (private self-hosted nutrition catalog)", Accept: "application/json" } }, fetcher);
        const products = barcode ? data.status === 1 ? [data.product] : [] : Array.isArray(data.products) ? data.products.slice(0, 12) : [];
        for (const p of products) { const draft = offDraft(p); if (draft && (!draft.barcode || !results.some(r => r.barcode === draft.barcode))) results.push(draft); }
      } catch { warnings.push("Open Food Facts trenutačno nije dostupan. Lokalni katalog i ručni unos ostaju dostupni."); }
    })(),
    (async () => {
      if (!key || barcode) return;
      try {
        const data = await json(new URL("https://api.nal.usda.gov/fdc/v1/foods/search"), { method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": key }, body: JSON.stringify({ query: usdaQuery(q), dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize: 8 }) }, fetcher);
        for (const p of Array.isArray(data.foods) ? data.foods.slice(0, 8) : []) { const draft = usdaDraft(p); if (draft) results.push(draft); }
      } catch { warnings.push("USDA trenutačno nije dostupan. Ostali izvori ostaju dostupni."); }
    })(),
  ]);
  if (!key) warnings.push("USDA nije konfiguriran; API ključ nije obavezan.");
  return { results, warnings, hasMore };
}
