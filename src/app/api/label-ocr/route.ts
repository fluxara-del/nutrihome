import { currentUser, requireSameOrigin } from "@/lib/session";
import { readImageRequest, ImageError } from "@/lib/image-validation";
import { recognizeLabel } from "@/lib/local-ocr";
import { parseLabel } from "@/lib/label-parser";
import { allowCatalogRequest } from "@/lib/catalog-limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await currentUser();
  if (!user) return Response.json({ error: "Prijava je obavezna." }, { status: 401, headers });
  try { await requireSameOrigin(); }
  catch { return Response.json({ error: "Zahtjev nije dopušten." }, { status: 403, headers }); }
  if (!allowCatalogRequest(user.id, "ocr")) return Response.json({ error: "Najviše 5 OCR pokušaja u minuti." }, { status: 429, headers });
  try {
    const image = await readImageRequest(request);
    const result = await recognizeLabel(image);
    return Response.json({ draft: parseLabel(result.text), text: result.text, confidence: result.confidence }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof ImageError ? error.message : "Etiketa nije obrađena. Pokušaj ručni unos." }, { status: error instanceof ImageError ? error.status : 500, headers });
  }
}
