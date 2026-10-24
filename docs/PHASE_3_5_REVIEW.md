# Faza 3.5 — baza namirnica, barkod i lokalni OCR

Nova stranica je `/namirnice` (Baza namirnica u izborniku). Koristi isti `FoodProduct`,
iste zalihe i isti dnevnik. Faza 4 nije započeta.

## Postupak

1. Traži naziv ili odaberi pretragu po barkodu. Lokalna pretraga zanemaruje veličinu
   slova i hrvatske dijakritičke znakove. Opcija **Samo lokalni katalog** ne kontaktira
   vanjske servise. Lokalni rezultati ostaju dostupni i kad vanjski poziv ne uspije.
2. **Skeniraj barkod** koristi ZXing i stražnju kameru kad je dostupna. Podržani su
   EAN-8, EAN-13, UPC-A i UPC-E. UPC-E se proširuje u UPC-A. Kamera se zaustavlja
   nakon očitanja, zatvaranja ili odlaska sa stranice. Ručni barkod uvijek je moguć.
3. Ako proizvod nije pronađen, fotografiraj etiketu, odaberi postojeću sliku ili
   otvori ručni unos. Kamera zahtijeva dozvolu preglednika i siguran origin.
4. Pregledaj naziv, marku, barkod, stanje, izvor, nutritivne podatke, osnovu i neto
   količinu. Ispravi vrijednosti i potvrdi spremanje. Nepoznata obavezna vrijednost
   blokira spremanje; broj 0 mora biti izričito poznat i unesen.
5. **Spremi u katalog** ne dodaje zalihu ni obrok. Duplikat barkoda ili normaliziranog
   naziva i marke u istom kućanstvu ne prepisuje postojeći proizvod. Isti potvrđeni
   zahtjev ne stvara drugi proizvod. Za postojeći proizvod koristi vezu za uređivanje.
6. **Dodaj u zalihe** otvara postojeći obrazac serije: potrebni su količina, jedinica,
   mjesto čuvanja i potvrda. **Dodaj u dnevnik prehrane** unaprijed odabire proizvod;
   količina i spremanje obroka ostaju zasebni. Oduzimanje zalihe ostaje isključeno.

## Izvori i njihove granice

- **Open Food Facts**: pretraga hrvatskim nazivom i točan EAN/UPC/GTIN uz provjeru
  kontrolne znamenke. Izvor je zajednička baza, može imati pogrešne ili nepotpune
  podatke. Prikaz pripisuje izvor Open Food Facts, ODbL; vidi
  <https://world.openfoodfacts.org/terms-of-use>. Nema masovnog preslikavanja baze.
- **USDA FoodData Central**: samo ako je konfiguriran server-side `USDA_API_KEY`.
  Koriste se generički skupovi Foundation, SR Legacy i Survey (FNDDS), na 100 g
  jestivog dijela. Ograničen rječnik čestih hrvatskih namirnica prevodi upit na
  engleski; ostali nazivi šalju se kako su uneseni. Nije implementiran opći prevoditelj.
  Rezultati USDA često su na engleskom; naziv se može urediti prije spremanja.
- **Lokalni katalog**: samo proizvodi trenutačnog kućanstva, bez vanjskih poziva u
  lokalnom načinu. Nije neovisna offline PWA baza u mobitelu: NutriHome poslužitelj
  mora biti dostupan, a privatne stranice se ne spremaju u service worker cache.

Pozivi idu samo na fiksne HTTPS adrese tih izvora, bez preusmjeravanja, uz rok od
6 sekundi i najviše 2 MB odgovora. Šalju se samo naziv/barkod i parametri pretrage;
USDA dobiva i ključ u zaglavlju. Fotografije, dnevnik, korisnik i kućanstvo se ne šalju.
Nedostupan izvor daje poruku, ne prekida lokalni rad. Nema plaćenog AI API-ja.

## Nutritivna osnova i nepoznati podaci

Izvor može dati podatke na 100 g, 100 ml ili po porciji. Nepoznata osnova blokira
spremanje dok je korisnik ne razjasni. Za porciju je potrebna njena masa u g ili
volumen u ml. Svaki preračun iz ml zahtijeva izričito potvrđenu gustoću u g/ml;
ne pretpostavlja se gustoća vode. Kanonske vrijednosti i dalje su na 100 g, kao u
fazama 1–3. Izvorna vrsta osnove i podrijetlo ostaju uz proizvod, a povijesne kopije
u dnevniku se ne mijenjaju. Preračun koristi cjelobrojne omjere i zaokruživanje.

