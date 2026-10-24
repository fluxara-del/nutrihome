import "dotenv/config";
import { db } from "../src/lib/db";
async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Testni podaci zahtijevaju ALLOW_DEMO_SEED=true i zasebnu testnu bazu.");
  const user = await db().user.findFirst();
  if (!user) throw new Error("Najprije stvorite testnog vlasnika.");
  const productId = `demo-oats-${user.householdId}`;
  await db().$transaction(async tx => {
    await tx.foodProduct.upsert({ where: { id: productId }, update: {}, create: {
      id: productId, householdId: user.householdId, name: "Zobene pahuljice (TESTNI PODATAK)", category: "Žitarice",
      caloriesPer100gCenti: 37000, proteinPer100gCenti: 1300, carbsPer100gCenti: 6000, fatPer100gCenti: 700, fiberPer100gCenti: 1000, estimatedNutrition: true,
    } });
    const batchId = `demo-batch-${user.householdId}`;
    if (!await tx.inventoryBatch.findUnique({ where: { id: batchId } })) {
      await tx.inventoryBatch.create({ data: { id: batchId, householdId: user.householdId, productId, quantityMg: 500000, storageLocation: "PANTRY" } });
      await tx.inventoryTransaction.create({ data: { householdId: user.householdId, productId, batchId, quantityChangeMg: 500000, reason: "Testni početni unos", sourceReference: "demo-seed-oats" } });
    }
  });
  console.log("Označeni testni podaci su dodani. Ponovni poziv ih ne duplicira.");
}
main().catch(() => { console.error("Testni unos nije uspio. Provjerite ALLOW_DEMO_SEED i testni račun."); process.exitCode = 1; }).finally(() => db().$disconnect());
