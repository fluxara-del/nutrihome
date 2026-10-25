import { defineConfig } from "vitest/config";
// Keep concurrent SQLite adapters and scrypt workers bounded on small CI/household machines.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 15000, hookTimeout: 30000, maxWorkers: 2 } });
