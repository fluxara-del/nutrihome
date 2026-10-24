import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", workers: 1, fullyParallel: false, use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", headless: true, locale: "hr-HR", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }, reporter: "list" });
