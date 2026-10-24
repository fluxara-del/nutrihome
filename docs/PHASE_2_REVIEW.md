# Faza 2 — upravljanje zalihama

Povijesni pregled isporuke faze 2. Aktualna integracija dnevnika i zaliha opisana je
u [pregledu faze 3](PHASE_3_REVIEW.md).

## Dostupne funkcije

- Katalog: dodavanje i uređivanje proizvoda, nutritivne vrijednosti na 100 g,
  oznaka procjene, barkod, marka, kategorija, zadana jedinica i prag male zalihe.
- Serije: količina, hladnjak/zamrzivač/smočnica, rok trajanja, datum kupnje i stvarna
  ukupna cijena koju je korisnik unio. Datum kupnje i cijena nisu obavezni.
- Potvrđena potrošnja: najbliži poznati rok prvi (FEFO), zatim serije bez roka.
  Istekle serije su isključene. Dan isteka još vrijedi u Europe/Zagreb kalendaru.
- Ispravak stvarne ukupne količine i otpis na 0 uz obavezan razlog i potvrdu.
- Uređivanje podataka serije odvojeno od količine, uz zapis u povijesti.
- Pretraživanje po nazivu, marki i barkodu; kategorija, mjesto, mala zaliha,
  skori istek i istekle serije; 20 proizvoda po stranici.
- Upozorenja prema upotrebljivim količinama, pregled nutrijenata i povijesti.
- Brisanje isključivo nekorištenog proizvoda. Serije i audit zapisi ne brišu se.

Potrošnja zaliha još ne stvara unos u dnevniku prehrane: taj modul je faza 3.
Nijedno planiranje ne troši zalihe. Nema AI, automatski izmišljenih cijena ni
pretpostavke da je 1 ml jednak 1 g.

## Kako koristiti

1. Nakon prijave otvori **Zalihe → Dodaj proizvod** i upiši podatke s etikete.
   Kod procijenjenih podataka označi procjenu. Prag male zalihe je u gramima;
   vrijednost 0 isključuje upozorenje. Za ml/l unesi gustoću, za komade masu komada.
2. Na detalju proizvoda u **Nova serija** upiši količinu, mjesto i poznate datume.
   Potvrdi promjenu pa odaberi **Dodaj seriju**. Unos istekle serije dopušten je za
   evidenciju postojeće hrane, ali takva serija ne ulazi u upotrebljivu zalihu.
3. U **Potroši iz zalihe** unesi stvarno potrošenu količinu, potvrdi potrošnju i
   spremi. Ako nema dovoljno upotrebljive zalihe, ništa se ne oduzima.
4. Za selidbu ili ispravak roka proširi **Uredi podatke serije**. Za ispravak nakon
   vaganja ili otpis proširi **Ispravi količinu / otpiši**, upiši novu ukupnu
   količinu (ne razliku) i razlog. Otpis cijele serije znači novu količinu 0.
5. Provjeri **Povijest promjena**. Ponovljen isti zahtjev ne stvara novu potrošnju.
   Zastarjeli ispravak se odbija; osvježi podatke i ponovno provjeri količinu.

Filtriranje po mjestu odabire proizvode prisutne na tom mjestu. Prikazane količine
po proizvodu obuhvaćaju sva mjesta i jasno izdvajaju istekle količine.

## Migracija i sigurnost

`20261024010000_inventory_operations` dodaje verziju serije, operacije s korisnikom
koji je potvrdio promjenu te vezu na transakcije. Postojeće količine i audit zapisi
ostaju sačuvani. Operacije i transakcije su nepromjenjive. Otisak zahtjeva sprječava
upotrebu istog ključa za drugi sadržaj; verzija sprječava prepisivanje novije količine.
Sve promjene koriste jednu Prisma/SQLite transakciju i provjeru kućanstva.

Prije nadogradnje napravi kopiju (`npm run backup -- ./backups` ili Docker ekvivalent
iz BACKUP_RESTORE.md), zaustavi aplikacijski proces, pa pokreni `npm run db:migrate`.
Ne koristiti reset ili `db push`. U Dockeru startup primjenjuje obje migracije prije
poslužitelja. Testni runneri koriste privremene baze; ne mijenjaju osobne podatke.

## Izvršene provjere

- **57 testova**, svi prošli, bez preskočenih: postojeći temelj te 17 dodatnih testova
  inventara, uključujući nadogradnju stare baze bez gubitka podataka.
- **8 browser testova**, svi prošli, bez preskočenih: mobilni CRUD tok, serije,
  potrošnja i nedostatak zalihe, uređivanje, ispravak, otpis, filtri, trajnost,
  brisanje nekorištenog proizvoda i stvarni zahtjev potrošnje bez sesije.
- TypeScript i produkcijski Next.js build prošli. Baza i Prisma shema su bez razlika.
- Docker build i smoke prošli: stvaranje testnog vlasnika, 500 g unosa, potvrđena
  potrošnja 125 g, ponavljanje bez drugog oduzimanja, backup i provjera preostalih
  375 g te dva audit zapisa nakon ponovnog stvaranja kontejnera.
- Testovi potvrđuju izolaciju kućanstava, točne pretvorbe i cijene, manjak, istek,
  zastarjele ispravke, rollback kada audit ne uspije te sukob dvaju SQLite klijenata.

Naredbe iz korijena projekta:

```bash
npm run db:generate
npm test
npm run build
npm run typecheck
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run docker:smoke
```

Za Docker u ovom upravljanom cloud proxy okruženju koristi dodatne export naredbe
iz README.md i `COMPOSE_FILE=docker-compose.yml:docker-compose.cloud.yml`.
ZimaOS bez takvog proxyja koristi osnovni docker-compose.yml.

## Preostalo

Dnevnik prehrane, ciljevi i težina su faza 3. Recepti/planer, kupnja/raspored i AI
slijede prema PLAN.md. Stvarni ZimaOS, Tailscale HTTPS i instalacija na uređajima nisu
provjereni. Cloud radni direktorij i preuzimljivi ZIP nisu objava na GitHub ili
javno postavljanje aplikacije. Osobna baza i lozinke nisu uključene u izvorni paket.
