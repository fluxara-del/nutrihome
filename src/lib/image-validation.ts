import sharp from "sharp";
export const MAX_LABEL_BYTES = 5 * 1024 * 1024;
export const LABEL_TYPES = ["image/jpeg", "image/png", "image/webp"];
export class ImageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function readImageRequest(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!LABEL_TYPES.includes(type)) throw new ImageError("Dopuštene su JPEG, PNG i WebP slike.", 415);
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_LABEL_BYTES) throw new ImageError("Slika može imati najviše 5 MB.", 413);
  if (!request.body) throw new ImageError("Odaberi fotografiju etikete.");
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_LABEL_BYTES) throw new ImageError("Slika može imati najviše 5 MB.", 413);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return prepareLabelImage(Buffer.concat(chunks), type);
}
export async function prepareLabelImage(buffer: Buffer, type: string) {
  if (!buffer.length || buffer.length > MAX_LABEL_BYTES) throw new ImageError("Slika mora imati 1 bajt do 5 MB.", 413);
  if (!LABEL_TYPES.includes(type)) throw new ImageError("Dopuštene su JPEG, PNG i WebP slike.", 415);
  try {
    const image = sharp(buffer, { limitInputPixels: 12_000_000, failOn: "warning" });
    const meta = await image.metadata();
    const expected: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
    if (meta.format !== expected[type] || !meta.width || !meta.height || (meta.pages ?? 1) > 1 || meta.width * meta.height > 12_000_000) throw new ImageError("Format, dimenzije ili sadržaj slike nisu dopušteni.");
    // Re-encode: strip EXIF/location metadata, enforce dimensions and a single frame.
    return await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).greyscale().normalize().png().toBuffer();
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("Slika nije valjana ili prelazi 12 milijuna piksela. Smanji fotografiju i pokušaj ponovno.");
  }
}