Vlakna mogu ostati nepoznata (`fiberKnown=false`). Zbog postojećeg modela izračuna
interni broj tada je 0, uz obveznu oznaku procjene; nije tvrdnja da proizvod nema
vlakana. Stranica proizvoda prikazuje **nepoznato**, a obrazac uređivanja traži stvarnu
vrijednost. Budući planer mora uvažavati tu oznaku. Ostala četiri nutrijenta ne mogu
ostati prazna. Naknadno ručno uređivanje označava podrijetlo kao ručni unos.

## Lokalni OCR

Odabran je **Tesseract.js** jer isti Node kod i WASM rade na Windowsu i u Linux
kontejneru, bez zasebne instalacije Tesseract izvršne datoteke. Hrvatski i engleski
modeli (`@tesseract.js-data/hrv`, `@tesseract.js-data/eng`) dolaze kroz zaključane npm
ovisnosti. Pri obradi se koriste isključivo lokalne datoteke modela, bez CDN-a.
Modeli se privremeno kopiraju u jedan direktorij pa uklanjaju; fotografije i
prepoznati tekst ne zapisuju se na disk ni u bazu. Fotografija i tekst ostaju u
memoriji preglednika/poslužitelja tijekom obrade i pregleda.

Prije OCR-a Sharp provjerava stvarni format i dimenzije, uklanja metapodatke,
ispravlja orijentaciju i svodi sliku na najviše 1800 × 1800. Dozvoljeni su JPEG,
PNG i WebP do 5 MB i 12 milijuna ulaznih piksela. SVG, HEIC, animacije, neispravan
sadržaj i neslaganje MIME vrste se odbijaju. HEIC s iPhonea prvo pretvori u JPEG.

OCR radi u zasebnom procesu, najviše jedna obrada po instanci, do 45 sekundi i uz
256 MB ograničenje JS heapa (WASM i native memorija su dodatni). Predvidi barem
oko 1 GB dostupne memorije za aplikaciju s OCR-om; stvarna potrošnja ovisi o slici.
Ograničenja su 5 OCR pokušaja i 30 pretraga po korisniku u minuti. Brojači su u
memoriji jedne instance i resetiraju se pri restartu; nisu distribuirani limiti.

Parser podržava hrvatske i uobičajene engleske, njemačke i francuske nutritivne
oznake, decimalni zarez/točku i kJ/kcal (`1 kcal = 4,184 kJ`). Jednostavni redovi
s dva jasno označena stupca mogu se razdvojiti. Nejasan raspored, višestruki
redovi istog nutrijenta i granične vrijednosti poput `<0,5` ostavljaju polje prazno.
Naziv je samo prijedlog iz prve odgovarajuće linije. Ovo nije opći parser svake
europske etikete: fotografiraj ravno, bez odsjaja, po mogućnosti izdvojenu tablicu.
Složene tablice, sitan tisak i višejezična ponavljanja zahtijevaju ručni unos.

## Windows 11 — PowerShell

Instaliraj Git i Node.js 24 LTS (24.11 ili noviji u grani 24). Prijavi Git na svoj
privatni repozitorij. Nakon checkouta ove grane/promjene:

```powershell
Set-Location C:\putanja\nutrihome
git fetch origin
git switch phase-3-5-food-catalog
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run db:generate
# Za postojeću bazu: backup i zaustavi aplikaciju prije migracije.
npm run backup
npm run db:migrate
# Samo prvi put, ako vlasnik još ne postoji:
npm run owner:create -- vlasnik
npm run dev
```

Za prvu instalaciju bez postojeće baze preskoči backup. Lozinku unosi samo u skriveni
terminalski prompt. Postojeći vlasnik se ne mijenja. Koristi port 3000 i lokalni
origin iz `.env.example`; ključeve ne upisuj u chat ili Git.

USDA ključ se besplatno traži preko <https://fdc.nal.usda.gov/api-key-signup>.
U lokalni `.env` dodaj `USDA_API_KEY=...` i ponovno pokreni poslužitelj. Ključ je
opcionalan, nema `NEXT_PUBLIC_` prefiks i ne ulazi u klijentski bundle. Compose
prosljeđuje istu server varijablu bez ugrađivanja u image. OCR nema dodatne postavke.

