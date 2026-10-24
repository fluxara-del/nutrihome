import { it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
it("upgrades phase 3 in place without changing existing nutrition, stock or IDs", () => {
  const sqlite = new Sqlite(":memory:");
  try {
    const migrations = readdirSync("prisma/migrations").filter(n => /^\d/.test(n)).sort();
    for (const migration of migrations.slice(0, -1)) sqlite.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    sqlite.exec(`INSERT INTO Household (id,name) VALUES ('h','Existing');
      INSERT INTO FoodProduct (id,householdId,name,category,caloriesPer100gCenti,proteinPer100gCenti,carbsPer100gCenti,fatPer100gCenti,updatedAt)
        VALUES ('p','h','Existing product','Test',12345,1000,2000,3000,CURRENT_TIMESTAMP);
      INSERT INTO InventoryBatch (id,householdId,productId,quantityMg,storageLocation) VALUES ('b','h','p',123456,'PANTRY');`);
    const product = sqlite.prepare("SELECT * FROM FoodProduct").get() as Record<string, unknown>;
    const batch = sqlite.prepare("SELECT * FROM InventoryBatch").get();
    sqlite.exec(readFileSync(`prisma/migrations/${migrations.at(-1)}/migration.sql`, "utf8"));
    expect(sqlite.prepare("SELECT * FROM FoodProduct").get()).toMatchObject(product);
    expect(sqlite.prepare("SELECT * FROM InventoryBatch").get()).toEqual(batch);
    expect(sqlite.prepare("SELECT nutritionSource,sourceNutritionBasis,fiberKnown FROM FoodProduct").get()).toEqual({ nutritionSource: "MANUAL", sourceNutritionBasis: "PER_100_G", fiberKnown: 1 });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally { sqlite.close(); }
});
