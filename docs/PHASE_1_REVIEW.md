# Pregled isporuke — faza 1

## Implementirano

- Arhitektura i plan razvoja po fazama na traženom Next.js/React/TypeScript,
  Tailwind/shadcn obrascu komponenti, Prisma/SQLite i Docker temelju.
- Početna relacijska shema svih traženih modula, migracija, indeksi, strani ključevi,
  CHECK ograničenja, idempotencijski ključevi i nepromjenjivi audit zapisi.
- Vlasnik putem lokalnog CLI-ja, scrypt lozinke, neprozirne sesije sa sažetkom u bazi,
  rok isteka, opoziv, HttpOnly/SameSite kolačići, provjera origina i trajni limit prijave.
- Zaštićeno hrvatsko sučelje i nadzorna ploča sa stvarnim brojačima iz baze;
  mobilna navigacija i svijetla/tamna tema. Nedovršeni moduli su izričito označeni.
- PWA manifest, PNG ikone, service worker koji sprema samo javnu offline stranicu.
- Docker/Compose, health endpoint, sigurno početno stvaranje SQLite datoteke,
  migracije prije starta, backup alat i vodiči za ZimaOS, Tailscale i povrat podataka.
- Označeni testni seed, izolirani E2E runner i konfiguracija GitHub Actions provjera.

## Izvršene provjere

| Provjera | Rezultat |
| --- | --- |
| `npm ci` i spremljeni install script | Uspješno; ponovno generiranje, migracija i build |
| `npm test` | 40 prošlo, 0 palo, 0 preskočeno |
| Produkcijski build i TypeScript | Prošlo |
| Prisma schema validation i usporedba baze sa shemom | Prošlo; bez razlika |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | 5 prošlo, 0 palo, 0 preskočeno |
| Docker build (cloud proxy overlay) | Prošlo |
| Docker smoke nad izgrađenom image verzijom | Health, redirect, prijava stranica, manifest, stvaranje vlasnika, backup, migracija uz zaustavljen app, restart i trajnost računa prošli |
| Online backup aktivne WAL baze i povrat u izoliranu bazu | Prošlo; integritet, snimka podataka i prava 0600 |
| Razvojni poslužitelj | Health 200; privatna stranica 307 na prijavu; hrvatski obrazac |
| `npm audit --audit-level=high` | 0 pronađenih ranjivosti |

E2E testovi provjeravaju neispravnu i ispravnu lozinku, očuvanje korisničkog imena pri
ponovnom pokušaju, zastavice kolačića, zabranu cacheiranja privatne stranice, odjavu i
odbijanje opozvane sesije, mobilnu širinu i temu, offline fallback bez osobnih podataka,
te odbijanje stvarnog Server Action zahtjeva s nepouzdanim Originom.

Testovi kalendara provjeravaju pomoćne funkcije za Zagreb i DST; nedjeljni posao još
ne postoji. Testovi zaliha provjeravaju ograničenja sheme i rollback, ne gotov CRUD.
GitHub Actions konfiguracija je dodana, ali remote CI nije pokrenut iz ove sesije.

## Nedovršeno i sljedeća faza

Faza 2: proizvodi, serije, transakcije, FEFO, potrošnja uz potvrdu, pretraživanje i
upozorenja. Dnevnik, recepti, planer, kupnja, raspored i AI slijede prema PLAN.md.
Stvarni ZimaOS host, Tailscale HTTPS i instalacija PWA-a na uređajima nisu provjereni.
Produkcijsko očvršćivanje, uključujući stroži nonce CSP, ostaje u 7. fazi.

## Provjera vlasnika

U razvojnoj bazi nije stvoren osobni račun ni dodan testni proizvod. Iz terminala:

```bash
cd /workspace/nutrihome
npm run owner:create -- vlasnik
```

Unijeti vlastitu lozinku u skriveni prompt. Razvojni poslužitelj je pokrenut preko
`npm run dev`; u novoj sesiji treba ga ponovno pokrenuti prema README.md i spremljenim
start uputama. Nema zadane lozinke. Docker smoke/E2E podaci bili su privremeni i uklonjeni.

Install script, start upute i potrebna Prisma mrežna domena spremljeni su u cloud draft.
Spremanje drafta nije publikacija niti provjera restauracije u novom cloud zadatku.
