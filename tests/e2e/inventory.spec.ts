import { test, expect, type Page } from "@playwright/test";
import { localDate, addDays } from "../../src/lib/calendar";
import { createDatabase } from "../../src/lib/db";
import { saveProduct, addBatch } from "../../src/lib/inventory";
import { randomUUID } from "node:crypto";
async function login(page: Page) {
  await page.goto("/prijava");
  await page.getByLabel("Korisničko ime", { exact: true }).fill("e2e_owner");
  await page.getByLabel("Lozinka", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL("/");
}
async function createProduct(page: Page, name: string) {
  await page.goto("/zalihe/novo");
  const form = page.getByRole("form", { name: "Proizvod", exact: true });
  await form.getByLabel("Naziv proizvoda", { exact: true }).fill(name);
  await form.getByLabel("Kategorija", { exact: true }).fill("Žitarice");
  for (const [label, value] of [["Energija (kcal)", "370"], ["Bjelančevine (g)", "13"], ["Ugljikohidrati (g)", "60"], ["Masti (g)", "7"], ["Vlakna (g)", "10"], ["Upozori kada ostane najviše (g)", "300"]]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole("button", { name: "Spremi proizvod", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
test("mobile product, batches, confirmed consumption, correction, disposal and search persist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/zalihe");
  await expect(page.getByRole("link", { name: "Dodaj proizvod", exact: true })).toHaveCSS("color", "rgb(245, 246, 242)");
  await createProduct(page, "Zobene TEST faze 2");
  await page.getByRole("link", { name: "Uredi proizvod", exact: true }).click();
  await page.getByLabel("Naziv proizvoda", { exact: true }).fill("Čokoladne zobene TEST");
  await page.getByRole("button", { name: "Spremi proizvod", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Čokoladne zobene TEST", exact: true })).toBeVisible();
  const today = localDate(), add = page.getByRole("form", { name: "Dodaj seriju", exact: true });
  async function batch(quantity: string, expiry: string, location: string) {
    const previousKey = await add.locator('input[name="requestKey"]').inputValue();
    await add.getByLabel("Količina", { exact: true }).fill(quantity);
    await add.getByLabel("Rok trajanja (neobavezno)", { exact: true }).fill(expiry);
    await add.getByLabel("Mjesto čuvanja", { exact: true }).selectOption(location);
    await add.getByLabel("Ukupna cijena serije (€)", { exact: true }).fill("2,49");
    await add.getByRole("checkbox").check();
    await add.getByRole("button", { name: "Dodaj seriju", exact: true }).click();
    await expect(add.getByRole("status")).toContainText("spremljena");
    await expect(add.locator('input[name="requestKey"]')).not.toHaveValue(previousKey);
  }
  await batch("50", addDays(today, -1), "PANTRY");
  await batch("500", addDays(today, 2), "FRIDGE");
  await expect(page.getByTestId("usable-stock")).toHaveText("500 g");
  await expect(page.getByTestId("expired-stock")).toHaveText("50 g");
  const consume = page.getByRole("form", { name: "Potvrdi potrošnju", exact: true });
  await consume.getByLabel("Količina", { exact: true }).fill("250");
  await consume.getByRole("checkbox").check();
  await consume.getByRole("button", { name: "Potvrdi potrošnju", exact: true }).click();
  await expect(page.getByTestId("usable-stock")).toHaveText("250 g");
  await expect(page.getByTestId("expired-stock")).toHaveText("50 g");
  await consume.getByLabel("Količina", { exact: true }).fill("300");
  await consume.getByRole("checkbox").check();
  await consume.getByRole("button", { name: "Potvrdi potrošnju", exact: true }).click();
  await expect(consume.getByRole("alert")).toContainText("Nema dovoljno");
  await expect(page.getByTestId("usable-stock")).toHaveText("250 g");
  const active = () => page.getByRole("article").filter({ has: page.getByRole("heading", { name: /Hladnjak · 250 g/ }) });
  await active().getByText("Uredi podatke serije", { exact: true }).click();
  const metadata = active().getByRole("form", { name: "Spremi podatke serije", exact: true });
  await metadata.getByLabel("Mjesto čuvanja", { exact: true }).selectOption("FREEZER");
  await metadata.getByRole("checkbox").check();
  await metadata.getByRole("button", { name: "Spremi podatke serije", exact: true }).click();
  const changed = () => page.getByRole("article").filter({ has: page.getByRole("heading", { name: /Zamrzivač · 250 g/ }) });
  await expect(changed()).toBeVisible();
  await changed().getByText("Ispravi količinu / otpiši", { exact: true }).click();
  const adjust = changed().getByRole("form", { name: "Spremi ispravak", exact: true });
  await adjust.getByLabel("Nova ukupna količina serije", { exact: true }).fill("200");
  await adjust.getByLabel("Razlog ispravka ili otpisa", { exact: true }).fill("Ispravak nakon vaganja");
  await adjust.getByRole("checkbox").check();
  await adjust.getByRole("button", { name: "Spremi ispravak", exact: true }).click();
  await expect(page.getByTestId("usable-stock")).toHaveText("200 g");
  const expired = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /Smočnica · 50 g/ }) });
  await expired.getByText("Ispravi količinu / otpiši", { exact: true }).click();
  const dispose = expired.getByRole("form", { name: "Spremi ispravak", exact: true });
  await dispose.getByLabel("Nova ukupna količina serije", { exact: true }).fill("0");
  await dispose.getByLabel("Razlog ispravka ili otpisa", { exact: true }).fill("Otpis zbog isteka roka");
  await dispose.getByRole("checkbox").check(); await dispose.getByRole("button", { name: "Spremi ispravak", exact: true }).click();
  await expect(page.getByTestId("expired-stock")).toHaveText("0 g");
  await expect(page.getByRole("region", { name: "Povijest promjena" }).getByText("Ispravak količine: Otpis zbog isteka roka", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByTestId("usable-stock")).toHaveText("200 g");
  await expect(page.getByText("Potrošeno / otpisano", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/inventory-product-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Sve zalihe", exact: false }).click();
  const filters = page.getByRole("form", { name: "Pretraživanje zaliha", exact: true });
  await filters.getByLabel("Pretraži naziv, marku ili barkod", { exact: true }).fill("cokoladne");
  await filters.getByLabel("Upozorenje", { exact: true }).selectOption("low");
  await filters.getByLabel("Mjesto", { exact: true }).selectOption("FREEZER");
  await filters.getByRole("button", { name: "Pretraži", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Čokoladne zobene TEST", exact: true })).toBeVisible();
  await expect(page.getByText("Pronađeno proizvoda: 1.", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/inventory-desktop.png", fullPage: true });
});
test("unused products can be deleted through explicit confirmation", async ({ page }) => {
  await login(page); await createProduct(page, "Nekorišteni TEST proizvod");
  await page.getByText("Brisanje nekorištenog proizvoda", { exact: true }).click();
  const form = page.getByRole("form", { name: "Brisanje proizvoda", exact: true });
  await form.getByRole("checkbox").check(); await form.getByRole("button", { name: "Izbriši proizvod", exact: true }).click();
  await expect(page).toHaveURL("/zalihe");
  await expect(page.getByRole("heading", { name: "Nekorišteni TEST proizvod", exact: true })).toHaveCount(0);
});
test.describe("inventory action authorization", () => {
  test.use({ serviceWorkers: "block" });
  test("a real stock action without its session cannot deduct inventory", async ({ page, request }) => {
    const client = createDatabase(process.env.DATABASE_URL!);
    try {
      const user = await client.user.findUniqueOrThrow({ where: { username: "e2e_owner" } });
      const actor = { userId: user.id, householdId: user.householdId };
      const productId = await saveProduct(client, actor, { name: "Privatna zaliha TEST", brand: "", barcode: "", category: "Test", calories: "100", protein: "1", carbs: "1", fat: "1", fiber: "0", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "0", estimatedNutrition: true });
      await addBatch(client, actor, { productId, requestKey: randomUUID(), confirmed: true, quantity: "100", unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" });
      await login(page); await page.goto(`/zalihe/${productId}`);
      let intercepted = false;
      await page.route(`**/zalihe/${productId}`, async route => {
        if (route.request().method() !== "POST") { await route.continue(); return; }
        intercepted = true;
        const headers = await route.request().allHeaders(); expect(headers["next-action"]).toBeTruthy();
        const result = await request.post(route.request().url(), { headers: { "content-type": headers["content-type"], "next-action": headers["next-action"], accept: "text/x-component", origin: process.env.APP_URL! }, data: route.request().postDataBuffer()!, maxRedirects: 0 });
        expect(result.headers()["x-action-redirect"]).toContain("/prijava");
        await route.fulfill({ response: result });
      });
      const form = page.getByRole("form", { name: "Potvrdi potrošnju", exact: true });
      await form.getByLabel("Količina", { exact: true }).fill("100"); await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "Potvrdi potrošnju", exact: true }).click();
      await expect(page).toHaveURL("/prijava"); expect(intercepted).toBe(true);
      expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(100000);
      expect(await client.inventoryOperation.count({ where: { productId } })).toBe(1);
    } finally { await client.$disconnect(); }
  });
});
