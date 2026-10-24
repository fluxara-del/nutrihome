import { readFileSync, readdirSync } from "node:fs";
import type Sqlite from "better-sqlite3";
export function migrateFixture(database: Sqlite.Database) {
  for (const directory of readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort()) database.exec(readFileSync(`prisma/migrations/${directory}/migration.sql`, "utf8"));
}
