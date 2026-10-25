import { normalizeFoodName } from "./food-draft";
import { createHash, randomUUID } from "node:crypto";
import type { FoodProduct, Prisma, PrismaClient, Unit } from "@prisma/client";
import { positiveInt, toMilligrams } from "./quantities";
import { expiryState, localDate } from "./calendar";
import { InventoryError, parse, productSchema, productData, batchSchema, consumeSchema, adjustSchema, editBatchSchema, batchMetadata, locationLabels } from "./inventory-input";
export type InventoryActor = { userId: string; householdId: string };
type Client = Prisma.TransactionClient;
async function authorize(client: Client, actor: InventoryActor) {
  if (!await client.user.findFirst({ where: { id: actor.userId, householdId: actor.householdId }, select: { id: true } })) throw new InventoryError("Pristup nije dopušten.");
}
function prismaCode(error: unknown) { return (error as { code?: string })?.code; }
export function inventoryMessage(error: unknown) {
  if (error instanceof InventoryError) return error.message;
  if (prismaCode(error) === "P2002") return "Proizvod s tim barkodom već postoji u kućanstvu.";
  if (prismaCode(error) === "P2003") return "Proizvod s poviješću ili povezanim podacima ne može se izbrisati.";
  return "Promjena nije spremljena. Pokušajte ponovno ili osvježite stranicu.";
}
export async function saveProduct(client: PrismaClient, actor: InventoryActor, raw: unknown, id?: string) {
  const data = productData(parse(productSchema, raw));
  return client.$transaction(async tx => {
    await authorize(tx, actor);
    if (id) {
      const current = await tx.foodProduct.findFirst({ where: { id, householdId: actor.householdId } });
      if (current && current.nutritionState !== data.nutritionState && await tx.inventoryBatch.count({ where: { productId: id, quantityMg: { gt: 0 } } })) throw new InventoryError("Sirovo/kuhano ne može se mijenjati dok proizvod ima zalihu. Koristite zaseban proizvod za drugo stanje.");
      const changed = await tx.foodProduct.updateMany({ where: { id, householdId: actor.householdId }, data: { ...data, nutritionSource: "MANUAL", sourceReference: null, sourceNutritionBasis: "PER_100_G" } });
      if (changed.count !== 1) throw new InventoryError("Proizvod nije pronađen.");
      return id;
    }
    return (await tx.foodProduct.create({ data: { ...data, householdId: actor.householdId } })).id;
  });
}
export async function deleteProduct(client: PrismaClient, actor: InventoryActor, id: string, confirmed: boolean) {
  if (!confirmed) throw new InventoryError("Potvrdite brisanje proizvoda.");
  await client.$transaction(async tx => {
    await authorize(tx, actor);
    const result = await tx.foodProduct.deleteMany({ where: { id, householdId: actor.householdId } });
    if (result.count !== 1) throw new InventoryError("Proizvod nije pronađen.");
  });
}
function mass(product: FoodProduct, quantity: string, unit: Unit, allowZero = false) {
  if (allowZero && /^0+(?:[.,]0{1,3})?$/.test(quantity)) return 0;
  try { return toMilligrams(quantity, unit, { densityMgPerMl: product.densityMgPerMl ?? undefined, pieceWeightMg: product.pieceWeightMg ?? undefined }); }
  catch { throw new InventoryError("Količina ili pretvorba nije ispravna. Za ml/l potrebna je gustoća, za komade masa komada. Najviše 3 decimale."); }
}
type OperationInput = { productId: string; requestKey: string; confirmed: true };
export type OperationResult = { operationId: string; replayed: boolean };
function fingerprint(actor: InventoryActor, kind: string, input: OperationInput) {
  return createHash("sha256").update(JSON.stringify({ actor: actor.userId, kind, input })).digest("hex");
}
function replay(existing: { id: string; requestHash: string }, hash: string): OperationResult {
  if (existing.requestHash !== hash) throw new InventoryError("Ovaj zahtjev već je upotrijebljen za drugu promjenu. Osvježite obrazac.");
  return { operationId: existing.id, replayed: true };
}
function isBusy(error: unknown) {
  // The SQLite adapter maps SQLITE_BUSY to Prisma P1008 (SocketTimeout).
  return ["P2034", "P1008"].includes(prismaCode(error) ?? "") || /SQLITE_BUSY|database is locked|write conflict/i.test(error instanceof Error ? error.message : "");
}
async function operation<T extends OperationInput>(client: PrismaClient, actor: InventoryActor, kind: string, input: T, summary: string,
  apply: (tx: Client, product: FoodProduct, operationId: string) => Promise<void>): Promise<OperationResult> {
  const hash = fingerprint(actor, kind, input), key = { householdId: actor.householdId, requestKey: input.requestKey };
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        await authorize(tx, actor);
        const existing = await tx.inventoryOperation.findUnique({ where: { householdId_requestKey: key } });
        if (existing) return replay(existing, hash);
        const product = await tx.foodProduct.findFirst({ where: { id: input.productId, householdId: actor.householdId } });
        if (!product) throw new InventoryError("Proizvod nije pronađen.");
        const saved = await tx.inventoryOperation.create({ data: { ...key, userId: actor.userId, productId: product.id, kind, requestHash: hash, summary, detail: JSON.stringify(input) } });
        await apply(tx, product, saved.id);
        return { operationId: saved.id, replayed: false };
      }, { timeout: 15000 });
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        const existing = await client.inventoryOperation.findUnique({ where: { householdId_requestKey: key } });
        if (existing) return replay(existing, hash);
      }
      if (!isBusy(error)) throw error;
      if (attempt >= 2) throw new InventoryError("Zalihe se upravo mijenjaju. Pokušajte ponovno s istim obrascem.");
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
async function record(tx: Client, actor: InventoryActor, operationId: string, productId: string, batchId: string, change: number, reason: string) {
  await tx.inventoryTransaction.create({ data: { householdId: actor.householdId, productId, batchId, operationId, quantityChangeMg: change, reason, sourceReference: `${operationId}:${batchId}` } });
}
export async function addBatch(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parse(batchSchema, raw), metadata = batchMetadata(input);
  return operation(client, actor, "ADD", input, "Dodavanje zalihe", async (tx, product, id) => {
    const quantityMg = mass(product, input.quantity, input.unit);
    const batch = await tx.inventoryBatch.create({ data: { ...metadata, householdId: actor.householdId, productId: product.id, quantityMg, unit: input.unit } });
    await record(tx, actor, id, product.id, batch.id, quantityMg, "Dodavanje zalihe");
  });
}
export async function consumeStock(client: PrismaClient, actor: InventoryActor, raw: unknown, today = localDate()) {
  const input = parse(consumeSchema, raw);
  return operation(client, actor, "CONSUME", input, "Potvrđena potrošnja", async (tx, product, id) => {
    await consumeProductInTransaction(tx, actor, product.id, mass(product, input.quantity, input.unit), id, today);
  });
}
export async function adjustBatch(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parse(adjustSchema, raw);
  return operation(client, actor, "ADJUST", input, `Ispravak količine: ${input.reason}`, async (tx, product, id) => {
    const batch = await tx.inventoryBatch.findFirst({ where: { id: input.batchId, productId: product.id, householdId: actor.householdId } });
    if (!batch) throw new InventoryError("Serija nije pronađena.");
    if (batch.version !== input.version) throw new InventoryError("Serija je u međuvremenu promijenjena. Osvježite stranicu prije ispravka.");
    const quantityMg = mass(product, input.quantity, input.unit, true), delta = quantityMg - batch.quantityMg;
    if (delta === 0) throw new InventoryError("Unesena količina jednaka je postojećoj.");
    const changed = await tx.inventoryBatch.updateMany({ where: { id: batch.id, householdId: actor.householdId, version: input.version }, data: { quantityMg, version: { increment: 1 } } });
    if (changed.count !== 1) throw new InventoryError("Serija se promijenila. Osvježite stranicu.");
    await record(tx, actor, id, product.id, batch.id, delta, `Ispravak: ${input.reason}`);
  });
}
export async function editBatch(client: PrismaClient, actor: InventoryActor, raw: unknown) {
  const input = parse(editBatchSchema, raw), metadata = batchMetadata(input);
  return operation(client, actor, "UPDATE_BATCH", input,
    `Podaci serije: ${locationLabels[metadata.storageLocation]}, rok ${metadata.expirationDate ?? "nije naveden"}, kupnja ${metadata.purchaseDate ?? "nije navedena"}, cijena ${metadata.purchasePriceCents === null ? "nije navedena" : `${(metadata.purchasePriceCents / 100).toLocaleString("hr-HR")} €`}`,
    async (tx, product) => {
      const changed = await tx.inventoryBatch.updateMany({ where: { id: input.batchId, productId: product.id, householdId: actor.householdId, version: input.version }, data: { ...metadata, version: { increment: 1 } } });
      if (changed.count !== 1) throw new InventoryError("Serija nije dostupna ili je promijenjena. Osvježite stranicu.");
    });
}
export type InventoryFilters = { q?: string; category?: string; location?: string; status?: string; page?: number };
const normalize = normalizeFoodName;
export async function listInventory(client: PrismaClient, actor: InventoryActor, filters: InventoryFilters = {}, today = localDate()) {
  await authorize(client, actor);
  const products = await client.foodProduct.findMany({ where: { householdId: actor.householdId }, orderBy: [{ name: "asc" }, { id: "asc" }], include: { batches: { where: { quantityMg: { gt: 0 } } } } });
  const rows = products.map(product => {
    const usableMg = product.batches.filter(batch => expiryState(batch.expirationDate, today) !== "expired").reduce((sum, batch) => sum + batch.quantityMg, 0);
    const expiredMg = product.batches.filter(batch => expiryState(batch.expirationDate, today) === "expired").reduce((sum, batch) => sum + batch.quantityMg, 0);
    const soon = product.batches.filter(batch => expiryState(batch.expirationDate, today) === "soon").length;
    return { product, usableMg, expiredMg, soon, low: product.lowStockThresholdMg > 0 && usableMg <= product.lowStockThresholdMg };
  });
  const search = normalize((filters.q ?? "").slice(0, 120));
  const matched = rows.filter(row => (!search || normalize([row.product.name, row.product.brand, row.product.barcode].join(" ")).includes(search)) &&
    (!filters.category || row.product.category === filters.category) && (!filters.location || row.product.batches.some(batch => batch.storageLocation === filters.location)) &&
    (!filters.status || (filters.status === "low" && row.low) || (filters.status === "soon" && row.soon > 0) || (filters.status === "expired" && row.expiredMg > 0)));
  const pages = Math.max(1, Math.ceil(matched.length / 20)), page = Math.max(1, Math.min(pages, Math.floor(filters.page ?? 1) || 1));
  return { rows: matched.slice((page - 1) * 20, page * 20), total: matched.length, page, pages,
    categories: [...new Set(products.map(product => product.category))].sort(), summary: { products: rows.length, low: rows.filter(row => row.low).length, soon: rows.reduce((n, row) => n + row.soon, 0), expired: rows.filter(row => row.expiredMg > 0).length } };
}
export async function productInventory(client: PrismaClient, actor: InventoryActor, id: string, historyPage = 1) {
  await authorize(client, actor);
  const product = await client.foodProduct.findFirst({ where: { id, householdId: actor.householdId }, include: { batches: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] } } });
  if (!product) return null;
  const page = Math.max(1, Math.min(100000, Math.floor(historyPage) || 1));
  const [history, historyCount] = await Promise.all([
    client.inventoryOperation.findMany({ where: { householdId: actor.householdId, productId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, include: { transactions: true, user: { select: { username: true } } } }),
    client.inventoryOperation.count({ where: { householdId: actor.householdId, productId: id } }),
  ]);
  const legacy = await client.inventoryTransaction.findMany({ where: { householdId: actor.householdId, productId: id, operationId: null }, orderBy: { timestamp: "desc" } });
  return { product, history, historyCount, historyPage: page, legacy };
}

