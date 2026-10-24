import "dotenv/config";
import Sqlite from "better-sqlite3";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { databaseUrl } from "../src/lib/database-url";
// Prisma 7.10 can fail to parse P1003 on the first creation of a SQLite file.
// Initialize a real SQLite file first, without changing an existing schema/data.
async function main() {
  const path = databaseUrl().slice(5);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { const file = await open(path, "ax", 0o600); await file.close(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const database = new Sqlite(path, { fileMustExist: true });
  try { database.pragma("journal_mode = WAL"); } finally { database.close(); }
}
main().catch(() => { console.error("Priprema baze nije uspjela. Provjerite putanju i prava pristupa."); process.exitCode = 1; });
