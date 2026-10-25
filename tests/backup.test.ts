import { it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
it("backs up a live WAL database, verifies it and restores a consistent snapshot", () => {
  const directory = mkdtempSync(join(tmpdir(), "nutrihome-backup-test-"));
  const sourcePath = join(directory, "source.db"), backups = join(directory, "backups");
  const source = new Sqlite(sourcePath);
  try {
    source.pragma("journal_mode = WAL");
    source.exec("CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO evidence VALUES (1, 'before-backup')");
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/backup.ts", backups], { env: { ...process.env, DATABASE_URL: `file:${sourcePath}` }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const files = readdirSync(backups); expect(files).toHaveLength(1);
    const backupPath = join(backups, files[0]);
    if (process.platform !== "win32") expect(statSync(backupPath).mode & 0o777).toBe(0o600); // POSIX modes are not represented by Windows ACLs.
    source.exec("UPDATE evidence SET value='after-backup' WHERE id=1");
    const restored = new Sqlite(backupPath);
    try {
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(restored.prepare("SELECT value FROM evidence WHERE id=1").get()).toEqual({ value: "before-backup" });
    } finally { restored.close(); }
  } finally { source.close(); rmSync(directory, { recursive: true, force: true }); }
});
