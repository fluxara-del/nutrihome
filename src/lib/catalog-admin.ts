import { db } from "./db";
import { currentUser } from "./session";
export class CatalogAccessError extends Error {
  constructor(message: string, public status: 401 | 403) { super(message); }
}
export async function requireCatalogAdmin() {
  const user = await currentUser();
  if (!user) throw new CatalogAccessError("Prijava je obavezna.", 401);
  // The existing application has no roles. The first created account administers the shared catalog.
  const owner = await db().user.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  if (owner?.id !== user.id) throw new CatalogAccessError("Samo prvi administratorski račun može ažurirati zajedničku bazu.", 403);
  return user;
}
