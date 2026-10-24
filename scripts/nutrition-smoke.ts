import { db } from "../src/lib/db";
import { saveProduct, addBatch } from "../src/lib/inventory";
import { saveFoodLog, saveWeight, saveSettings } from "../src/lib/nutrition-diary";
import { localDate } from "../src/lib/calendar";
async function main() {
  if (process.env.NUTRIHOME_SMOKE !== "1") throw new Error("Samo za izolirani smoke test.");
  const user = await db().user.findUniqueOrThrow({ where: { username: "smoke_owner" } }), actor = { userId: user.id, householdId: user.householdId };
  let product = await db().foodProduct.findFirst({ where: { householdId: user.householdId, name: "Docker prehrana TEST" } });
  if (process.argv[2] !== "verify") {
    const productId = product?.id ?? await saveProduct(db(), actor, { name: "Docker prehrana TEST", brand: "", barcode: "", category: "Test", calories: "370", protein: "13", carbs: "60", fat: "7", fiber: "10", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "0", estimatedNutrition: true });
    await addBatch(db(), actor, { productId, requestKey: "7d3c0e35-1111-4111-8111-111111111111", confirmed: true, quantity: "500", unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" });
    const input = { requestKey: "7d3c0e35-2222-4222-8222-222222222222", confirmed: true, sourceType: "PRODUCT", sourceId: productId, date: localDate(), quantity: "100", unit: "G", foodState: "RAW", yield: "", yieldConfirmed: false, estimated: false, deductInventory: true, confirmedStock: true };
    await saveFoodLog(db(), actor, input);
    if (!(await saveFoodLog(db(), actor, input)).replayed) throw new Error("Dnevnik nije idempotentan.");
    await saveWeight(db(), actor, { requestKey: "7d3c0e35-3333-4333-8333-333333333333", confirmed: true, date: localDate(), weight: "80,125" });
    await saveSettings(db(), actor, { requestKey: "7d3c0e35-4444-4444-8444-444444444444", confirmed: true, version: 0, calories: "2200", protein: "120", carbs: "250", fat: "70", mealCount: 3, weeklyBudget: "", preferences: "", excluded: "", timezone: "Europe/Zagreb" });
    product = await db().foodProduct.findUniqueOrThrow({ where: { id: productId } });
  }
  if (!product) throw new Error("Nedostaje testni proizvod.");
  const [log, batch, weight, settings] = await Promise.all([
    db().foodLog.findFirstOrThrow({ where: { userId: user.id, productId: product.id } }),
    db().inventoryBatch.findFirstOrThrow({ where: { productId: product.id } }),
    db().weightLog.findFirstOrThrow({ where: { userId: user.id } }),
    db().userSettings.findUniqueOrThrow({ where: { userId: user.id } }),
  ]);
  if (log.calculatedCaloriesCenti !== 37000 || !log.nutritionSnapshot || !log.inventoryDeducted || batch.quantityMg !== 400000 || weight.weightG !== 80125 || !settings.goalsConfirmed || settings.calorieTargetCenti !== 220000) throw new Error("Podaci faze 3 nisu sačuvani.");
  console.log("Docker nutrition: diary snapshot, confirmed stock, request replay, weight and goals passed.");
}
main().catch(() => { console.error("Docker nutrition smoke failed."); process.exitCode = 1; }).finally(() => db().$disconnect());
