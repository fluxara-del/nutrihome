import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, tokenHash, isTrustedOrigin, DUMMY_HASH } from "../src/lib/auth-core";
describe("authentication primitives", () => {
  it("salts passwords uniquely and rejects wrong passwords", async () => {
    const password = "test-only-password-123";
    const first = await hashPassword(password), second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("wrong-password", first)).toBe(false);
    expect(await verifyPassword(password, DUMMY_HASH)).toBe(false);
    expect(await verifyPassword(password, "malformed")).toBe(false);
  });
  it("rejects short and overly long credentials", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    await expect(hashPassword("a".repeat(129))).rejects.toThrow();
  });
  it("hashes opaque tokens consistently", () => {
    expect(tokenHash("a")).toHaveLength(64);
    expect(tokenHash("a")).not.toBe(tokenHash("b"));
  });
  it("requires an exact configured origin for mutations", () => {
    expect(isTrustedOrigin("https://home.example", "https://home.example/")).toBe(true);
    for (const origin of [null, "null", "https://evil.example", "http://home.example", "https://home.example:444"]) expect(isTrustedOrigin(origin, "https://home.example")).toBe(false);
  });
});
