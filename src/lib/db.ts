import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseUrl } from "./database-url";
const state = globalThis as unknown as { nutrihomeDb?: PrismaClient };
export function createDatabase(url: string) {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url, timeout: 5000 }) });
}
export function db() {
  return state.nutrihomeDb ??= createDatabase(databaseUrl());
}
