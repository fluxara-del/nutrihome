import { it, expect } from "vitest";
import sharp from "sharp";
import { prepareLabelImage, readImageRequest, MAX_LABEL_BYTES } from "../src/lib/image-validation";
import { recognizeLabel } from "../src/lib/local-ocr";
import { parseLabel } from "../src/lib/label-parser";
import { labelImage } from "./fixtures/label-image";

it("validates actual bytes and MIME, rejects SVG/corrupt images and enforces upload limits", async () => {
  const png = await labelImage();
  expect((await prepareLabelImage(png, "image/png")).length).toBeGreaterThan(0);
  await expect(prepareLabelImage(png, "image/jpeg")).rejects.toThrow(/Format/);
  await expect(prepareLabelImage(Buffer.from("not an image"), "image/png")).rejects.toThrow(/valjana/);
  await expect(prepareLabelImage(Buffer.from("<svg/>"), "image/svg+xml")).rejects.toThrow(/Dopuštene/);
  await expect(prepareLabelImage(Buffer.alloc(MAX_LABEL_BYTES + 1), "image/png")).rejects.toThrow(/5 MB/);
  await expect(readImageRequest(new Request("https://home.example/api/label-ocr", { method: "POST", headers: { "content-type": "image/png", "content-length": String(MAX_LABEL_BYTES + 1) }, body: "x" }))).rejects.toThrow(/5 MB/);
  await expect(readImageRequest(new Request("https://home.example/api/label-ocr", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.alloc(MAX_LABEL_BYTES + 1) }))).rejects.toThrow(/5 MB/);
});
it("rejects images with excessive decoded dimensions", async () => {
  const image = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  await expect(prepareLabelImage(image, "image/png")).rejects.toThrow(/12 milijuna/);
});
it("runs actual local Croatian+English OCR using bundled models and parses the label", async () => {
  const result = await recognizeLabel(await prepareLabelImage(await labelImage(), "image/png"));
  expect(result.text).toMatch(/200\s*kcal/i);
  expect(parseLabel(result.text)).toMatchObject({ basis: "PER_100_G", calories: "200", protein: "10", carbs: "20", fat: "5" });
}, 60000);
