import { beforeEach, afterEach, it, expect, vi } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { migrateFixture } from "./migrations";
import { createDatabase } from "../src/lib/db";
import { saveCatalogProduct } from "../src/lib/catalog";
import { searchFoods, type ProviderFetch } from "../src/lib/food-providers";
import { addBatch } from "../src/lib/inventory";
import { allowCatalogRequest } from "../src/lib/catalog-limits";
let folder: string, client: ReturnType<typeof createDatabase>;
const actor = { userId: "catalog-user", householdId: "catalog-household" };
const input = (overrides: Record<string, unknown> = {}) => ({ name: "Čokoladne pahuljice", brand: "TEST", barcode: "4006381333931", category: "Žitarice", calories: "200", protein: "10", carbs: "20", fat: "5", fiber: "", basis: "PER_100_G", servingQuantity: "", servingUnit: "G", density: "", densityConfirmed: false, nutritionState: "RAW", packageQuantity: "500", packageUnit: "G", source: "OFF", reference: "4006381333931", estimatedNutrition: false, confirmed: true, requestKey: randomUUID(), ...overrides });
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), "nutrihome-catalog-")); const file = join(folder, "test.db");
  const sqlite = new Sqlite(file); migrateFixture(sqlite); sqlite.close(); client = createDatabase(`file:${file}`);
  await client.household.create({ data: { id: actor.householdId, name: "Test" } });
  await client.user.create({ data: { id: actor.userId, householdId: actor.householdId, username: actor.userId, passwordHash: "not-a-usable-credential" } });
});
afterEach(async () => { await client.$disconnect(); rmSync(folder, { recursive: true, force: true }); });
it("catalog save changes neither stock nor diary; stock requires a separate confirmed operation", async () => {
  const id = await saveCatalogProduct(client, actor, input());
  expect(await client.inventoryBatch.count()).toBe(0); expect(await client.foodLog.count()).toBe(0);
  const batch = { productId: id, requestKey: randomUUID(), confirmed: false, quantity: "500", unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" };
  await expect(addBatch(client, actor, batch)).rejects.toThrow();
  await expect(addBatch(client, actor, { ...batch, confirmed: true, storageLocation: "UNKNOWN" })).rejects.toThrow();
  await addBatch(client, actor, { ...batch, confirmed: true });
  await addBatch(client, actor, { ...batch, confirmed: true });
  expect(await client.inventoryBatch.count()).toBe(1); expect(await client.inventoryTransaction.count()).toBe(1);
});
it("rejects duplicate barcode or normalized name without overwriting, and handles a replay", async () => {
  const request = input(), id = await saveCatalogProduct(client, actor, request);
  expect(await saveCatalogProduct(client, actor, request)).toBe(id);
  await expect(saveCatalogProduct(client, actor, input({ name: "Drugi naziv" }))).rejects.toThrow(/postoji/);
  await expect(saveCatalogProduct(client, actor, input({ name: "cokoladne PAHULJICE", brand: "test", barcode: "" }))).rejects.toThrow(/postoji/);
  await expect(saveCatalogProduct(client, actor, { ...request, calories: "300" })).rejects.toThrow(/iskorišten/);
  expect((await client.foodProduct.findUniqueOrThrow({ where: { id } })).caloriesPer100gCenti).toBe(20000);
});
it("does not resurrect a deleted product through an old request", async () => {
  const request = input(), id = await saveCatalogProduct(client, actor, request);
  await client.foodProduct.delete({ where: { id } });
  await expect(saveCatalogProduct(client, actor, request)).rejects.toThrow(/više ne postoji/);
});
it("scopes searches and writes to authenticated household members", async () => {
  const other = { userId: actor.userId, householdId: "other" }, fetcher = vi.fn();
  await expect(saveCatalogProduct(client, other, input())).rejects.toThrow(/Pristup/);
  await expect(searchFoods(client, other, "test", false, { fetcher })).rejects.toThrow(/Pristup/);
  expect(fetcher).not.toHaveBeenCalled();
  await client.household.create({ data: { id: "other", name: "Other" } });
  await client.user.create({ data: { id: "other", householdId: "other", username: "other", passwordHash: "not-a-usable-credential" } });
  await saveCatalogProduct(client, actor, input());
  expect((await searchFoods(client, { userId: "other", householdId: "other" }, "pahuljice", false, { localOnly: true })).results).toHaveLength(0);
});
it("keeps Croatian local results if both external services fail", async () => {
  await saveCatalogProduct(client, actor, input());
  const fetcher = vi.fn(async () => { throw new Error("secret upstream error must not escape"); });
  const result = await searchFoods(client, actor, "COKOLADNE", false, { fetcher, usdaKey: "test-only-not-a-real-key" });
  expect(result.results).toHaveLength(1); expect(result.results[0].source).toBe("LOCAL");
  expect(result.warnings).toHaveLength(2); expect(JSON.stringify(result)).not.toContain("secret upstream");
});
it("supports unknown barcode and performs no external calls for local-only search", async () => {
  const fetcher = vi.fn(async () => Response.json({ status: 0 }));
  expect((await searchFoods(client, actor, "4006381333931", true, { fetcher })).results).toHaveLength(0);
  await searchFoods(client, actor, "test", false, { fetcher, localOnly: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(searchFoods(client, actor, "4006381333932", true, { fetcher })).rejects.toThrow(/Barkod/);
});
it("sends only search data to fixed providers and keeps the USDA key out of results and URLs", async () => {
  const fetcher = vi.fn(async (url: Parameters<ProviderFetch>[0]) => String(url).includes("usda") ? Response.json({ foods: [{ fdcId: 5, description: "Apple", dataType: "Foundation", foodNutrients: [] }] }) : Response.json({ products: [] }));
  const result = await searchFoods(client, actor, "jabuka", false, { fetcher, usdaKey: "test-only-not-a-real-key" });
  const call = fetcher.mock.calls.find(([url]) => String(url).includes("usda"))!;
  expect(String(call[0])).not.toContain("test-only");
  const init = (fetcher.mock.calls as unknown as [URL, RequestInit][]).find(([url]) => String(url).includes("usda"))![1];
  expect(JSON.parse(String(init.body))).toMatchObject({ query: "apple" });
  expect(JSON.stringify(result)).not.toContain("test-only");
});
it("bounds repeated OCR and search attempts", () => {
  const id = randomUUID();
  for (let i = 0; i < 5; i++) expect(allowCatalogRequest(id, "ocr", 1000)).toBe(true);
  expect(allowCatalogRequest(id, "ocr", 1001)).toBe(false);
  expect(allowCatalogRequest(id, "search", 1001)).toBe(true);
  expect(allowCatalogRequest(id, "ocr", 61000)).toBe(true);
});
