-- Additive upgrade. Existing calculated nutrients are preserved verbatim.
ALTER TABLE "FoodProduct" ADD COLUMN "nutritionState" TEXT NOT NULL DEFAULT 'RAW' CHECK ("nutritionState" IN ('RAW','COOKED'));
ALTER TABLE "FoodLog" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version")='integer' AND "version" BETWEEN 0 AND 2147483647);
ALTER TABLE "FoodLog" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "FoodLog" ADD COLUMN "nutritionSnapshot" TEXT CHECK ("nutritionSnapshot" IS NULL OR json_valid("nutritionSnapshot"));
ALTER TABLE "FoodLog" ADD COLUMN "enteredQuantity" TEXT;
ALTER TABLE "FoodLog" ADD COLUMN "enteredUnit" TEXT CHECK ("enteredUnit" IS NULL OR "enteredUnit" IN ('G','KG','ML','L','PIECE','SERVING'));
ALTER TABLE "FoodLog" ADD COLUMN "yieldMilli" INTEGER CHECK ("yieldMilli" IS NULL OR (typeof("yieldMilli")='integer' AND "yieldMilli" BETWEEN 1 AND 2147483647));
ALTER TABLE "FoodLog" ADD COLUMN "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false CHECK ("inventoryDeducted" IN (0,1));
ALTER TABLE "FoodLog" ADD COLUMN "calculatedFiberCenti" INTEGER CHECK ("calculatedFiberCenti" IS NULL OR (typeof("calculatedFiberCenti")='integer' AND "calculatedFiberCenti" BETWEEN 0 AND 2147483647));
ALTER TABLE "WeightLog" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version")='integer' AND "version" BETWEEN 0 AND 2147483647);
ALTER TABLE "UserSettings" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version")='integer' AND "version" BETWEEN 0 AND 2147483647);
CREATE TABLE "NutritionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('FOOD_CREATE','FOOD_UPDATE','FOOD_DELETE','WEIGHT_CREATE','WEIGHT_UPDATE','WEIGHT_DELETE','SETTINGS')),
  "targetId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NutritionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NutritionRequest_userId_requestKey_key" ON "NutritionRequest"("userId","requestKey");
CREATE INDEX "NutritionRequest_userId_createdAt_idx" ON "NutritionRequest"("userId","createdAt");
CREATE TRIGGER "nutrition_request_no_update" BEFORE UPDATE ON "NutritionRequest" BEGIN SELECT RAISE(ABORT,'Nutrition requests are immutable'); END;
CREATE TRIGGER "nutrition_request_no_delete" BEFORE DELETE ON "NutritionRequest" BEGIN SELECT RAISE(ABORT,'Nutrition requests are immutable'); END;
