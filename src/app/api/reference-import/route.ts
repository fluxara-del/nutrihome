import { requireSameOrigin } from "@/lib/session";
import { CatalogAccessError, requireCatalogAdmin } from "@/lib/catalog-admin";
import { db } from "@/lib/db";
import { importReference } from "@/lib/reference-food";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try { await requireCatalogAdmin(); }
  catch (error) { return Response.json({ error: error instanceof CatalogAccessError ? error.message : "Pristup nije dopušten." }, { status: error instanceof CatalogAccessError ? error.status : 500, headers }); }
  try { await requireSameOrigin(); }
  catch { return Response.json({ error: "Zahtjev nije dopušten." }, { status: 403, headers }); }
  if (request.headers.get("x-confirm-import") !== "yes") return Response.json({ error: "Potvrda je obavezna." }, { status: 400, headers });
  if (Number(request.headers.get("content-length")) > 5_000_000) return Response.json({ error: "Datoteka je prevelika." }, { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Datoteka nedostaje." }, { status: 400, headers });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 5_000_000) return Response.json({ error: "Datoteka je prevelika." }, { status: 413, headers });
      chunks.push(value);
    }
    const state = await importReference(db(), Buffer.concat(chunks), request.headers.get("x-catalog-sha256") ?? "");
    return Response.json({ version: state.version, count: state.count }, { headers });
  } catch { return Response.json({ error: "Uvoz nije uspio. Provjeri lokalni paket i SHA-256." }, { status: 400, headers }); }
  finally { await reader.cancel().catch(() => {}); }
}
