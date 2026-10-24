import { resolve } from "node:path";
// Prisma CLI resolves relative URLs against the schema directory, while the
// adapter resolves them against cwd. Normalize both to the same absolute file.
export function databaseUrl(value = process.env.DATABASE_URL ?? "file:./data/nutrihome.db") {
  if (!value.startsWith("file:") || !value.slice(5) || value.includes("?")) throw new Error("Očekivana je lokalna putanja SQLite baze.");
  return `file:${resolve(value.slice(5))}`;
}
