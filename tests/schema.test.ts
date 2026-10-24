import { migrateFixture } from "./migrations";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Sqlite from "better-sqlite3";

let db: Sqlite.Database;
beforeEach(() => {
  db = new Sqlite(":memory:");
  migrateFixture(db);
  db.exec(`INSERT INTO Household (id,name) VALUES ('h','Test'), ('other','Other');
    INSERT INTO User (id,householdId,username,passwordHash) VALUES ('u','h','test','not-a-credential');
    INSERT INTO FoodProduct (id,householdId,name,category,caloriesPer100gCenti,proteinPer100gCenti,carbsPer100gCenti,fatPer100gCenti,updatedAt)
      VALUES ('p','h','Test','Test',10000,1000,1000,1000,CURRENT_TIMESTAMP);
    INSERT INTO InventoryBatch (id,householdId,productId,quantityMg,storageLocation) VALUES ('b','h','p',100000,'PANTRY');`);
});
afterEach(() => db.close());
describe("initial SQLite migration constraints", () => {
  it("enables foreign keys and rejects negative stock", () => {
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() => db.exec(`UPDATE InventoryBatch SET quantityMg=-1 WHERE id='b'`)).toThrow();
    expect(() => db.exec(`DELETE FROM FoodProduct WHERE id='p'`)).toThrow();
    expect(() => db.exec(`INSERT INTO InventoryBatch (id,householdId,productId,quantityMg,storageLocation) VALUES ('bad','h','missing',1,'PANTRY')`)).toThrow();
  });
  it("rejects fractional, overflowing quantities and batch identity changes", () => {
    expect(() => db.exec(`UPDATE InventoryBatch SET quantityMg=1.5 WHERE id='b'`)).toThrow();
    expect(() => db.exec(`UPDATE InventoryBatch SET quantityMg=2147483648 WHERE id='b'`)).toThrow();
    expect(() => db.exec(`UPDATE InventoryBatch SET householdId='other' WHERE id='b'`)).toThrow();
  });
  it("rejects invalid dates and storage values", () => {
    expect(() => db.exec(`UPDATE InventoryBatch SET expirationDate='2026-02-30' WHERE id='b'`)).toThrow();
    expect(() => db.exec(`UPDATE InventoryBatch SET storageLocation='OUTSIDE' WHERE id='b'`)).toThrow();
    db.exec(`UPDATE InventoryBatch SET expirationDate='2028-02-29' WHERE id='b'`);
  });
  it("prevents duplicate weekly plans and enforces Monday", () => {
    const insert = db.prepare(`INSERT INTO MealPlan (id,householdId,weekStart,targetCaloriesCenti,targetProteinCenti) VALUES (?,'h',?,200000,10000)`);
    insert.run('plan', '2026-10-26');
    expect(() => insert.run('duplicate', '2026-10-26')).toThrow();
    expect(() => insert.run('tuesday', '2026-10-27')).toThrow();
    expect(db.prepare("SELECT quantityMg FROM InventoryBatch WHERE id='b'").get()).toEqual({ quantityMg: 100000 });
  });
  it("requires exactly one food log source", () => {
    const insert = db.prepare(`INSERT INTO FoodLog (id,userId,date,productId,recipeId,quantityMilli,calculatedCaloriesCenti,calculatedProteinCenti,calculatedCarbsCenti,calculatedFatCenti) VALUES (?,'u','2026-10-24',?,?,1000,100,1,1,1)`);
    expect(() => insert.run('neither', null, null)).toThrow();
    expect(() => insert.run('both', 'p', 'recipe')).toThrow();
    insert.run('valid', 'p', null);
  });
  it("enforces inventory idempotency keys, immutability and batch ownership", () => {
    const insert = db.prepare(`INSERT INTO InventoryTransaction (id,householdId,productId,batchId,quantityChangeMg,reason,sourceReference) VALUES (?,'h','p','b',100,'test','stable-key')`);
    insert.run('tx');
    expect(() => insert.run('tx2')).toThrow();
    expect(() => db.exec(`UPDATE InventoryTransaction SET quantityChangeMg=200 WHERE id='tx'`)).toThrow();
    expect(() => db.exec(`DELETE FROM InventoryTransaction WHERE id='tx'`)).toThrow();
    expect(() => db.exec(`INSERT INTO InventoryBatch (id,householdId,productId,quantityMg,storageLocation) VALUES ('cross','other','p',1,'PANTRY')`)).toThrow();
  });
  it("rolls back a stock change if its corresponding audit insertion fails", () => {
    db.exec(`INSERT INTO InventoryTransaction (id,householdId,productId,batchId,quantityChangeMg,reason,sourceReference) VALUES ('tx','h','p','b',-50000,'test','once')`);
    const mutation = db.transaction(() => {
      db.exec(`UPDATE InventoryBatch SET quantityMg=50000 WHERE id='b'`);
      db.exec(`INSERT INTO InventoryTransaction (id,householdId,productId,batchId,quantityChangeMg,reason,sourceReference) VALUES ('tx2','h','p','b',-50000,'test','once')`);
    });
    expect(mutation).toThrow();
    expect(db.prepare("SELECT quantityMg FROM InventoryBatch WHERE id='b'").get()).toEqual({ quantityMg: 100000 });
  });
  it("checks shopping arithmetic and JSON settings", () => {
    db.exec(`INSERT INTO MealPlan (id,householdId,weekStart,targetCaloriesCenti,targetProteinCenti) VALUES ('plan','h','2026-10-26',200000,10000)`);
    expect(() => db.exec(`INSERT INTO ShoppingListItem (id,mealPlanId,productId,requiredQuantityMg,availableQuantityMg,missingQuantityMg) VALUES ('item','plan','p',100,20,90)`)).toThrow();
    expect(() => db.exec(`INSERT INTO UserSettings (id,userId,dietaryPreferences) VALUES ('s','u','{}')`)).toThrow();
  });
});
