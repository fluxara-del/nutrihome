import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { searchFoods } from "@/lib/food-providers";
import { InventoryError } from "@/lib/inventory-input";
import { allowCatalogRequest } from "@/lib/catalog-limits";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await currentUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401, headers });
  if (!allowCatalogRequest(user.id, "search")) return Response.json({ error: "Previše pretraga. Pričekaj minutu." }, { status: 429, headers });
  const query = new URL(request.url).searchParams;
  try { return Response.json(await searchFoods(db(), { userId: user.id, householdId: user.householdId }, query.get("q") ?? "", query.get("barcode") === "1", { localOnly: query.get("local") === "1", external: query.get("external") === "1", page: Number(query.get("page") ?? 0) }), { headers }); }
  catch (error) { return Response.json({ error: error instanceof InventoryError ? error.message : "Pretraga nije uspjela. Pokušaj ponovno." }, { status: 400, headers }); }
}
