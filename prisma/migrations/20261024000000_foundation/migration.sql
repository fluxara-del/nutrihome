-- Initial schema. Quantities and money use fixed-point integers.

PRAGMA foreign_keys=ON;

CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartMs" BIGINT NOT NULL,
    CHECK ("attempts" >= 0),
    CHECK ("attempts" IS NULL OR (typeof("attempts") = 'integer' AND "attempts" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "FoodProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "barcode" TEXT,
    "category" TEXT NOT NULL,
    "caloriesPer100gCenti" INTEGER NOT NULL,
    "proteinPer100gCenti" INTEGER NOT NULL,
    "carbsPer100gCenti" INTEGER NOT NULL,
    "fatPer100gCenti" INTEGER NOT NULL,
    "fiberPer100gCenti" INTEGER NOT NULL DEFAULT 0,
    "defaultUnit" TEXT NOT NULL DEFAULT 'G',
    "densityMgPerMl" INTEGER,
    "pieceWeightMg" INTEGER,
    "lowStockThresholdMg" INTEGER NOT NULL DEFAULT 0,
    "estimatedNutrition" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodProduct_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("defaultUnit" IN ('G', 'KG', 'ML', 'L', 'PIECE')),
    CHECK ("caloriesPer100gCenti" >= 0),
    CHECK ("proteinPer100gCenti" BETWEEN 0 AND 10000),
    CHECK ("carbsPer100gCenti" BETWEEN 0 AND 10000),
    CHECK ("fatPer100gCenti" BETWEEN 0 AND 10000),
    CHECK ("fiberPer100gCenti" BETWEEN 0 AND 10000),
    CHECK ("densityMgPerMl" IS NULL OR "densityMgPerMl" > 0),
    CHECK ("pieceWeightMg" IS NULL OR "pieceWeightMg" > 0),
    CHECK ("lowStockThresholdMg" >= 0),
    CHECK ("caloriesPer100gCenti" IS NULL OR (typeof("caloriesPer100gCenti") = 'integer' AND "caloriesPer100gCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("proteinPer100gCenti" IS NULL OR (typeof("proteinPer100gCenti") = 'integer' AND "proteinPer100gCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("carbsPer100gCenti" IS NULL OR (typeof("carbsPer100gCenti") = 'integer' AND "carbsPer100gCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("fatPer100gCenti" IS NULL OR (typeof("fatPer100gCenti") = 'integer' AND "fatPer100gCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("fiberPer100gCenti" IS NULL OR (typeof("fiberPer100gCenti") = 'integer' AND "fiberPer100gCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("densityMgPerMl" IS NULL OR (typeof("densityMgPerMl") = 'integer' AND "densityMgPerMl" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("pieceWeightMg" IS NULL OR (typeof("pieceWeightMg") = 'integer' AND "pieceWeightMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("lowStockThresholdMg" IS NULL OR (typeof("lowStockThresholdMg") = 'integer' AND "lowStockThresholdMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("estimatedNutrition" IS NULL OR ("estimatedNutrition" IN (0, 1)))
);

CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityMg" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'G',
    "storageLocation" TEXT NOT NULL,
    "expirationDate" TEXT,
    "purchaseDate" TEXT,
    "purchasePriceCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBatch_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("unit" IN ('G', 'KG', 'ML', 'L', 'PIECE')),
    CHECK ("storageLocation" IN ('FRIDGE', 'FREEZER', 'PANTRY')),
    CHECK ("expirationDate" IS NULL OR (length("expirationDate") = 10 AND "expirationDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("expirationDate", '+0 days') IS NOT NULL AND date("expirationDate", '+0 days') = "expirationDate")),
    CHECK ("purchaseDate" IS NULL OR (length("purchaseDate") = 10 AND "purchaseDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("purchaseDate", '+0 days') IS NOT NULL AND date("purchaseDate", '+0 days') = "purchaseDate")),
    CHECK ("quantityMg" >= 0),
    CHECK ("purchasePriceCents" IS NULL OR "purchasePriceCents" >= 0),
    CHECK ("quantityMg" IS NULL OR (typeof("quantityMg") = 'integer' AND "quantityMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("purchasePriceCents" IS NULL OR (typeof("purchasePriceCents") = 'integer' AND "purchasePriceCents" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantityChangeMg" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityChangeMg" != 0),
    CHECK (length("sourceReference") > 0),
    CHECK ("quantityChangeMg" IS NULL OR (typeof("quantityChangeMg") = 'integer' AND "quantityChangeMg" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "servingsMilli" INTEGER NOT NULL,
    "preparationMinutes" INTEGER NOT NULL,
    "cookingMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("servingsMilli" > 0),
    CHECK ("preparationMinutes" >= 0),
    CHECK ("cookingMinutes" >= 0),
    CHECK ("servingsMilli" IS NULL OR (typeof("servingsMilli") = 'integer' AND "servingsMilli" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("preparationMinutes" IS NULL OR (typeof("preparationMinutes") = 'integer' AND "preparationMinutes" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("cookingMinutes" IS NULL OR (typeof("cookingMinutes") = 'integer' AND "cookingMinutes" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityMg" INTEGER NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("quantityMg" > 0),
    CHECK ("quantityMg" IS NULL OR (typeof("quantityMg") = 'integer' AND "quantityMg" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "RecipeTag" (
    "recipeId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "RecipeTag_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("recipeId", "tag"),
    CHECK ("tag" IN ('HIGH_PROTEIN', 'MEAL_PREP', 'WORK_FRIENDLY', 'UNDER_20_MINUTES', 'FREEZER_FRIENDLY', 'USE_SOON'))
);

CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetCaloriesCenti" INTEGER NOT NULL,
    "targetProteinCenti" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("weekStart" IS NULL OR (length("weekStart") = 10 AND "weekStart" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("weekStart", '+0 days') IS NOT NULL AND date("weekStart", '+0 days') = "weekStart")),
    CHECK ("status" IN ('DRAFT', 'APPROVED')),
    CHECK ("targetCaloriesCenti" > 0),
    CHECK ("targetProteinCenti" >= 0),
    CHECK (strftime('%w', "weekStart") = '1'),
    CHECK ("targetCaloriesCenti" IS NULL OR (typeof("targetCaloriesCenti") = 'integer' AND "targetCaloriesCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("targetProteinCenti" IS NULL OR (typeof("targetProteinCenti") = 'integer' AND "targetProteinCenti" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "servingsMilli" INTEGER NOT NULL,
    "confirmedAt" DATETIME,
    CONSTRAINT "PlannedMeal_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("date" IS NULL OR (length("date") = 10 AND "date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("date", '+0 days') IS NOT NULL AND date("date", '+0 days') = "date")),
    CHECK ("mealType" IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
    CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("servingsMilli" > 0),
    CHECK ("servingsMilli" IS NULL OR (typeof("servingsMilli") = 'integer' AND "servingsMilli" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "FoodLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "productId" TEXT,
    "recipeId" TEXT,
    "quantityMilli" INTEGER NOT NULL,
    "foodState" TEXT NOT NULL DEFAULT 'RAW',
    "estimatedNutrition" BOOLEAN NOT NULL DEFAULT false,
    "calculatedCaloriesCenti" INTEGER NOT NULL,
    "calculatedProteinCenti" INTEGER NOT NULL,
    "calculatedCarbsCenti" INTEGER NOT NULL,
    "calculatedFatCenti" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("date" IS NULL OR (length("date") = 10 AND "date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("date", '+0 days') IS NOT NULL AND date("date", '+0 days') = "date")),
    CONSTRAINT "FoodLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FoodLog_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("foodState" IN ('RAW', 'COOKED')),
    CHECK (("productId" IS NULL) != ("recipeId" IS NULL)),
    CHECK ("quantityMilli" > 0),
    CHECK ("calculatedCaloriesCenti" >= 0),
    CHECK ("calculatedProteinCenti" >= 0),
    CHECK ("calculatedCarbsCenti" >= 0),
    CHECK ("calculatedFatCenti" >= 0),
    CHECK ("quantityMilli" IS NULL OR (typeof("quantityMilli") = 'integer' AND "quantityMilli" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("estimatedNutrition" IS NULL OR ("estimatedNutrition" IN (0, 1))),
    CHECK ("calculatedCaloriesCenti" IS NULL OR (typeof("calculatedCaloriesCenti") = 'integer' AND "calculatedCaloriesCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("calculatedProteinCenti" IS NULL OR (typeof("calculatedProteinCenti") = 'integer' AND "calculatedProteinCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("calculatedCarbsCenti" IS NULL OR (typeof("calculatedCarbsCenti") = 'integer' AND "calculatedCarbsCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("calculatedFatCenti" IS NULL OR (typeof("calculatedFatCenti") = 'integer' AND "calculatedFatCenti" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "WeightLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weightG" INTEGER NOT NULL,
    CONSTRAINT "WeightLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("date" IS NULL OR (length("date") = 10 AND "date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("date", '+0 days') IS NOT NULL AND date("date", '+0 days') = "date")),
    CHECK ("weightG" > 0),
    CHECK ("weightG" IS NULL OR (typeof("weightG") = 'integer' AND "weightG" BETWEEN -2147483648 AND 2147483647))
);

CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requiredQuantityMg" INTEGER NOT NULL,
    "availableQuantityMg" INTEGER NOT NULL,
    "missingQuantityMg" INTEGER NOT NULL,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "estimatedPriceCents" INTEGER,
    "priceIsEstimate" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ShoppingListItem_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShoppingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("requiredQuantityMg" >= 0),
    CHECK ("availableQuantityMg" >= 0),
    CHECK ("missingQuantityMg" = MAX(0, "requiredQuantityMg" - "availableQuantityMg")),
    CHECK ("estimatedPriceCents" IS NULL OR "estimatedPriceCents" >= 0),
    CHECK ("requiredQuantityMg" IS NULL OR (typeof("requiredQuantityMg") = 'integer' AND "requiredQuantityMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("availableQuantityMg" IS NULL OR (typeof("availableQuantityMg") = 'integer' AND "availableQuantityMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("missingQuantityMg" IS NULL OR (typeof("missingQuantityMg") = 'integer' AND "missingQuantityMg" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("purchased" IS NULL OR ("purchased" IN (0, 1))),
    CHECK ("manual" IS NULL OR ("manual" IN (0, 1))),
    CHECK ("estimatedPriceCents" IS NULL OR (typeof("estimatedPriceCents") = 'integer' AND "estimatedPriceCents" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("priceIsEstimate" IS NULL OR ("priceIsEstimate" IN (0, 1)))
);

CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "calorieTargetCenti" INTEGER NOT NULL DEFAULT 200000,
    "proteinTargetCenti" INTEGER NOT NULL DEFAULT 10000,
    "fatTargetCenti" INTEGER NOT NULL DEFAULT 7000,
    "carbohydrateTargetCenti" INTEGER NOT NULL DEFAULT 25000,
    "dietaryPreferences" TEXT NOT NULL DEFAULT '[]',
    "excludedIngredients" TEXT NOT NULL DEFAULT '[]',
    "mealCount" INTEGER NOT NULL DEFAULT 3,
    "weeklyBudgetCents" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Zagreb',
    "goalsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("calorieTargetCenti" > 0),
    CHECK ("proteinTargetCenti" >= 0),
    CHECK ("fatTargetCenti" >= 0),
    CHECK ("carbohydrateTargetCenti" >= 0),
    CHECK ("mealCount" BETWEEN 1 AND 12),
    CHECK ("weeklyBudgetCents" IS NULL OR "weeklyBudgetCents" >= 0),
    CHECK ("timezone" = 'Europe/Zagreb'),
    CHECK (json_valid("dietaryPreferences") AND json_type("dietaryPreferences") = 'array'),
    CHECK (json_valid("excludedIngredients") AND json_type("excludedIngredients") = 'array'),
    CHECK ("calorieTargetCenti" IS NULL OR (typeof("calorieTargetCenti") = 'integer' AND "calorieTargetCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("proteinTargetCenti" IS NULL OR (typeof("proteinTargetCenti") = 'integer' AND "proteinTargetCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("fatTargetCenti" IS NULL OR (typeof("fatTargetCenti") = 'integer' AND "fatTargetCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("carbohydrateTargetCenti" IS NULL OR (typeof("carbohydrateTargetCenti") = 'integer' AND "carbohydrateTargetCenti" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("mealCount" IS NULL OR (typeof("mealCount") = 'integer' AND "mealCount" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("weeklyBudgetCents" IS NULL OR (typeof("weeklyBudgetCents") = 'integer' AND "weeklyBudgetCents" BETWEEN -2147483648 AND 2147483647)),
    CHECK ("goalsConfirmed" IS NULL OR ("goalsConfirmed" IN (0, 1)))
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE INDEX "User_householdId_idx" ON "User"("householdId");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE UNIQUE INDEX "FoodProduct_householdId_barcode_key" ON "FoodProduct"("householdId", "barcode");

CREATE INDEX "FoodProduct_householdId_name_idx" ON "FoodProduct"("householdId", "name");

CREATE INDEX "FoodProduct_householdId_category_idx" ON "FoodProduct"("householdId", "category");

CREATE INDEX "InventoryBatch_householdId_expirationDate_idx" ON "InventoryBatch"("householdId", "expirationDate");

CREATE INDEX "InventoryBatch_productId_expirationDate_idx" ON "InventoryBatch"("productId", "expirationDate");

CREATE UNIQUE INDEX "InventoryTransaction_householdId_sourceReference_key" ON "InventoryTransaction"("householdId", "sourceReference");

CREATE INDEX "InventoryTransaction_batchId_timestamp_idx" ON "InventoryTransaction"("batchId", "timestamp");

CREATE INDEX "InventoryTransaction_householdId_timestamp_idx" ON "InventoryTransaction"("householdId", "timestamp");

CREATE INDEX "Recipe_householdId_title_idx" ON "Recipe"("householdId", "title");

CREATE UNIQUE INDEX "RecipeIngredient_recipeId_productId_key" ON "RecipeIngredient"("recipeId", "productId");

CREATE INDEX "RecipeIngredient_productId_idx" ON "RecipeIngredient"("productId");

CREATE INDEX "RecipeTag_tag_idx" ON "RecipeTag"("tag");

CREATE UNIQUE INDEX "MealPlan_householdId_weekStart_key" ON "MealPlan"("householdId", "weekStart");

CREATE UNIQUE INDEX "PlannedMeal_mealPlanId_date_mealType_key" ON "PlannedMeal"("mealPlanId", "date", "mealType");

CREATE INDEX "PlannedMeal_recipeId_idx" ON "PlannedMeal"("recipeId");

CREATE INDEX "FoodLog_userId_date_idx" ON "FoodLog"("userId", "date");

CREATE INDEX "FoodLog_productId_idx" ON "FoodLog"("productId");

CREATE INDEX "FoodLog_recipeId_idx" ON "FoodLog"("recipeId");

CREATE UNIQUE INDEX "WeightLog_userId_date_key" ON "WeightLog"("userId", "date");

CREATE UNIQUE INDEX "ShoppingListItem_mealPlanId_productId_key" ON "ShoppingListItem"("mealPlanId", "productId");

CREATE INDEX "ShoppingListItem_productId_idx" ON "ShoppingListItem"("productId");

CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

CREATE TRIGGER "inventory_audit_no_update" BEFORE UPDATE ON "InventoryTransaction" BEGIN SELECT RAISE(ABORT, 'Inventory audit entries are immutable'); END;

CREATE TRIGGER "inventory_audit_no_delete" BEFORE DELETE ON "InventoryTransaction" BEGIN SELECT RAISE(ABORT, 'Inventory audit entries are immutable'); END;

CREATE TRIGGER "inventory_batch_household" BEFORE INSERT ON "InventoryBatch" WHEN NOT EXISTS (SELECT 1 FROM "FoodProduct" WHERE id = NEW.productId AND householdId = NEW.householdId) BEGIN SELECT RAISE(ABORT, 'Product household mismatch'); END;

CREATE TRIGGER "inventory_transaction_batch" BEFORE INSERT ON "InventoryTransaction" WHEN NOT EXISTS (SELECT 1 FROM "InventoryBatch" WHERE id = NEW.batchId AND productId = NEW.productId AND householdId = NEW.householdId) BEGIN SELECT RAISE(ABORT, 'Batch product mismatch'); END;

CREATE TRIGGER "inventory_batch_identity" BEFORE UPDATE OF "productId", "householdId" ON "InventoryBatch" WHEN NEW.productId != OLD.productId OR NEW.householdId != OLD.householdId BEGIN SELECT RAISE(ABORT, 'Batch identity is immutable'); END;
