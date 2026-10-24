import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/lib/db";
import { createSession } from "../../src/lib/auth-core";
import { saveProduct, addBatch } from "../../src/lib/inventory";
import { saveFoodLog, saveWeight } from "../../src/lib/nutrition-diary";
import { localDate, addDays } from "../../src/lib/calendar";
function database() {
  if (!process.env.E2E_PASSWORD || !process.env.DATABASE_URL?.includes("nutrihome-e2e-")) throw new Error("Run the isolated E2E runner.");
  return createDatabase(process.env.DATABASE_URL);
}
async function ownerSession(client: ReturnType<typeof database>, context: BrowserContext) {
  const user = await client.user.findUniqueOrThrow({ where: { username: "e2e_owner" } });
  const session = await createSession(client, user.id);
  await context.addCookies([{ name: "nutrihome_session", value: session.token, url: process.env.E2E_BASE_URL!, httpOnly: true, sameSite: "Strict", expires: Math.floor(session.expiresAt.getTime() / 1000) }]);
  return { userId: user.id, householdId: user.householdId };
}
const product = (name: string) => ({ name, brand: "", barcode: "", category: "Test", calories: "360", protein: "7", carbs: "80", fat: "1", fiber: "1", defaultUnit: "G", density: "", pieceWeight: "", lowStock: "0", estimatedNutrition: false });
test("personal targets, measured cooked food, immutable historical nutrition, delete and recipe portions", async ({ page, context }) => {
  const client = database();
  try {
    const actor = await ownerSession(client, context), today = localDate(), yesterday = addDays(today, -1);
    const productId = await saveProduct(client, actor, product("Riža dnevnik TEST"));
    await addBatch(client, actor, { productId, requestKey: randomUUID(), confirmed: true, quantity: "500", unit: "G", storageLocation: "PANTRY", expirationDate: "", purchaseDate: "", purchasePrice: "" });
    const recipe = await client.recipe.create({ data: { householdId: actor.householdId, title: "Riža recept TEST", instructions: "Test", servingsMilli: 2000, preparationMinutes: 5, cookingMinutes: 10, ingredients: { create: { productId, quantityMg: 200000 } } } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/postavke");
    const goals = page.getByRole("form", { name: "Osobni ciljevi", exact: true });
    await goals.getByLabel("Dnevni kalorijski cilj (kcal)", { exact: true }).fill("2200");
    await goals.getByLabel("Cilj bjelančevina (g)", { exact: true }).fill("120");
    await goals.getByLabel("Potvrđujem svoje ciljeve i postavke", { exact: true }).check();
    await goals.getByRole("button", { name: "Spremi ciljeve", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ciljevi su potvrđeni", exact: true })).toBeVisible();
    await page.reload(); await expect(goals.getByLabel("Cilj bjelančevina (g)", { exact: true })).toHaveValue("120");
    await page.goto("/dnevnik");
    const form = page.getByRole("form", { name: "Dodaj unos prehrane", exact: true });
    await form.getByLabel("Namirnica", { exact: true }).selectOption(productId);
    await form.getByLabel("Količina hrane", { exact: true }).fill("250");
    await form.getByLabel("Stanje izvagane hrane", { exact: true }).selectOption("COOKED");
    await form.getByLabel("Omjer kuhane / sirove mase", { exact: true }).fill("0");
    await form.getByLabel("Potvrđujem izmjereni omjer mase", { exact: true }).check();
    await expect(form.getByLabel("Ovaj unos sadrži procijenjene podatke", { exact: true })).toBeChecked();
    await form.getByLabel("Oduzmi potrošenu količinu iz zaliha", { exact: true }).check();
    await form.getByLabel("Potvrđujem da potrošnja još nije knjižena i želim oduzimanje zalihe", { exact: true }).check();
    await form.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await form.getByRole("button", { name: "Dodaj u dnevnik", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("omjer");
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(500000);
    await form.getByLabel("Omjer kuhane / sirove mase", { exact: true }).fill("2,5");
    await form.getByLabel("Količina hrane", { exact: true }).fill("1500");
    await form.getByLabel("Potvrđujem izmjereni omjer mase", { exact: true }).check();
    await form.getByLabel("Potvrđujem da potrošnja još nije knjižena i želim oduzimanje zalihe", { exact: true }).check();
    await form.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await form.getByRole("button", { name: "Dodaj u dnevnik", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Nema dovoljno");
    await expect(form.getByLabel("Namirnica", { exact: true })).toHaveValue(productId);
    await expect(form.getByLabel("Stanje izvagane hrane", { exact: true })).toHaveValue("COOKED");
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(500000);
    await form.getByLabel("Količina hrane", { exact: true }).fill("250");
    await form.getByLabel("Potvrđujem izmjereni omjer mase", { exact: true }).check();
    await expect(form.getByLabel("Ovaj unos sadrži procijenjene podatke", { exact: true })).toBeChecked();
    await form.getByLabel("Potvrđujem da potrošnja još nije knjižena i želim oduzimanje zalihe", { exact: true }).check();
    await form.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await form.getByRole("button", { name: "Dodaj u dnevnik", exact: true }).click();
    const entry = () => page.getByRole("article", { name: "Unos: Riža dnevnik TEST", exact: true });
    await expect(entry().getByText("360 kcal", { exact: true })).toBeVisible();
    await expect(entry().getByText("Procijenjeni podaci", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /^Kalorije:/ })).toHaveAttribute("value", "36000");
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(400000);
    await saveProduct(client, actor, { ...product("Promijenjena riža TEST"), calories: "500" }, productId);
    await page.reload(); await expect(entry().getByText("360 kcal", { exact: true })).toBeVisible();
    await entry().getByText("Uredi unos", { exact: true }).click();
    const edit = entry().getByRole("form", { name: "Uredi unos prehrane", exact: true });
    await edit.getByLabel("Količina hrane", { exact: true }).fill("125");
    await edit.getByLabel("Datum prehrane", { exact: true }).fill(yesterday);
    await edit.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await edit.getByRole("button", { name: "Spremi unos", exact: true }).click();
    await expect(entry()).toHaveCount(0);
    await page.getByRole("link", { name: "Prethodni dan", exact: true }).click();
    await expect(entry().getByText("180 kcal", { exact: true })).toBeVisible();
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(400000);
    await entry().getByText("Izbriši unos", { exact: true }).click();
    const remove = entry().getByRole("form", { name: "Izbriši unos prehrane", exact: true });
    await expect(remove.getByText("Brisanje unosa ne vraća već potrošenu zalihu.", { exact: true })).toBeVisible();
    await remove.getByRole("checkbox").check(); await remove.getByRole("button", { name: "Izbriši zapis", exact: true }).click();
    await expect(entry()).toHaveCount(0);
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(400000);
    await page.reload();
    const newForm = page.getByRole("form", { name: "Dodaj unos prehrane", exact: true });
    await newForm.getByLabel("Vrsta unosa", { exact: true }).selectOption("RECIPE");
    await newForm.getByLabel("Recept", { exact: true }).selectOption(recipe.id);
    await newForm.getByLabel("Broj porcija", { exact: true }).fill("1,5");
    await newForm.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await newForm.getByRole("button", { name: "Dodaj u dnevnik", exact: true }).click();
    await expect(page.getByRole("article", { name: "Unos: Riža recept TEST", exact: true }).getByText("750 kcal", { exact: true })).toBeVisible();
    expect((await client.inventoryBatch.findFirstOrThrow({ where: { productId } })).quantityMg).toBe(400000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/diary-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(1279, 0);
    await page.screenshot({ path: "test-results/diary-desktop.png", fullPage: true });
  } finally { await client.$disconnect(); }
});
test("weight CRUD, missing-day coverage, rolling means and interactive 7/30-day chart", async ({ page, context }) => {
  const client = database();
  try {
    const actor = await ownerSession(client, context), today = localDate(), yesterday = addDays(today, -1), old = addDays(today, -8);
    await page.goto("/napredak");
    const form = page.getByRole("form", { name: "Dodaj mjerenje težine", exact: true });
    for (const [date, amount] of [[today, "80,5"], [yesterday, "81"], [old, "82"]]) {
      const key = await form.locator('input[name="requestKey"]').inputValue();
      await form.getByLabel("Datum mjerenja", { exact: true }).fill(date);
      await form.getByLabel("Težina (kg)", { exact: true }).fill(amount);
      await form.getByLabel("Potvrđujem spremanje", { exact: true }).check();
      await form.getByRole("button", { name: "Dodaj mjerenje", exact: true }).click();
      await expect(form.getByRole("status")).toContainText("spremljena");
      await expect(form.locator('input[name="requestKey"]')).not.toHaveValue(key);
    }
    const week = () => page.locator("section").filter({ has: page.getByRole("heading", { name: "Posljednjih 7 dana", exact: true }) }).first();
    await expect(week().getByText("80,75 kg", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `${yesterday.slice(5)} · 81 kg`, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Pomični prosjek" })).toContainText(yesterday);
    await page.getByRole("navigation", { name: "Trajanje grafa", exact: true }).getByRole("link", { name: "7 dana", exact: true }).click();
    await expect(page.getByRole("article", { name: `Mjerenje ${old}`, exact: true })).toHaveCount(0);
    const todayRow = () => page.getByRole("article", { name: `Mjerenje ${today}`, exact: true });
    await todayRow().getByText("Uredi mjerenje", { exact: true }).click();
    const edit = todayRow().getByRole("form", { name: "Uredi mjerenje težine", exact: true });
    await edit.getByLabel("Težina (kg)", { exact: true }).fill("80,6");
    await edit.getByRole("checkbox").check(); await edit.getByRole("button", { name: "Spremi mjerenje", exact: true }).click();
    await expect(todayRow().getByText("80,6 kg", { exact: true })).toBeVisible();
    await expect(week().getByText("80,8 kg", { exact: true })).toBeVisible();
    const duplicate = page.getByRole("form", { name: "Dodaj mjerenje težine", exact: true });
    await duplicate.getByLabel("Datum mjerenja", { exact: true }).fill(today); await duplicate.getByLabel("Težina (kg)", { exact: true }).fill("90");
    await duplicate.getByRole("checkbox").check(); await duplicate.getByRole("button", { name: "Dodaj mjerenje", exact: true }).click();
    await expect(duplicate.getByRole("alert")).toContainText("već postoji");
    expect((await client.weightLog.findUniqueOrThrow({ where: { userId_date: { userId: actor.userId, date: today } } })).weightG).toBe(80600);
    const yesterdayRow = page.getByRole("article", { name: `Mjerenje ${yesterday}`, exact: true });
    await yesterdayRow.getByText("Izbriši mjerenje", { exact: true }).click();
    const remove = yesterdayRow.getByRole("form", { name: "Izbriši mjerenje težine", exact: true });
    await remove.getByRole("checkbox").check(); await remove.getByRole("button", { name: "Izbriši zapis", exact: true }).click();
    await expect(yesterdayRow).toHaveCount(0);
    await page.reload(); await expect(todayRow().getByText("80,6 kg", { exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Trajanje grafa", exact: true }).getByRole("link", { name: "30 dana", exact: true }).click();
    await expect(page.getByRole("article", { name: `Mjerenje ${old}`, exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/progress-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/progress-mobile.png", fullPage: true });
  } finally { await client.$disconnect(); }
});
test.describe("nutrition authorization", () => {
  test.use({ serviceWorkers: "block" });
  test("personal data stay private from another household member and unauthenticated writes are rejected", async ({ page, context, request }) => {
    const client = database();
    try {
      const actor = await ownerSession(client, context), today = localDate();
      const member = await client.user.create({ data: { householdId: actor.householdId, username: `member_${randomUUID().slice(0, 8)}`, passwordHash: "test-only", settings: { create: { calorieTargetCenti: 999900 } } } });
      const other = { userId: member.id, householdId: member.householdId };
      const productId = await saveProduct(client, actor, product("Dijeljeni proizvod TEST"));
      const saved = await saveFoodLog(client, other, { requestKey: randomUUID(), confirmed: true, date: today, sourceType: "PRODUCT", sourceId: productId, quantity: "729", unit: "G", foodState: "RAW", yield: "", yieldConfirmed: false, estimated: false, deductInventory: false, confirmedStock: false });
      await client.foodLog.update({ where: { id: saved.targetId }, data: { sourceName: "Privatni podatak člana TEST" } });
      await saveWeight(client, other, { requestKey: randomUUID(), confirmed: true, date: today, weight: "99,321" });
      await page.goto("/dnevnik");
      await expect(page.getByRole("article", { name: "Unos: Privatni podatak člana TEST", exact: true })).toHaveCount(0);
      await page.goto("/napredak"); await expect(page.getByText("99,321 kg", { exact: true })).toHaveCount(0);
      await page.goto("/postavke"); await expect(page.getByLabel("Dnevni kalorijski cilj (kcal)", { exact: true })).not.toHaveValue("9999");
      await page.goto("/dnevnik");
      const before = await client.foodLog.count({ where: { userId: actor.userId } });
      let rejected = false;
      await page.route("**/dnevnik**", async route => {
        if (route.request().method() !== "POST") { await route.continue(); return; }
        const headers = await route.request().allHeaders(); expect(headers["next-action"]).toBeTruthy();
        const response = await request.post(route.request().url(), { headers: { "content-type": headers["content-type"], "next-action": headers["next-action"], accept: "text/x-component", origin: process.env.APP_URL! }, data: route.request().postDataBuffer()!, maxRedirects: 0 });
        expect(response.headers()["x-action-redirect"]).toContain("/prijava"); rejected = true; await route.fulfill({ response });
      });
      const form = page.getByRole("form", { name: "Dodaj unos prehrane", exact: true });
      await form.getByLabel("Namirnica", { exact: true }).selectOption(productId); await form.getByLabel("Količina hrane", { exact: true }).fill("100");
      await form.getByLabel("Potvrđujem spremanje", { exact: true }).check(); await form.getByRole("button", { name: "Dodaj u dnevnik", exact: true }).click();
      await expect.poll(() => rejected).toBe(true);
      expect(await client.foodLog.count({ where: { userId: actor.userId } })).toBe(before);
      expect((await client.weightLog.findUniqueOrThrow({ where: { userId_date: { userId: other.userId, date: today } } })).weightG).toBe(99321);
    } finally { await client.$disconnect(); }
  });
});
