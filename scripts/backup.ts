import "dotenv/config";
import Sqlite from "better-sqlite3";
import { mkdir, chmod, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/nutrihome.db";
  if (!url.startsWith("file:") || url.includes("?")) throw new Error("Očekivana je lokalna SQLite baza.");
  const directory = resolve(process.argv[2] ?? "./backups");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = join(directory, `nutrihome-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.db`);
  const source = new Sqlite(resolve(url.slice(5)), { readonly: true, fileMustExist: true });
  try {
    await source.backup(destination);
    await chmod(destination, 0o600);
    const backup = new Sqlite(destination, { fileMustExist: true });
    try {
      // A portable single-file backup must not depend on WAL/SHM sidecars.
      backup.pragma("journal_mode = DELETE");
      const result = backup.pragma("integrity_check", { simple: true });
      if (result !== "ok" || (backup.pragma("foreign_key_check") as unknown[]).length) throw new Error("Kopija nije ispravna.");
    } finally { backup.close(); }
    console.log(`Sigurnosna kopija provjerena: ${destination}`);
  } catch (error) { await rm(destination, { force: true }); throw error; }
  finally { source.close(); }
}
main().catch(() => { console.error("Sigurnosna kopija nije uspjela. Provjerite putanje, bazu i slobodan prostor."); process.exitCode = 1; });
