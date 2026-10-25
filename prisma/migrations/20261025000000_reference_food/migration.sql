-- Additive only: no personal tables or historical snapshots are changed.
CREATE TABLE "ReferenceFood" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "nameHr" TEXT, "nameEn" TEXT NOT NULL,
 "synonyms" TEXT NOT NULL, "category" TEXT NOT NULL, "categoryEn" TEXT NOT NULL,
 "calories" INTEGER, "protein" INTEGER, "carbs" INTEGER, "fat" INTEGER, "fiber" INTEGER,
 "basis" TEXT NOT NULL, "carbohydrateType" TEXT NOT NULL, "preparation" TEXT NOT NULL,
 "source" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "sourceVersion" TEXT NOT NULL, "searchText" TEXT NOT NULL,
 CHECK ("calories" IS NULL OR "calories" BETWEEN 0 AND 100000),
 CHECK ("protein" IS NULL OR "protein" BETWEEN 0 AND 10000),
 CHECK ("carbs" IS NULL OR "carbs" BETWEEN 0 AND 10000),
 CHECK ("fat" IS NULL OR "fat" BETWEEN 0 AND 10000),
 CHECK ("fiber" IS NULL OR "fiber" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "ReferenceFood_source_sourceId_key" ON "ReferenceFood"("source", "sourceId");
CREATE INDEX "ReferenceFood_category_name_idx" ON "ReferenceFood"("category", "name");
CREATE TABLE "ReferenceCatalog" (
 "id" TEXT NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "builtAt" TEXT NOT NULL,
 "source" TEXT NOT NULL, "license" TEXT NOT NULL, "sha256" TEXT NOT NULL, "count" INTEGER NOT NULL,
 "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
