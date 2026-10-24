-- Additive migration: all existing product IDs, nutrition and stock are preserved.
ALTER TABLE "FoodProduct" ADD COLUMN "nutritionSource" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "FoodProduct" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "FoodProduct" ADD COLUMN "sourceNutritionBasis" TEXT NOT NULL DEFAULT 'PER_100_G';
ALTER TABLE "FoodProduct" ADD COLUMN "fiberKnown" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "FoodProduct" ADD COLUMN "packageQuantityMilli" INTEGER;
ALTER TABLE "FoodProduct" ADD COLUMN "packageUnit" TEXT;

CREATE TABLE "CatalogRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CatalogRequest_userId_requestKey_key" ON "CatalogRequest"("userId", "requestKey");
CREATE TRIGGER "catalog_request_no_update" BEFORE UPDATE ON "CatalogRequest" BEGIN SELECT RAISE(ABORT,'Catalog requests are immutable'); END;
CREATE TRIGGER "catalog_request_no_delete" BEFORE DELETE ON "CatalogRequest" BEGIN SELECT RAISE(ABORT,'Catalog requests are immutable'); END;
