import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { isTrustedOrigin, sessionUser } from "./auth-core";
export const SESSION_COOKIE = "nutrihome_session";
export function appUrl() {
  const value = process.env.APP_URL;
  if (!value && process.env.NODE_ENV === "production") throw new Error("APP_URL nije postavljen.");
  const url = new URL(value ?? "http://localhost:3000");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Neispravan APP_URL.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("HTTPS je obavezan izvan localhosta.");
  }
  return url;
}
export async function requireSameOrigin() {
  const origin = (await headers()).get("origin");
  if (!isTrustedOrigin(origin, appUrl().origin)) throw new Error("Zahtjev nije dopušten.");
}
export async function currentUser() { return sessionUser(db(), (await cookies()).get(SESSION_COOKIE)?.value); }
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/prijava");
  return user;
}