// Caller must create its InventoryOperation in this same authorized transaction.
export async function consumeProductInTransaction(tx: Client, actor: InventoryActor, productId: string, quantityMg: number, operationId: string, today = localDate(), reason = "Potvrđena potrošnja") {
  let remaining = positiveInt(quantityMg);
    const batches = (await tx.inventoryBatch.findMany({ where: { householdId: actor.householdId, productId: productId, quantityMg: { gt: 0 }, OR: [{ expirationDate: null }, { expirationDate: { gte: today } }] } }))
      .sort((a, b) => (a.expirationDate === null && b.expirationDate === null ? 0 : a.expirationDate === null ? 1 : b.expirationDate === null ? -1 : a.expirationDate.localeCompare(b.expirationDate)) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    if (batches.reduce((sum, batch) => sum + batch.quantityMg, 0) < remaining) throw new InventoryError("Nema dovoljno upotrebljivih zaliha. Istekle serije nisu uključene.");
    for (const batch of batches) {
      if (remaining === 0) break;
      const take = Math.min(remaining, batch.quantityMg);
      const changed = await tx.inventoryBatch.updateMany({ where: { id: batch.id, householdId: actor.householdId, version: batch.version, quantityMg: { gte: take } }, data: { quantityMg: { decrement: take }, version: { increment: 1 } } });
      if (changed.count !== 1) throw new InventoryError("Zaliha se promijenila. Osvježite stranicu pa potvrdite novu potrošnju.");
      await record(tx, actor, operationId, productId, batch.id, -take, reason);
      remaining -= take;
    }
}
