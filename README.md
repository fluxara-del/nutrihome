# NutriHome

Privatna aplikacija za prehranu, zalihe i planiranje obroka, na hrvatskom jeziku.
**Trenutno: faze 1–3.5 — temelj, zalihe, osobni dnevnik i baza namirnica.** Nije gotova produkcijska nutricionistička aplikacija.

Dostupno u izvoru: relacijska shema i migracije, lokalni vlasnički račun, prijava i
odjava sa serverskim sesijama, zaštićena navigacija, nadzorna ploča sa stvarnim
brojačima iz baze, svijetla/tamna tema, manifest i javna offline stranica,
health endpoint, Docker konfiguracija i alat za online SQLite backup.

Dostupne su zalihe: proizvodi, serije, rokovi, pretraživanje i filtri, potvrđena
potrošnja prema najbližem roku, ispravak/otpis te nepromjenjiva povijest promjena.
Svaka promjena zalihe ima zaštitu od ponovljenog zahtjeva. Istekle serije ne ulaze
u upotrebljivu količinu. Brisanje je dopušteno samo za nekorištene proizvode.

Dostupni su i osobni dnevnik hrane/porcija postojećih recepata, izmjena i brisanje
unosa, nutritivne kopije, sirovo/kuhano uz potvrđen omjer mase, zasebno potvrđena
potrošnja zaliha, osobni ciljevi, težina te 7/30-dnevni pregled s pomičnim prosjekom.

U **Bazi namirnica** dostupni su lokalna pretraga, Open Food Facts, opcionalni
USDA, EAN/UPC kamera i ručni barkod te lokalni OCR fotografije etikete.
Svi podaci prolaze uređivanje i potvrdu. Spremanje proizvoda ne mijenja zalihe ni
dnevnik; njihove se količine potvrđuju zasebno. Fotografije se ne čuvaju trajno.
Vrijednosti na 100 ml traže potvrđenu gustoću, a podaci po porciji poznatu veličinu.

Stvaranje/uređivanje recepata, planer, kupnja, nedjeljni posao i AI
**još nisu implementirani**. Stranice to izričito navode.
Tablice i kalendarske pomoćne funkcije pripremaju kasnije faze; ne predstavljaju
izvršene poslove ili dovršene funkcije.

## Lokalni razvoj

Zahtjevi: Node.js 24 LTS, npm, lokalni disk. Docker je potreban samo za kontejnersku provjeru.

```bash
test -f .env || cp .env.example .env
npm ci
mkdir -p data
npm run db:generate
npm run db:migrate
npm run owner:create -- vlasnik
npm run dev
```

Alat traži lozinku bez prikazivanja znakova; nema zadane lozinke ni javne registracije.
Za automatizirano testiranje dopušten je `NUTRIHOME_ADMIN_PASSWORD` samo za taj CLI
poziv. Ne upisivati stvarnu lozinku u skriptu, shell history ili `.env.example`.
Ponovljeno stvaranje vlasnika odbija promijeniti postojeći račun.
Baza i `.env` su ignorirani u Gitu. APP_URL mora odgovarati točnom originu preglednika;
razvojni zadani origin je `http://localhost:3000`.

U ovom cloud workspaceu cache direktoriji pod homeom su samo za čitanje:
`export npm_config_cache=/tmp/nutrihome-npm-cache` prije npm naredbi.
Prisma preuzima potpisano/checksum-provjereno izvršno okruženje s `binaries.prisma.sh`;
ako ga mrežna pravila blokiraju, dodati tu domenu u postavkama okruženja. Ne isključivati
TLS ili provjeru kontrolnih suma.

## Provjera faza 1–3.5

```bash
npm test
npm run build
npm run typecheck
# Jednokratno: npx playwright install --with-deps chromium
npm run test:e2e
npm run docker:smoke
```

E2E runner stvara zasebnu privremenu bazu i nasumičan testni račun, pokreće produkcijski
build na portu 3107 i uklanja te podatke na izlazu. Potrebno je prvo izvršiti build.
Postojeći Chromium može se koristiti preko `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Testovi ne smiju koristiti osobnu bazu. Docker smoke koristi zaseban Compose projekt,
port 3309 i privremene volumeove koje briše nakon provjere. Ne koristiti taj port za
osobnu instancu. `NUTRIHOME_SMOKE_SKIP_BUILD=1` provjerava već izgrađenu image verziju
bez ponovnog builda. Za cloud Docker build iza upravljanog proxyja:

```bash
export DOCKER_CONFIG=/tmp/nutrihome-docker-config
export NUTRIHOME_PROXY_IP="$(getent ahostsv4 proxy | awk 'NR==1 {print $1}')"
COMPOSE_FILE=docker-compose.yml:docker-compose.cloud.yml npm run docker:smoke
```

Cloud overlay prosljeđuje postojeći proxy i CA preko BuildKit secreta; ne mijenja TLS
provjeru niti mrežna pravila. ZimaOS bez proxyja koristi samo osnovni Compose file.

Testni unos (isključivo zasebna testna baza, nakon stvaranja testnog vlasnika):

```bash
ALLOW_DEMO_SEED=true npm run db:seed
```

Testni proizvod je izričito označen, nutritivne vrijednosti su procjena za test, a
ponovljeni unos neće duplicirati seriju ili transakciju. Seed se ne pokreće automatski.

## Dokumentacija

- [Arhitektura i sigurnosne granice](docs/ARCHITECTURE.md)
- [Plan po fazama](docs/PLAN.md)
- [Razvoj i testiranje u Codex okruženju](docs/CODEX_DEVELOPMENT.md)
- [Faza 2: korištenje zaliha i provjera](docs/PHASE_2_REVIEW.md)
- [Faza 3: dnevnik, ciljevi, težina i provjera](docs/PHASE_3_REVIEW.md)
- [Faza 3.5: izvori, OCR, kamera, Windows i ograničenja](docs/PHASE_3_5_REVIEW.md)
- [ZimaOS instalacija i nadogradnja](docs/ZIMAOS.md)
- [Privatni HTTPS preko Tailscalea](docs/TAILSCALE.md)
- [Sigurnosna kopija i povrat](docs/BACKUP_RESTORE.md)
- [Izvorni zahtjev](docs/PROJECT_BRIEF.md)

Aplikacija ne daje medicinske preporuke. Početni ciljevi nisu potvrđeni korisnički
ciljevi. AI ključ nije potreban za dostupne funkcije i nijedan zahtjev se ne šalje AI servisima.

## Faza 3.6 — lokalna referentna baza

Ugrađeni USDA SR Legacy katalog sadrži 4.748 zapisa i dolazi s aplikacijom. `npm run db:migrate` primjenjuje kontrolirane migracije i uvozi paket bez vanjskog API-ja. Pretraga koristi Moje namirnice → Ugrađenu bazu; Vanjski izvori su isključeni dok ih korisnik ne uključi. Podaci se pregledavaju i potvrđuju prije spremanja osobnog proizvoda, a dnevnik/zalihe imaju zasebnu potvrdu.

Status, licenca i lokalno ažuriranje: **Postavke → Baza namirnica**. Postupak pripreme, ograničenja hrvatskih prijevoda, nutritivno mapiranje i stvarni rezultati provjera: [PHASE_3_6_REVIEW.md](docs/PHASE_3_6_REVIEW.md). Windows upute: [WINDOWS_11.md](docs/WINDOWS_11.md). Linux i Windows build/E2E te Linux Docker smoke potvrđeni su na GitHub CI-ju.
