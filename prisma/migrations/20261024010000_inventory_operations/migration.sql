-- Additive migration: existing stock and audit records are retained.
ALTER TABLE "InventoryBatch" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version") = 'integer' AND "version" BETWEEN 0 AND 2147483647);
CREATE TABLE "InventoryOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "householdId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ADD', 'CONSUME', 'ADJUST', 'UPDATE_BATCH')),
  "summary" TEXT NOT NULL,
  "detail" TEXT NOT NULL CHECK (json_valid("detail")),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryOperation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryOperation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "InventoryTransaction" ADD COLUMN "operationId" TEXT REFERENCES "InventoryOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventoryTransaction_operationId_idx" ON "InventoryTransaction"("operationId");
CREATE UNIQUE INDEX "InventoryOperation_householdId_requestKey_key" ON "InventoryOperation"("householdId", "requestKey");
CREATE INDEX "InventoryOperation_householdId_createdAt_idx" ON "InventoryOperation"("householdId", "createdAt");
CREATE INDEX "InventoryOperation_productId_createdAt_idx" ON "InventoryOperation"("productId", "createdAt");
CREATE INDEX "InventoryOperation_userId_idx" ON "InventoryOperation"("userId");
CREATE TRIGGER "inventory_operation_identity" BEFORE INSERT ON "InventoryOperation"
WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE id = NEW.userId AND householdId = NEW.householdId)
  OR NOT EXISTS (SELECT 1 FROM "FoodProduct" WHERE id = NEW.productId AND householdId = NEW.householdId)
BEGIN SELECT RAISE(ABORT, 'Inventory operation household mismatch'); END;
CREATE TRIGGER "inventory_operation_no_update" BEFORE UPDATE ON "InventoryOperation" BEGIN SELECT RAISE(ABORT, 'Inventory operations are immutable'); END;
CREATE TRIGGER "inventory_operation_no_delete" BEFORE DELETE ON "InventoryOperation" BEGIN SELECT RAISE(ABORT, 'Inventory operations are immutable'); END;
CREATE TRIGGER "inventory_transaction_operation" BEFORE INSERT ON "InventoryTransaction"
WHEN NEW.operationId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "InventoryOperation" WHERE id = NEW.operationId AND householdId = NEW.householdId AND productId = NEW.productId)
BEGIN SELECT RAISE(ABORT, 'Inventory operation product mismatch'); END;
