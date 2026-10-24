import { db } from "../src/lib/db";
import { saveProduct, addBatch, consumeStock } from "../src/lib/inventory";
async function main() {
  if (process.env.NUTRIHOME_SMOKE !== "1") throw new Error("Samo za izolirani Docker smoke test.");
  const user = await db().user.findUniqueOrThrow({ where: { username: "smoke_owner" } });
  const actor = { userId: user.id, householdId: user.householdId };
  let product = await db().foodProduct.findFirst({ where: { householdId: user.householdId, name: "Docker TEST zaliha" } });
  if (process.argv[2] !== "verify") {
    const productId = product?.id ?? await saveProduct(db(), actor, { name: "Docker TEST zaliha", brand: "", barcode: "", category: "Test", calories: "100", protein: "1", carbs: "1", fat: "1", fiber: "0", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "100", estimatedNutrition: true });
    await addBatch(db(), actor, { productId, requestKey: "df77d617-1111-4111-8111-111111111111", confirmed: true, quantity: "500", unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" });
    const consume = { productId, requestKey: "df77d617-2222-4222-8222-222222222222", confirmed: true, quantity: "125", unit: "G" };
    await consumeStock(db(), actor, consume);
    const replay = await consumeStock(db(), actor, consume);
    if (!replay.replayed) throw new Error("Potrošnja nije idempotentna.");
    product = await db().foodProduct.findUniqueOrThrow({ where: { id: productId } });
  }
  if (!product) throw new Error("Nedostaje testni proizvod.");
  const batches = await db().inventoryBatch.findMany({ where: { productId: product.id } });
  if (batches.length !== 1 || batches[0].quantityMg !== 375000 || await db().inventoryTransaction.count({ where: { productId: product.id } }) !== 2) throw new Error("Zaliha ili povijest nisu sačuvane.");
  console.log("Docker inventory: fixed-point stock, confirmed consumption, replay protection and audit passed.");
}
main().catch(() => { console.error("Docker inventory smoke failed."); process.exitCode = 1; }).finally(() => db().$disconnect());
