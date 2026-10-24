"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { allowLoginAttempt, createSession, verifyPassword, DUMMY_HASH, tokenHash } from "@/lib/auth-core";
import { appUrl, requireSameOrigin, SESSION_COOKIE } from "@/lib/session";
export type LoginState = { error: string; username?: string };
const schema = z.object({ username: z.string().regex(/^[a-z0-9_-]{3,32}$/), password: z.string().min(1).max(128) });
export async function loginAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  await requireSameOrigin();
  const username = String(form.get("username") ?? "").slice(0, 32);
  if (!await allowLoginAttempt(db())) return { username, error: "Previše pokušaja. Pokušajte ponovno za 15 minuta." };
  const input = schema.safeParse({ username: form.get("username"), password: form.get("password") });
  if (!input.success) return { username, error: "Korisničko ime ili lozinka nisu ispravni." };
  const user = await db().user.findUnique({ where: { username: input.data.username } });
  const valid = await verifyPassword(input.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!valid || !user) return { username, error: "Korisničko ime ili lozinka nisu ispravni." };
  await db().session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const session = await createSession(db(), user.id);
  (await cookies()).set(SESSION_COOKIE, session.token, { httpOnly: true, secure: appUrl().protocol === "https:", sameSite: "strict", path: "/", expires: session.expiresAt });
  redirect("/");
}
export async function logoutAction() {
  await requireSameOrigin();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(SESSION_COOKIE);
  redirect("/prijava");
}