```powershell
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

E2E runner koristi zasebnu bazu i slučajan testni račun. npm/Next pozivi koriste
Node CLI i podržavaju Windows procese bez ovisnosti o Unix process groups.
Docker smoke skripta koristi Bash; na Windowsu je pokreni iz WSL2 s Docker Desktopom.
CI uključuje Linux i Windows job; stvarni status provjeri u GitHub Actions.

## Kamera mobitela i privatni HTTPS

Obična LAN HTTP adresa razvojnog računala nije siguran origin za kameru na mobitelu.
NutriHome ne otvara javni tunel. Koristi privatni Tailscale HTTPS opisani u
[vodiču](TAILSCALE.md), ili vlastiti HTTPS reverse proxy s certifikatom kojem
mobitel vjeruje. Mobitel mora moći pristupiti tom privatnom hostu.

Postavi `APP_URL` na točan HTTPS origin i ponovno pokreni aplikaciju. Dopusti
kameru pregledniku te otvori Bazu namirnica → Skeniraj barkod. Kamera se dopušta
samo istom originu (`Permissions-Policy: camera=(self)`); mikrofon ostaje zabranjen.
Ako kamera nije dostupna, koristi ručni barkod ili postojeću sliku.

## Promjene i provjere

- `prisma/schema.prisma`, četvrta migracija: podrijetlo, izvorna osnova, poznatost
  vlakana i neto količina uz postojeći proizvod; nepromjenjive potvrde import zahtjeva.
- `src/lib/food-draft.ts`, `food-providers.ts`, `catalog.ts`: granice providera,
  lokalna/vanjska pretraga, potvrđeni preračun i spremanje bez prepisivanja.
- `src/lib/label-parser.ts`, `image-validation.ts`, `local-ocr.ts`, `catalog-limits.ts`,
  `scripts/ocr-worker.cjs`: lokalna obrada slika, parser i ograničenja.
- `src/app/api/{food-search,label-ocr}`, `src/app/(private)/namirnice`,
  `src/components/barcode-scanner.tsx`: autorizirani endpointi i mobilni postupak.
- Navigacija, novi/pročitani/uređivani proizvod, odabir proizvoda u dnevniku, CSS,
  sigurnosna zaglavlja, `.env.example`, Compose i npm lockfile.
- Novi domenski, migracijski, sigurnosni, stvarni OCR i browser testovi;
  Windows CI, prenosivi E2E runner i Docker OCR smoke.

Zaseban migracijski test provjerava stare ID-eve, nutritivne vrijednosti i zalihe.
Integracijski testovi koriste privremene SQLite baze, simuliraju odgovore i prekide
vanjskih API-ja te provjeravaju ključeve, duplikate i potvrdu zalihe. OCR test koristi
stvarnu PNG etiketu i lokalne modele. Browser testovi provjeravaju cijeli postupak,
upload/CSRF/prijavu i EAN iz simuliranog videosignala sa zaustavljanjem kamere.
Simulirana kamera nije zamjena za provjeru fizičkog Android/iPhone uređaja.

Za fazu 4 spreman je isti katalog s potvrđenim nutrijentima, podrijetlom i opcionalnom
neto količinom. Recepti, planer, automatska kupnja i AI nisu dio ove promjene.

## Stvarno izvršeni rezultati — 24. 10. 2026.

Provjereno u Linux cloud okruženju, Node.js 24.19.0:

| Provjera | Rezultat |
| --- | --- |
| `npm test` | 107 testova u 13 datoteka prošlo |
| `npm run typecheck` | Prošlo |
| `npm run build` | Produkcijski build prošao |
| `npm run test:e2e` uz sistemski Chromium | Svih 15 testova prošlo |
| Docker build i `npm run docker:smoke` uz cloud proxy overlay | Prošlo, uključujući stvarni OCR kroz autorizirani produkcijski HTTP endpoint, backup, restart i očuvanje zaliha/dnevnika |
| Prisma usporedba stvarne sheme s modelom | Nema razlike |
| Nadogradnja postojeće radne baze | Provjeren backup; usporedba originalnih stupaca i sažetaka svih zapisa u devet tablica nije našla promjene; integrity i foreign-key provjere prošle |
| Klijentski JavaScript i Git sadržaj | Nema USDA server konfiguracije u klijentskom bundleu; `.env`, baze, backupi i fotografije nisu uključeni u Git |

Izravni Open Food Facts poziv nije bio dostupan iz ovog cloud okruženja, ni uz
postojeći upravljani proxy. Vanjski odgovori i prekidi testirani su simulacijama;
to ne potvrđuje trenutačnu dostupnost servisa na drugoj mreži. USDA poziv sa stvarnim
ključem nije izvršen. Za korištenje izvana poslužitelj treba mrežni pristup prema
`world.openfoodfacts.org` i, ako se koristi USDA, `api.nal.usda.gov`.
Windows 11 i fizički mobitel nisu dostupni u ovom okruženju; Windows CI je dodan,
a njegov rezultat nakon pushanja treba provjeriti u GitHub Actions.

Potpun popis 44 promijenjene datoteke nalazi se u [manifestu](PHASE_3_5_FILES.md).
