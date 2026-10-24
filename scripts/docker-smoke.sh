#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project="nutrihome-smoke-$$"
export NUTRIHOME_SMOKE_PROJECT="$project"
export APP_URL=http://localhost:3309 NUTRIHOME_PORT=3309
cleanup() { docker compose -p "$project" down --volumes --remove-orphans >/dev/null; }
trap cleanup EXIT
if [[ "${NUTRIHOME_SMOKE_SKIP_BUILD:-0}" == "1" ]]; then
  docker compose -p "$project" up --detach --wait --wait-timeout 180
else
  docker compose -p "$project" up --build --detach --wait --wait-timeout 180
fi
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const base = 'http://localhost:3309';
const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok' });
const privatePage = await fetch(base, { redirect: 'manual' });
assert.equal(privatePage.status, 307);
assert.equal(privatePage.headers.get('location'), '/prijava');
assert.match(await (await fetch(`${base}/prijava`)).text(), /Prijavi se/);
assert.equal((await (await fetch(`${base}/manifest.webmanifest`)).json()).lang, 'hr');
console.log('Docker smoke: health, private redirect, login and manifest passed.');
JS
# Create a real fixture account without putting its random password in logs/argv.
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const result = spawnSync('docker', ['compose', '-p', process.env.NUTRIHOME_SMOKE_PROJECT, 'exec', '-T', '-e', 'NUTRIHOME_ADMIN_PASSWORD', 'app', './node_modules/.bin/tsx', 'scripts/create-owner.ts', 'smoke_owner'], { env: { ...process.env, NUTRIHOME_ADMIN_PASSWORD: randomBytes(24).toString('hex') }, stdio: 'inherit' });
if (result.status !== 0) process.exit(1);
JS
docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/inventory-smoke.ts
docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/reference-smoke.ts
docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/nutrition-smoke.ts
node --import tsx --input-type=module -e 'import { labelImage } from "./tests/fixtures/label-image.ts"; process.stdout.write(await labelImage());' | docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/ocr-smoke.ts
docker compose -p "$project" exec -T app ./node_modules/.bin/tsx scripts/backup.ts /app/backups
# Migrations can be safely re-applied; data survives container recreation.
# SQLite migrations need exclusive access; stop the only app writer first.
docker compose -p "$project" stop app
docker compose -p "$project" run --rm --no-deps app npm run db:migrate
docker compose -p "$project" up --detach --force-recreate --wait --wait-timeout 180
node -e 'fetch("http://localhost:3309/api/health").then(r=>{if(!r.ok)process.exit(1);console.log("Docker restart passed")}).catch(()=>process.exit(1))'

docker compose -p "$project" exec -T app node -e 'const S=require("better-sqlite3");const d=new S("/app/data/nutrihome.db",{readonly:true});if(d.prepare("SELECT username FROM User WHERE username=?").get("smoke_owner")?.username!=="smoke_owner")process.exit(1);d.close();console.log("Docker data persistence passed")'

docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/inventory-smoke.ts verify

docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/nutrition-smoke.ts verify

docker compose -p "$project" exec -T -e NUTRIHOME_SMOKE=1 app ./node_modules/.bin/tsx scripts/reference-smoke.ts
