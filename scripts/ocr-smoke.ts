import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLabel } from "../src/lib/label-parser";
import { createDatabase } from "../src/lib/db";
import { createSession, tokenHash } from "../src/lib/auth-core";
async function main() {
  assert.equal(process.env.NUTRIHOME_SMOKE, "1", "Only run in the disposable smoke project");
  assert.equal(parseLabel("Na 100 g/ml\nEnergija 200 kcal").basis, "UNKNOWN");
  const client = createDatabase(process.env.DATABASE_URL!);
  let token: string | undefined;
  try {
    const owner = await client.user.findUniqueOrThrow({ where: { username: "smoke_owner" } });
    token = (await createSession(client, owner.id)).token;
    const response = await fetch("http://127.0.0.1:3000/api/label-ocr", { method: "POST", headers: { "Content-Type": "image/png", Origin: new URL(process.env.APP_URL!).origin, Cookie: `nutrihome_session=${token}` }, body: readFileSync(0), signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200);
    const { draft } = await response.json();
    assert.equal(draft.basis, "PER_100_G"); assert.equal(draft.calories, "200");
    assert.equal(draft.protein, "10"); assert.equal(draft.fat, "5");
    console.log("Docker OCR: authenticated production HTTP upload, local Croatian+English models and parsing passed.");
  } finally {
    if (token) await client.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    await client.$disconnect();
  }
}
main().catch(() => { console.error("Docker OCR smoke failed."); process.exitCode = 1; });
