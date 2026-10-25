import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createDatabase } from "../../src/lib/db";
import { createSession } from "../../src/lib/auth-core";
import { saveProduct, addBatch } from "../../src/lib/inventory";
import { saveRecipe } from "../../src/lib/recipes";
import { nextWeekStart } from "../../src/lib/calendar";
test("phase 4: recipes, portions, diary snapshot, prices, seven-day planning, approval and responsive views", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  if (
    !process.env.DATABASE_URL?.includes("nutrihome-e2e-") ||
    !process.env.E2E_PASSWORD
  )
    throw new Error("Isolated E2E database required");
  const client = createDatabase(process.env.DATABASE_URL);
  try {
    const householdId = randomUUID();
    const h = await client.household.create({
      data: {
        id: householdId,
        name: "Phase 4 isolated",
        users: {
          create: {
            username: `phase4_${householdId}`,
            passwordHash: "no-password-login",
          },
        },
      },
      include: { users: true },
    });
    const actor = { householdId, userId: h.users[0].id };
    const session = await createSession(client, actor.userId);
    await context.addCookies([
      {
        name: "nutrihome_session",
        value: session.token,
        url: process.env.E2E_BASE_URL!,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await client.userSettings.create({
      data: {
        userId: actor.userId,
        goalsConfirmed: true,
        weeklyBudgetCents: 2000,
        version: 1,
      },
    });
    const productId = await saveProduct(client, actor, {
      name: "Zobene test faza 4",
      brand: "",
      barcode: "",
      category: "Žitarice",
      calories: "400",
      protein: "20",
      carbs: "60",
      fat: "5",
      fiber: "10",
      defaultUnit: "G",
      density: "",
      pieceWeight: "",
      lowStock: "0",
      estimatedNutrition: false,
    });
    await addBatch(client, actor, {
      requestKey: randomUUID(),
      confirmed: true,
      productId,
      quantity: "500",
      unit: "G",
      storageLocation: "PANTRY",
      expirationDate: "",
      purchaseDate: "",
      purchasePrice: "",
    });
    const stockBefore = await client.inventoryBatch.findMany({
      where: { householdId },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/recepti/novo");
    await page
      .getByLabel("Naziv recepta", { exact: true })
      .fill("Zobena kaša faza 4");
    await page
      .getByLabel("Broj porcija cijelog recepta", { exact: true })
      .fill("2");
    await page
      .getByLabel("Upute", { exact: true })
      .fill("Izvagati sastojke i pomiješati.");
    await page.getByLabel("Masa (g)", { exact: true }).fill("200");
    await page
      .getByLabel("Vegansko — provjerio korisnik", { exact: true })
      .check();
    await page.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await page
      .getByRole("button", { name: "Spremi recept", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Promjena je spremljena.",
    );
    await page
      .getByRole("link", { name: "Otvori recept", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Zobena kaša faza 4", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("400 kcal", { exact: true })).toBeVisible();
    const recipe = await client.recipe.findFirstOrThrow({
      where: { householdId },
    });
    await page
      .getByRole("link", { name: "Dodaj porciju u dnevnik", exact: true })
      .click();
    const diary = page.getByRole("form", {
      name: "Dodaj unos prehrane",
      exact: true,
    });
    await expect(diary.getByLabel("Vrsta unosa", { exact: true })).toHaveValue(
      "RECIPE",
    );
    await expect(diary.getByLabel("Recept", { exact: true })).toHaveValue(
      recipe.id,
    );
    await diary.getByLabel("Broj porcija", { exact: true }).fill("1.5");
    await diary.getByLabel("Potvrđujem spremanje", { exact: true }).check();
    await diary
      .getByRole("button", { name: "Dodaj u dnevnik", exact: true })
      .click();
    await expect(diary.getByRole("status")).toBeVisible();
    const log = await client.foodLog.findFirstOrThrow({
      where: { userId: actor.userId },
    });
    expect(log.calculatedCaloriesCenti).toBe(60000);
    await page.goto(`/recepti/${recipe.id}/uredi`);
    await page.getByLabel("Masa (g)", { exact: true }).fill("220");
    await page.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await page
      .getByRole("button", { name: "Spremi recept", exact: true })
      .click();
    await expect(page.getByRole("status")).toBeVisible();
    expect(
      (await client.foodLog.findUniqueOrThrow({ where: { id: log.id } }))
        .nutritionSnapshot,
    ).toBe(log.nutritionSnapshot);
    const second = await saveRecipe(client, actor, {
      requestKey: randomUUID(),
      confirmed: true,
      id: "",
      version: 0,
      title: "Alternativna kaša faza 4",
      instructions: "Promiješati sastojke.",
      servings: "1",
      preparationMinutes: 3,
      cookingMinutes: 0,
      tags: ["VEGAN"],
      ingredients: [{ productId, grams: "150" }],
    });
    await page.goto("/plan/cijene");
    await page.getByLabel("Procjena (€/kg)", { exact: true }).fill("2.50");
    await page.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await page.getByRole("button", { name: "Spremi", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page.goto(`/plan?week=${nextWeekStart()}`);
    await page.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await page
      .getByRole("button", { name: "Izradi sedmodnevni plan", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nacrt plana", exact: true }),
    ).toBeVisible();
    const meal = page.locator(".planned-meal").first();
    await meal.locator("summary").click();
    const mealForm = meal.locator("form").filter({
      has: meal.getByRole("button", { name: "Spremi obrok", exact: true }),
    });
    await mealForm.getByLabel("Recept", { exact: true }).selectOption(second);
    await mealForm.getByLabel("Broj porcija", { exact: true }).fill("1.25");
    await mealForm.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await meal
      .getByRole("button", { name: "Spremi obrok", exact: true })
      .click();
    await expect(
      meal.getByText("1.25 porcija · 3 min", { exact: true }),
    ).toBeVisible();
    const regenerate = meal
      .locator("form")
      .filter({
        has: meal.getByRole("button", {
          name: "Predloži drugi obrok",
          exact: true,
        }),
      });
    await regenerate.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await regenerate
      .getByRole("button", { name: "Predloži drugi obrok", exact: true })
      .click();
    await expect(
      meal.getByRole("link", { name: "Zobena kaša faza 4", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Pročitao/la sam odstupanja i prihvaćam ovaj prijedlog.", {
        exact: true,
      })
      .check();
    const approve = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Odobri tjedni plan",
        exact: true,
      }),
    });
    await approve.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await approve
      .getByRole("button", { name: "Odobri tjedni plan", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Odobreni plan", exact: true }),
    ).toBeVisible();
    expect(
      await client.inventoryBatch.findMany({ where: { householdId } }),
    ).toEqual(stockBefore);
    expect(
      await client.foodLog.count({ where: { userId: actor.userId } }),
    ).toBe(1);
    mkdirSync("test-results/phase4", { recursive: true });
    for (const [width, height] of [
      [375, 812],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((t) => {
          localStorage.setItem("nutrihome-theme", t);
          document.documentElement.dataset.theme = t;
        }, theme);
        for (const [label, path] of [
          ["recipes", "/recepti"],
          ["detail", `/recepti/${recipe.id}`],
          ["edit", `/recepti/${recipe.id}/uredi`],
          ["new", "/recepti/novo"],
          ["approved-plan", `/plan?week=${nextWeekStart()}`],
          ["prices", "/plan/cijene"],
        ]) {
          const response = await page.goto(path);
          expect(response?.status()).toBe(200);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width + 1);
          await page.screenshot({
            path: `test-results/phase4/${width}-${theme}-${label}.png`,
            fullPage: true,
          });
        }
      }
    await page.goto(`/plan?week=${nextWeekStart()}`);
    await page.getByLabel("Potvrđujem promjenu", { exact: true }).check();
    await page
      .getByRole("button", { name: "Ponovno otvori nacrt", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nacrt plana", exact: true }),
    ).toBeVisible();
    const count = await client.plannedMeal.count({
      where: { mealPlan: { householdId } },
    });
    expect(count).toBe(21);
  } finally {
    await client.$disconnect();
  }
});
