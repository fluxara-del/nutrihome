# Windows 11 — lokalni razvoj

Koristi Node.js 24.11 ili noviji iz grane 24 i PowerShell. Nakon preuzimanja grane `phase-3-6-local-food-db`:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate
npm run owner:create -- moje_korisnicko_ime
npm run dev
```

Za stvaranje računa postavi `NUTRIHOME_ADMIN_PASSWORD` prema postojećem README-u; ne spremaj lozinku u Git. `db:migrate` čuva postojeće podatke i lokalno inicijalizira referentni katalog. Za postojeću instalaciju prvo napravi `npm run backup`; ne pokreći reset ili `db push`.

Uobičajena instalacija ne preuzima USDA/OFF podatke. npm treba pristup registru pri prvoj instalaciji ovisnosti; sam katalog i lokalni OCR poslije ne trebaju mrežu. `/namirnice` pretražuje osobne proizvode i ugrađeni katalog. Vanjski izvori prema zadanim postavkama nisu uključeni.

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Ako Turbopack u ograničenom okruženju prijavi zabranu junctiona, provjeri Windows razvojne dozvole i pokušaj `npm run build -- --webpack`. U Codex sandboxu i taj pokušaj može ostati blokiran `EPERM mkdir`; tada build i E2E nisu potvrđeni. Ne mijenjaj ovisnosti radi prikrivanja te greške. Opcionalno preusmjeri npm cache u radnu mapu ako zadani cache nema prava pisanja.

Za ažuriranje iz lokalnog paketa i izvore podataka vidi [PHASE_3_6_REVIEW.md](PHASE_3_6_REVIEW.md). Nakon novog ručnog uvoza ponovno pokretanje aplikacije ne vraća stariji paket.
