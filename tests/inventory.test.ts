import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/lib/db";
import { addBatch, consumeStock, adjustBatch, editBatch, saveProduct, deleteProduct, listInventory, productInventory } from "../src/lib/inventory";
import { productSchema, productData, parse } from "../src/lib/inventory-input";
import { migrateFixture } from "./migrations";
let directory: string, client: ReturnType<typeof createDatabase>, url: string, productId: string;
const actor = { userId: "owner", householdId: "home" }, other = { userId: "other-owner", householdId: "other-home" };
const productInput = () => ({ name: "Zobene pahuljice", brand: "Marka", category: "Žitarice", barcode: "", calories: "370", protein: "13", carbs: "60", fat: "7", fiber: "10", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "100", estimatedNutrition: false });
const base = () => ({ productId, requestKey: randomUUID(), confirmed: true as const });
const batchInput = (quantity = "500", expirationDate = "") => ({ ...base(), quantity, unit: "G", storageLocation: "PANTRY", expirationDate, purchaseDate: "", purchasePrice: "2,49" });
async function stock(quantity = "500", expiration = "", storageLocation = "PANTRY") {
  await addBatch(client, actor, { ...batchInput(quantity, expiration), storageLocation });
  return client.inventoryBatch.findFirstOrThrow({ where: { productId, expirationDate: expiration || null }, orderBy: { createdAt: "desc" } });
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "nutrihome-inventory-"));
  const path = join(directory, "test.db"); url = `file:${path}`;
  const raw = new Sqlite(path); raw.pragma("journal_mode = WAL"); migrateFixture(raw); raw.close();
  client = createDatabase(url);
  for (const user of [actor, other]) await client.household.create({ data: { id: user.householdId, name: "Test", users: { create: { id: user.userId, username: user.userId, passwordHash: "test-only-not-a-password" } } } });
  productId = await saveProduct(client, actor, productInput());
});
afterEach(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("product catalogue", () => {
  it("creates and edits exact fixed-point values without altering stock", async () => {
    await stock();
    await saveProduct(client, actor, { ...productInput(), name: "Zobene pahuljice fino", calories: "370,25", protein: "13,5", density: "1,03", pieceWeight: "50,125" }, productId);
    const p = await client.foodProduct.findUniqueOrThrow({ where: { id: productId } });
    expect(p.caloriesPer100gCenti).toBe(37025); expect(p.proteinPer100gCenti).toBe(1350);
    expect(p.densityMgPerMl).toBe(1030); expect(p.pieceWeightMg).toBe(50125);
    expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(500000);
  });
  it("keeps barcodes unique within a household, not across households", async () => {
    const input = { ...productInput(), barcode: "4006381333931" };
    await saveProduct(client, actor, input, productId);
    await expect(saveProduct(client, actor, input)).rejects.toMatchObject({ code: "P2002" });
    await expect(saveProduct(client, other, input)).resolves.toBeTruthy();
  });
  it("validates macros, density, unit precision and calendar dates", () => {
    for (const changed of [{ protein: "100,01" }, { calories: "1001" }, { density: "0" }, { defaultUnit: "ML" }, { defaultUnit: "PIECE" }, { fat: "-1" }, { lowStock: "1.0001" }]) expect(() => productData(parse(productSchema, { ...productInput(), ...changed }))).toThrow();
  });
  it("deletes only unused products, retaining history even after all stock is removed", async () => {
    const unused = await saveProduct(client, actor, { ...productInput(), name: "Nekorišten proizvod" });
    await deleteProduct(client, actor, unused, true);
    expect(await client.foodProduct.findUnique({ where: { id: unused } })).toBeNull();
    const batch = await stock();
    await adjustBatch(client, actor, { ...base(), batchId: batch.id, version: 0, quantity: "0", unit: "G", reason: "Otpis oštećene ambalaže" });
    await expect(deleteProduct(client, actor, productId, true)).rejects.toMatchObject({ code: "P2003" });
    expect(await client.inventoryTransaction.count()).toBe(2);
  });
});
describe("audited inventory operations", () => {
  it("adds stock and audit atomically, replays the same request once, rejects changed payloads", async () => {
    const input = batchInput();
    const first = await addBatch(client, actor, input), again = await addBatch(client, actor, input);
    expect(again).toEqual({ operationId: first.operationId, replayed: true });
    await expect(addBatch(client, actor, { ...input, quantity: "600" })).rejects.toThrow("drugu promjenu");
    expect(await client.inventoryBatch.count()).toBe(1); expect(await client.inventoryOperation.count()).toBe(1);
    const tx = await client.inventoryTransaction.findFirstOrThrow();
    expect(tx.quantityChangeMg).toBe(500000); expect(tx.operationId).toBe(first.operationId);
    expect((await client.inventoryBatch.findFirstOrThrow()).purchasePriceCents).toBe(249);
  });
  it("requires explicit confirmation and rejects expired date syntax, missing conversions and unsafe amounts", async () => {
    for (const changed of [{ confirmed: false }, { expirationDate: "2026-02-30" }, { quantity: "-1" }, { quantity: "0" }, { quantity: "1.0001" }, { quantity: "3000", unit: "KG" }, { unit: "ML" }, { purchaseDate: "2999-01-01" }, { purchaseDate: "2026-10-10", expirationDate: "2026-10-09" }]) await expect(addBatch(client, actor, { ...batchInput(), ...changed })).rejects.toThrow();
    expect(await client.inventoryBatch.count()).toBe(0); expect(await client.inventoryOperation.count()).toBe(0); expect(await client.inventoryTransaction.count()).toBe(0);
  });
  it("uses verified density and piece mass, without rounding through binary fractions", async () => {
    await saveProduct(client, actor, { ...productInput(), density: "1,03", pieceWeight: "50,125" }, productId);
    await addBatch(client, actor, { ...batchInput("250"), unit: "ML" });
    await addBatch(client, actor, { ...batchInput("2"), unit: "PIECE" });
    const quantities = (await client.inventoryBatch.findMany()).map(b => b.quantityMg).sort((a, b) => a - b);
    expect(quantities).toEqual([100250, 257500]);
  });
  it("consumes FEFO across batches, skips expired stock and puts undated stock last", async () => {
    const expired = await stock("900", "2026-10-23");
    const undated = await stock("200");
    const late = await stock("300", "2026-11-01");
    const soon = await stock("100", "2026-10-24");
    const input = { ...base(), quantity: "450", unit: "G" };
    await consumeStock(client, actor, input, "2026-10-24");
    const quantity = async (id: string) => (await client.inventoryBatch.findUniqueOrThrow({ where: { id } })).quantityMg;
    expect(await quantity(expired.id)).toBe(900000); expect(await quantity(soon.id)).toBe(0);
    expect(await quantity(late.id)).toBe(0); expect(await quantity(undated.id)).toBe(150000);
    expect((await consumeStock(client, actor, input, "2026-10-25")).replayed).toBe(true);
    expect(await quantity(undated.id)).toBe(150000);
    expect(await client.inventoryTransaction.count({ where: { quantityChangeMg: { lt: 0 } } })).toBe(3);
  });
  it("rejects insufficient usable stock without partial changes or phantom audit", async () => {
    await stock("100", "2026-10-24"); await stock("900", "2026-10-23");
    await expect(consumeStock(client, actor, { ...base(), quantity: "101", unit: "G" }, "2026-10-24")).rejects.toThrow("Nema dovoljno");
    expect(await client.inventoryOperation.count()).toBe(2);
    expect(await client.inventoryTransaction.count()).toBe(2);
    expect((await client.inventoryBatch.aggregate({ _sum: { quantityMg: true } }))._sum.quantityMg).toBe(1000000);
  });
  it("rejects stale adjustments; records corrections and zero-stock disposal", async () => {
    const b = await stock();
    await consumeStock(client, actor, { ...base(), quantity: "100", unit: "G" });
    await expect(adjustBatch(client, actor, { ...base(), batchId: b.id, version: 0, quantity: "500", unit: "G", reason: "Pogrešno prebrojano" })).rejects.toThrow("međuvremenu");
    const input = { ...base(), batchId: b.id, version: 1, quantity: "450", unit: "G", reason: "Ispravak nakon vaganja" };
    await adjustBatch(client, actor, input); await adjustBatch(client, actor, input);
    const latest = await client.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(latest.quantityMg).toBe(450000); expect(latest.version).toBe(2);
    await adjustBatch(client, actor, { ...base(), batchId: b.id, version: 2, quantity: "0", unit: "G", reason: "Otpis preostale količine" });
    expect((await client.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } })).quantityMg).toBe(0);
    expect(await client.inventoryTransaction.count()).toBe(4);
  });
  it("audits metadata changes without altering quantities or writing zero transactions", async () => {
    const b = await stock();
    const input = { ...base(), batchId: b.id, version: 0, storageLocation: "FRIDGE", expirationDate: "2026-12-01", purchaseDate: "2026-10-01", purchasePrice: "3,25" };
    await editBatch(client, actor, input); await editBatch(client, actor, input);
    const latest = await client.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(latest).toMatchObject({ storageLocation: "FRIDGE", quantityMg: 500000, version: 1, purchasePriceCents: 325 });
    expect(await client.inventoryOperation.count()).toBe(2); expect(await client.inventoryTransaction.count()).toBe(1);
    await expect(client.inventoryOperation.updateMany({ data: { summary: "tamper" } })).rejects.toThrow();
  });
  it("rolls back quantity changes if the audit write fails", async () => {
    const b = await stock();
    await client.$executeRawUnsafe(`CREATE TRIGGER fail_test_audit BEFORE INSERT ON InventoryTransaction WHEN NEW.quantityChangeMg < 0 BEGIN SELECT RAISE(ABORT, 'test audit failure'); END`);
    await expect(consumeStock(client, actor, { ...base(), quantity: "100", unit: "G" })).rejects.toThrow();
    expect((await client.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } })).quantityMg).toBe(500000);
    expect(await client.inventoryOperation.count()).toBe(1);
  });
  it("prevents overselling under competing clients and deduplicates concurrent replay", async () => {
    await stock("100");
    const second = createDatabase(url);
    try {
      const results = await Promise.allSettled([consumeStock(client, actor, { ...base(), quantity: "100", unit: "G" }), consumeStock(second, actor, { ...base(), quantity: "100", unit: "G" })]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toHaveProperty("reason.message", expect.stringContaining("Nema dovoljno"));
      expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(0);
      expect(await client.inventoryOperation.count()).toBe(2);
      const request = batchInput("50");
      const duplicate = await Promise.all([addBatch(client, actor, request), addBatch(second, actor, request)]);
      expect(duplicate[0].operationId).toBe(duplicate[1].operationId);
      expect(await client.inventoryBatch.count()).toBe(2);
    } finally { await second.$disconnect(); }
  }, 30000);
});
describe("scope and warnings", () => {
  it("denies foreign product/batch IDs and spoofed actors on reads and writes", async () => {
    const b = await stock();
    const foreign = await saveProduct(client, other, productInput());
    expect(await productInventory(client, other, productId)).toBeNull();
    expect((await listInventory(client, other)).rows.map(row => row.product.id)).toEqual([foreign]);
    for (const run of [() => addBatch(client, other, batchInput()), () => consumeStock(client, other, { ...base(), quantity: "1", unit: "G" }), () => saveProduct(client, other, productInput(), productId), () => deleteProduct(client, other, productId, true), () => adjustBatch(client, other, { ...base(), productId: foreign, batchId: b.id, version: 0, quantity: "0", unit: "G", reason: "Otpis tuđe serije" }), () => listInventory(client, { ...actor, householdId: other.householdId })]) await expect(run()).rejects.toThrow();
    await expect(addBatch(client, actor, { ...batchInput(), householdId: other.householdId })).rejects.toThrow();
    expect((await client.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } })).quantityMg).toBe(500000);
  });
  it("searches Croatian names and barcodes, filters alerts and locations using usable quantities", async () => {
    await saveProduct(client, actor, { ...productInput(), barcode: "4006381333931", lowStock: "150" }, productId);
    await stock("100", "2026-10-26", "FRIDGE"); await stock("500", "2026-10-23");
    const all = await listInventory(client, actor, { q: "zitarice" }, "2026-10-24");
    expect(all.rows).toHaveLength(0); // Search covers product, brand and barcode; category has its own filter.
    const result = await listInventory(client, actor, { q: "ZOBENE", category: "Žitarice", status: "low", location: "FRIDGE" }, "2026-10-24");
    expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ usableMg: 100000, expiredMg: 500000, soon: 1, low: true });
    expect((await listInventory(client, actor, { q: "4006381333931", status: "expired" }, "2026-10-24")).total).toBe(1);
    expect((await listInventory(client, actor, { location: "FREEZER" }, "2026-10-24")).total).toBe(0);
  });
  it("paginates catalogue and operation history deterministically", async () => {
    for (let index = 0; index < 21; index++) await saveProduct(client, actor, { ...productInput(), name: `Proizvod ${index}` });
    expect((await listInventory(client, actor, { page: 1 })).rows).toHaveLength(20);
    expect((await listInventory(client, actor, { page: 2 })).rows).toHaveLength(2);
    await stock();
    const history = await productInventory(client, actor, productId);
    expect(history?.historyCount).toBe(1); expect(history?.history[0].transactions).toHaveLength(1);
  });
});
it("upgrades phase 1 databases without losing existing stock or audit", () => {
  const raw = new Sqlite(":memory:");
  try {
    raw.exec(readFileSync("prisma/migrations/20261024000000_foundation/migration.sql", "utf8"));
    raw.exec(`INSERT INTO Household (id,name) VALUES ('h','Test'); INSERT INTO FoodProduct (id,householdId,name,category,caloriesPer100gCenti,proteinPer100gCenti,carbsPer100gCenti,fatPer100gCenti,updatedAt) VALUES ('p','h','P','C',100,1,1,1,CURRENT_TIMESTAMP); INSERT INTO InventoryBatch (id,householdId,productId,quantityMg,storageLocation) VALUES ('b','h','p',12345,'PANTRY'); INSERT INTO InventoryTransaction (id,householdId,productId,batchId,quantityChangeMg,reason,sourceReference) VALUES ('t','h','p','b',12345,'Test','once')`);
    raw.exec(readFileSync("prisma/migrations/20261024010000_inventory_operations/migration.sql", "utf8"));
    expect(raw.prepare("SELECT quantityMg,version FROM InventoryBatch").get()).toEqual({ quantityMg: 12345, version: 0 });
    expect(raw.prepare("SELECT operationId,quantityChangeMg FROM InventoryTransaction").get()).toEqual({ operationId: null, quantityChangeMg: 12345 });
    expect(raw.pragma("foreign_key_check")).toEqual([]);
  } finally { raw.close(); }
});

it("QA regression: unknown fiber remains editable and is not recorded as a confirmed zero", async () => {
  await client.foodProduct.update({where:{id:productId},data:{fiberKnown:false,fiberPer100gCenti:0,estimatedNutrition:true}});
  await saveProduct(client,actor,{...productInput(),name:"Samo promjena naziva",fiber:"",estimatedNutrition:false},productId);
  const product=await client.foodProduct.findUniqueOrThrow({where:{id:productId}});
  expect(product.fiberKnown).toBe(false);expect(product.estimatedNutrition).toBe(true);
});
it("QA regression: inventory search handles Croatian đ without diacritics", async () => {
  await saveProduct(client,actor,{...productInput(),name:"Đumbir"},productId);
  expect((await listInventory(client,actor,{q:"dumbir"})).rows.map(row=>row.product.id)).toContain(productId);
});

it("QA regression: rejects an invalid manual barcode check digit", async () => {
  await expect(saveProduct(client,actor,{...productInput(),barcode:"4006381333932"})).rejects.toThrow(/Barkod/);
});
