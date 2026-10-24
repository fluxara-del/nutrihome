import { db } from "./db";
import { requireUser } from "./session";
export async function requireCatalogAdmin() {
  const user=await requireUser();
  // The existing application has no roles. The first created account administers the shared catalog.
  const owner=await db().user.findFirst({orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true}});
  if(owner?.id!==user.id) throw new Error("Samo prvi administratorski račun može ažurirati zajedničku bazu.");
  return user;
}
