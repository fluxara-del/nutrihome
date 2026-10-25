-- Additive metadata: personal products, inventory and historic food logs are untouched.
ALTER TABLE "Recipe" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Recipe" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
UPDATE "Recipe" SET "searchText"=lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace("title",'č','c'),'ć','c'),'š','s'),'ž','z'),'đ','d'),'Č','c'),'Ć','c'),'Š','s'),'Ž','z'),'Đ','d'));
ALTER TABLE "MealPlan" ADD COLUMN "ownerUserId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MealPlan" ADD COLUMN "settingsSnapshot" TEXT;
ALTER TABLE "MealPlan" ADD COLUMN "approvedReport" TEXT;
ALTER TABLE "MealPlan" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "PlannedMeal" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlannedMeal" ADD COLUMN "recipeSnapshot" TEXT;
UPDATE "PlannedMeal" SET "slot"=CASE "mealType" WHEN 'BREAKFAST' THEN 0 WHEN 'LUNCH' THEN 1 WHEN 'DINNER' THEN 2 ELSE 3 END;
DROP INDEX "PlannedMeal_mealPlanId_date_mealType_key";
CREATE UNIQUE INDEX "PlannedMeal_mealPlanId_date_slot_key" ON "PlannedMeal"("mealPlanId","date","slot");
CREATE INDEX "Recipe_householdId_archived_title_idx" ON "Recipe"("householdId","archived","title");
CREATE TABLE "PlanningRequest" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "householdId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "kind" TEXT NOT NULL, "targetId" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlanningRequest_userId_requestKey_key" ON "PlanningRequest"("userId","requestKey");
CREATE TABLE "PlanningPrice" (
 "productId" TEXT NOT NULL PRIMARY KEY, "centsPerKg" INTEGER CHECK ("centsPerKg" BETWEEN 1 AND 100000000),
 "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("productId") REFERENCES "FoodProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Extend only verified recipe labels, preserving all existing associations.
CREATE TABLE "new_RecipeTag" (
 "recipeId" TEXT NOT NULL, "tag" TEXT NOT NULL,
 PRIMARY KEY ("recipeId","tag"),
 FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK ("tag" IN ('HIGH_PROTEIN','MEAL_PREP','WORK_FRIENDLY','UNDER_20_MINUTES','FREEZER_FRIENDLY','USE_SOON','VEGETARIAN','VEGAN','GLUTEN_FREE'))
);
INSERT INTO "new_RecipeTag" SELECT "recipeId","tag" FROM "RecipeTag";
DROP TABLE "RecipeTag";
ALTER TABLE "new_RecipeTag" RENAME TO "RecipeTag";
CREATE INDEX "RecipeTag_tag_idx" ON "RecipeTag"("tag");
