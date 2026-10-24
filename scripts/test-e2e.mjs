import { mkdtemp, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const directory = await mkdtemp(join(tmpdir(), "nutrihome-e2e-"));
const port = process.env.E2E_PORT ?? "3107";
const env = { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}`, APP_URL: `http://localhost:${port}`, E2E_BASE_URL: `http://localhost:${port}`, E2E_PASSWORD: randomBytes(24).toString("hex") };
let server, log;
function run(args, extra = {}) {
  const result = spawnSync("npm", args, { env: { ...env, ...extra }, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Testni korak nije uspio: ${args[0]}`);
}
try {
  run(["run", "db:migrate"]);
  run(["run", "owner:create", "--", "e2e_owner"], { NUTRIHOME_ADMIN_PASSWORD: env.E2E_PASSWORD });
  log = await open(join(directory, "server.log"), "w");
  server = spawn("npm", ["run", "start", "--", "--port", port], { env, stdio: ["ignore", log.fd, log.fd], detached: true });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Testni poslužitelj se zaustavio.");
    try { if ((await fetch(`${env.APP_URL}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Testni poslužitelj nije spreman.");
  run(["exec", "playwright", "test"]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
  }
  await log?.close();
  await rm(directory, { recursive: true, force: true });
}
