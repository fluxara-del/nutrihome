import { migrateFixture } from "./migrations";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Sqlite from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createDatabase } from "../src/lib/db";
import { createSession, sessionUser, allowLoginAttempt, tokenHash } from "../src/lib/auth-core";
let directory: string, client: ReturnType<typeof createDatabase>, url: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "nutrihome-db-test-"));
  const path = join(directory, "test.db"); url = `file:${path}`;
  const raw = new Sqlite(path);
  migrateFixture(raw); raw.close();
  client = createDatabase(url);
  await client.household.create({ data: { id: "h", name: "Test", users: { create: { id: "u", username: "test-owner", passwordHash: "not-a-usable-credential", settings: { create: {} } } } } });
});
afterEach(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
describe("persistent authentication", () => {
  it("stores only a token hash and expires/revokes sessions", async () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const session = await createSession(client, "u", now);
    const stored = await client.session.findFirstOrThrow();
    expect(stored.tokenHash).toBe(tokenHash(session.token));
    expect(stored.tokenHash).not.toBe(session.token);
    expect((await sessionUser(client, session.token, now))?.id).toBe("u");
    expect(await sessionUser(client, session.token, session.expiresAt)).toBeNull();
    expect(await sessionUser(client, undefined, now)).toBeNull();
    expect(await sessionUser(client, "bad-token", now)).toBeNull();
    await client.session.deleteMany({ where: { tokenHash: stored.tokenHash } });
    expect(await sessionUser(client, session.token, now)).toBeNull();
  });
  it("applies a durable atomic login limit and resets after 15 minutes", async () => {
    const now = Date.now();
    const attempts = await Promise.all(Array.from({ length: 12 }, () => allowLoginAttempt(client, now)));
    expect(attempts.filter(Boolean)).toHaveLength(10);
    const second = createDatabase(url);
    try { expect(await allowLoginAttempt(second, now + 1)).toBe(false); }
    finally { await second.$disconnect(); }
    expect(await allowLoginAttempt(client, now + 15 * 60 * 1000)).toBe(true);
  });
});
it("seeds marked test data repeatably without overwriting inventory", async () => {
  function seed() {
    const result = spawnSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], { env: { ...process.env, DATABASE_URL: url, ALLOW_DEMO_SEED: "true" }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
  seed();
  await client.inventoryBatch.updateMany({ data: { quantityMg: 123000 } });
  seed();
  expect(await client.foodProduct.count()).toBe(1);
  expect(await client.inventoryBatch.count()).toBe(1);
  expect(await client.inventoryTransaction.count()).toBe(1);
  expect((await client.inventoryBatch.findFirstOrThrow()).quantityMg).toBe(123000);
  expect((await client.foodProduct.findFirstOrThrow()).estimatedNutrition).toBe(true);
});
