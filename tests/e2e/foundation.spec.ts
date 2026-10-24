import { test, expect } from "@playwright/test";
const username = "e2e_owner";
function password() {
  if (!process.env.E2E_PASSWORD) throw new Error("Pokrenite npm run test:e2e; testni račun stvara izolirani runner.");
  return process.env.E2E_PASSWORD;
}
async function login(page: import("@playwright/test").Page) {
  await page.goto("/prijava");
  await page.getByLabel("Korisničko ime", { exact: true }).fill(username);
  await page.getByLabel("Lozinka", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL("/");
}
test("anonymous visitors cannot read protected pages", async ({ request }) => {
  for (const path of ["/", "/zalihe", "/postavke", "/dnevnik", "/napredak"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/prijava");
  }
  expect((await request.get("/api/health")).status()).toBe(200);
});
test("login validates credentials, sets private session and logout revokes it", async ({ page, context }) => {
  await page.goto("/prijava");
  await page.getByLabel("Korisničko ime", { exact: true }).fill(username);
  await page.getByLabel("Lozinka", { exact: true }).fill("incorrect-test-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "nisu ispravni" })).toBeVisible();
  await expect(page.getByLabel("Korisničko ime", { exact: true })).toHaveValue(username);
  await page.getByLabel("Lozinka", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dobro došli u NutriHome." })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
  const cookie = (await context.cookies()).find(c => c.name === "nutrihome_session")!;
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Strict");
  const noCache = await context.request.get("/");
  expect(noCache.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL("/prijava");
  expect((await context.cookies()).some(c => c.name === cookie.name)).toBe(false);
  await context.addCookies([cookie]);
  await page.goto("/postavke");
  await expect(page).toHaveURL("/prijava");
});
test("mobile navigation, real empty state and theme work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole("heading", { name: "Prehrana za danas", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Uključi tamnu temu" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("navigation").getByRole("link", { name: "Zalihe", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zalihe", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-foundation.png", fullPage: true });
});
test("PWA assets are valid and private pages are not put in the offline cache", async ({ page, request, context }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.lang).toBe("hr"); expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const entry of await (await caches.open(name)).keys()) urls.push(new URL(entry.url).pathname);
    return urls;
  });
  expect(cachedUrls).toEqual(["/offline.html"]);
  await page.reload();
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trenutačno si bez mreže." })).toBeVisible();
});

test.describe("CSRF protection", () => {
  // Page routing cannot intercept fetches owned by a service worker.
  test.use({ serviceWorkers: "block" });
test("cross-origin server actions cannot create sessions", async ({ page, request, context }) => {
  await page.goto("/prijava");
  let intercepted = false;
  await page.route("**/prijava", async route => {
    if (route.request().method() === "POST") {
      intercepted = true;
      // Chromium can restore its own Origin on a continued browser request.
      // Replay the actual Server Action payload with an explicitly untrusted origin.
      const headers = await route.request().allHeaders();
      expect(headers["next-action"]).toBeTruthy();
      const rejected = await request.post(route.request().url(), {
        headers: { "content-type": headers["content-type"], "next-action": headers["next-action"], accept: "text/x-component", origin: "https://untrusted.invalid" },
        data: route.request().postDataBuffer()!, maxRedirects: 0,
      });
      await route.fulfill({ response: rejected });
    }
    else await route.continue();
  });
  await page.getByLabel("Korisničko ime", { exact: true }).fill(username);
  await page.getByLabel("Lozinka", { exact: true }).fill(password());
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  const response = await responsePromise;
  expect(intercepted).toBe(true);
  // Server Action failures can be carried inside a 200 RSC stream.
  expect(response.headers()["x-action-redirect"]).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Nešto je pošlo po zlu." })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === "nutrihome_session")).toBe(false);
  expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(307);
});

});
