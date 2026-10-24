import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ImageError } from "./image-validation";
let busy = false;
export async function recognizeLabel(image: Buffer): Promise<{ text: string; confidence: number }> {
  if (busy) throw new ImageError("OCR upravo obrađuje drugu etiketu. Pokušaj ponovno za minutu.", 429);
  busy = true;
  let modelDirectory: string | undefined;
  try {
    modelDirectory = await mkdtemp(join(tmpdir(), "nutrihome-ocr-models-"));
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=256", join(process.cwd(), "scripts", "ocr-worker.cjs"), modelDirectory!], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true, env: { ...process.env, OMP_THREAD_LIMIT: "1" } });
      let output = "", settled = false;
      const finish = (error?: Error, value?: { text: string; confidence: number }) => {
        if (settled) return; settled = true; clearTimeout(timer); child.kill();
        if (error) reject(error); else resolve(value!);
      };
      const timer = setTimeout(() => finish(new ImageError("OCR je prekoračio 45 sekundi. Pokušaj s manjom i jasnijom fotografijom.", 504)), 45000);
      child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 100000) finish(new ImageError("OCR rezultat je prevelik.")); });
      child.on("error", () => finish(new ImageError("Lokalni OCR nije dostupan.", 503)));
      child.stdin.on("error", () => finish(new ImageError("Lokalni OCR nije dovršio obradu.", 503)));
      child.on("close", code => {
        if (settled) return;
        try {
          if (code !== 0) throw new Error();
          const data = JSON.parse(output);
          if (typeof data.text !== "string" || typeof data.confidence !== "number") throw new Error();
          finish(undefined, { text: data.text.slice(0, 20000), confidence: data.confidence });
        } catch { finish(new ImageError("Lokalni OCR nije dovršio obradu. Pokušaj jasniju etiketu ili ručni unos.", 503)); }
      });
      child.stdin.end(image);
    });
  } finally {
    try { if (modelDirectory) await rm(modelDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    finally { busy = false; }
  }
}
