import { test, expect, type Page } from "@playwright/test";
import { createDatabase } from "../../src/lib/db";
import { labelImage } from "../fixtures/label-image";
// Keep these independent UI specs from exhausting the real global login cap.
// Only the runner's disposable database may be reset; production limits stay intact.
test.afterEach(async () => {
  if (!process.env.E2E_PASSWORD || !process.env.DATABASE_URL?.includes("nutrihome-e2e-")) return;
  const client = createDatabase(process.env.DATABASE_URL);
  try { await client.loginThrottle.deleteMany(); } finally { await client.$disconnect(); }
});
async function login(page: Page) {
  await page.goto("/prijava");
  await page.getByLabel("Korisničko ime", { exact: true }).fill("e2e_owner");
  await page.getByLabel("Lozinka", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL("/"); await page.goto("/namirnice");
}
test("review, catalog-only save, offline local search, explicit stock and diary handoff", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  await page.getByRole("button", { name: "Ručni unos", exact: true }).click();
  const form = page.getByRole("form", { name: "Provjera namirnice", exact: true });
  for (const [label, value] of [["Naziv proizvoda", "Katalog TEST čokolada"], ["Proizvođač / marka", "Test"], ["Kategorija", "Test"], ["Barkod", "4006381333931"], ["Energija (kcal)", "200"], ["Bjelančevine (g)", "10"], ["Ugljikohidrati (g)", "20"], ["Masti (g)", "5"]]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByLabel("Provjerio/la sam podatke i potvrđujem spremanje u katalog").check();
  await form.getByRole("button", { name: "Spremi u katalog", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Zalihe i dnevnik nisu promijenjeni");
  const client = createDatabase(process.env.DATABASE_URL!);
  let id: string;
  try {
    const product = await client.foodProduct.findFirstOrThrow({ where: { name: "Katalog TEST čokolada" } }); id = product.id;
    expect(product.fiberKnown).toBe(false);
    expect(await client.inventoryBatch.count({ where: { productId: id } })).toBe(0);
    expect(await client.foodLog.count({ where: { productId: id } })).toBe(0);
  } finally { await client.$disconnect(); }
  await page.getByRole("link", { name: "Dodaj u dnevnik prehrane", exact: true }).click();
  await expect(page.getByRole("form", { name: "Dodaj unos prehrane", exact: true }).locator('select[name="sourceId"]')).toHaveValue(id);
  await page.goto("/namirnice");
  await page.getByLabel("Vanjski izvori (opcionalno)").uncheck();
  await page.getByLabel("Naziv ili barkod", { exact: true }).fill("COKOLADA");
  await page.getByRole("button", { name: "Pretraži namirnice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Katalog TEST čokolada", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/catalog-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Dodaj u zalihe", exact: true }).click();
  await expect(page.getByTestId("usable-stock")).toHaveText("0 g");
  const stock = page.getByRole("form", { name: "Dodaj seriju", exact: true });
  await stock.getByLabel("Količina", { exact: true }).fill("500");
  await stock.getByLabel("Mjesto čuvanja", { exact: true }).selectOption("PANTRY");
  await stock.getByRole("checkbox").check(); await stock.getByRole("button", { name: "Dodaj seriju", exact: true }).click();
  await expect(page.getByTestId("usable-stock")).toHaveText("500 g");
  await page.goto("/namirnice"); await page.getByLabel("Vanjski izvori (opcionalno)").uncheck();
  await page.getByLabel("Traži po barkodu", { exact: true }).check();
  await page.getByLabel("Naziv ili barkod", { exact: true }).fill("012345678905");
  await page.getByRole("button", { name: "Pretraži namirnice", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Proizvod nije pronađen");
});
test("real local OCR upload populates an editable unconfirmed review and camera denial permits manual entry", async ({ page }) => {
  test.setTimeout(70000); await login(page);
  const result = page.waitForResponse(r => r.url().endsWith("/api/label-ocr") && r.request().method() === "POST");
  await page.getByLabel("Odaberi postojeću sliku", { exact: true }).setInputFiles({ name: "test-label.png", mimeType: "image/png", buffer: await labelImage() });
  expect((await result).status()).toBe(200);
  const form = page.getByRole("form", { name: "Provjera namirnice", exact: true });
  await expect(form.getByLabel("Energija (kcal)", { exact: true })).toHaveValue("200");
  await expect(form.getByLabel("Masti (g)", { exact: true })).toHaveValue("5");
  await expect(form.getByLabel("Provjerio/la sam podatke i potvrđujem spremanje u katalog")).not.toBeChecked();
  await form.getByLabel("Energija (kcal)", { exact: true }).fill("210");
  await expect(form.getByLabel("Energija (kcal)", { exact: true })).toHaveValue("210");
  await page.screenshot({ path: "test-results/catalog-ocr-review.png", fullPage: true });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Test denial", "NotAllowedError"); }; });
  await page.getByRole("button", { name: "Skeniraj barkod", exact: true }).click();
  await expect(page.getByRole("region", { name: "Skener barkoda" }).getByRole("alert")).toContainText("Kamera nije dostupna");
  await page.getByRole("button", { name: "Zatvori kameru", exact: true }).click();
  await expect(page.getByRole("region", { name: "Skener barkoda" })).toHaveCount(0);
});
test("image API enforces session, origin, file signatures, size and allowed formats", async ({ page, request }) => {
  expect((await request.post("/api/label-ocr", { headers: { "content-type": "image/png", origin: process.env.APP_URL! }, data: "x" })).status()).toBe(401);
  expect((await request.get("/api/food-search?q=test")).status()).toBe(401);
  await login(page);
  const statuses = await page.evaluate(async () => {
    async function send(type: string, body: string) { return (await fetch("/api/label-ocr", { method: "POST", headers: { "content-type": type }, body })).status; }
    return [await send("image/svg+xml", "<svg/>"), await send("image/png", "not-an-image"), await send("image/png", "x".repeat(5 * 1024 * 1024 + 1))];
  });
  expect(statuses).toEqual([415, 400, 413]);
  const cookie = (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join("; ");
  const response = await request.post("/api/label-ocr", { headers: { cookie, origin: "https://different-origin.example", "content-type": "image/png" }, data: "x" });
  expect(response.status()).toBe(403);
});

// A known EAN-13 video fixture exercises ZXing and stream cleanup without a phone.
test("camera video decodes a real EAN and stops its media tracks", async ({ page }) => {
  await login(page);
  await page.getByLabel("Vanjski izvori (opcionalno)").uncheck();
  await page.evaluate(bits => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 700; canvas.height = 320;
      const context = canvas.getContext("2d")!;
      const draw = () => {
        context.fillStyle = "white"; context.fillRect(0, 0, 700, 320);
        context.fillStyle = "black";
        [...bits].forEach((bit, i) => { if (bit === "1") context.fillRect(110 + i * 5, 50, 5, 220); });
      };
      draw(); const stream = canvas.captureStream(15);
      (window as unknown as { testCameraStream: MediaStream }).testCameraStream = stream;
      const tick = setInterval(draw, 70); setTimeout(() => clearInterval(tick), 10000);
      return stream;
    };
  }, "10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101");
  await page.getByRole("button", { name: "Skeniraj barkod", exact: true }).click();
  await expect(page.getByLabel("Naziv ili barkod", { exact: true })).toHaveValue("4006381333931", { timeout: 15000 });
  await expect(page.getByRole("region", { name: "Skener barkoda" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { testCameraStream: MediaStream }).testCameraStream.getTracks().every(track => track.readyState === "ended"))).toBe(true);
});
