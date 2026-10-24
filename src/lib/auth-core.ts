import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
const N = 32768;
const LENGTH = 64;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, LENGTH,
    { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new Error("Lozinka mora imati od 12 do 128 znakova.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [version, salt, hash, extra] = encoded.split("$");
  if (password.length > 128 || version !== "scrypt-v1" || extra !== undefined ||
      !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, "hex"));
}
// Same work when the username does not exist. This is not a usable account hash.
export const DUMMY_HASH = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function createSession(client: PrismaClient, userId: string, now = new Date()) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
  await client.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}
export async function sessionUser(client: PrismaClient, token: string | undefined, now = new Date()) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await client.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  return session && session.expiresAt > now ? session.user : null;
}
export async function allowLoginAttempt(client: PrismaClient, now = Date.now()) {
  // Atomic statement: concurrent attempts cannot bypass the shared owner limit.
  const current = BigInt(now), cutoff = BigInt(now - 15 * 60 * 1000);
  const rows = await client.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginThrottle" ("key", "attempts", "windowStartMs") VALUES ('owner', 1, ${current})
    ON CONFLICT("key") DO UPDATE SET
      "attempts" = CASE WHEN "windowStartMs" <= ${cutoff} THEN 1 ELSE "attempts" + 1 END,
      "windowStartMs" = CASE WHEN "windowStartMs" <= ${cutoff} THEN ${current} ELSE "windowStartMs" END
    RETURNING "attempts"`;
  return Number(rows[0].attempts) <= 10;
}
export function isTrustedOrigin(origin: string | null, configuredUrl: string) {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(configuredUrl).origin; } catch { return false; }
}
