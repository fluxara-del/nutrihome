# Faza 3 — dnevnik prehrane, osobni ciljevi i težina

## Što radi

- **Dnevnik prehrane**: odabir datuma, proizvoda ili porcija postojećeg recepta,
  metričkih jedinica, sirove/kuhane mase, oznake procjene te dodavanje, uređivanje
  i brisanje unosa. Prikaz kalorija, bjelančevina, ugljikohidrata i masti prema
  trenutačnim potvrđenim osobnim ciljevima.
- **Nutritivna kopija**: unos pamti podatke koje je koristio pri prvom spremanju.
  Kasnija promjena kataloga, naziva, sastojaka ili broja porcija recepta ne mijenja
  stare izračune. Uređivanje količine koristi spremljenu kopiju.
- **Sirovo/kuhano**: podatak o stanju proizvoda, potvrđeni omjer kuhane/sirove mase
  i računanje u oba smjera. Preračun je dopušten samo za izmjerenu masu u g/kg,
  bez prenošenja gustoće ili mase komada u drugo stanje. Označen je procjenom jer
  omjer mase ne mjeri gubitke nutrijenata. Može se koristiti i zaseban proizvod s
  nutritivnim vrijednostima baš za kuhanu hranu.
- **Opcionalna potrošnja zaliha uz novi unos**: isključena dok je korisnik ne označi
  i zasebno potvrdi. Potrošnja i dnevnik spremaju se zajedno; manjak ili greška bilo
  kojeg sastojka vraća sve promjene. Oduzimanje koristi aktualno stanje i današnje
  rokove, čak i ako je datum obroka stariji.
- **Postavke**: osobni ciljevi, broj obroka, budžet i preferencije. Nema automatskog
  propisivanja deficita. Preferencije i budžet zasad se spremaju za budući planer.
- **Težina**: jedno mjerenje po datumu, unos, uređivanje i brisanje, preciznost do
  jednog grama. Duplikat datuma ne prepisuje postojeće mjerenje bez uređivanja.
- **Napredak**: 7/30-dnevni pregled, broj zabilježenih dana, prosjeci i interaktivni
  graf mjerenja s pomičnim prosjekom dostupnih mjerenja u posljednjih 7 kalendarskih
  dana. Dani bez zapisa ne zamjenjuju se nulama ili izmišljenim mjerenjima.
- **Nadzorna ploča**: stvarni današnji nutrijenti, potvrđeni ciljevi, spremljeni
  obroci i posljednja zabilježena težina.

Stvaranje i uređivanje recepata još je faza 4. Dnevnik već podržava porcije recepata
koji postoje u bazi i imaju ispravne sastojke. Testni recepti korišteni za provjeru
nisu dodani u osobnu bazu. Sve dostupne funkcije rade bez OpenAI ključa i API-ja.

## Važna pravila

1. Unos dnevnika zadano ne mijenja inventar. Ako si potrošnju već potvrdio/la u
   Zalihama, ne uključuj ponovno oduzimanje uz dnevnik.
2. Uređivanje i brisanje dnevnika ne vraća niti ponovno oduzima zalihu. Za pogrešno
   knjiženu potrošnju napravi zaseban ispravak u Zalihama uz razlog. Povijest već
   potvrđene promjene zalihe ostaje sačuvana.
3. Osobni dnevnik, težina i ciljevi odvojeni su i između članova istog kućanstva.
   Zajednički su proizvodi i recepti, ne osobna mjerenja i prehrambeni zapisi.
4. Nakon greške obrazac zadržava odabire; nakon uspjeha čisti količinu i potvrde.
   Ponovljen zahtjev ne stvara duplikat niti oživljava izbrisani zapis. Zastarjela
   izmjena ili brisanje odbija se bez prepisivanja novijih podataka.
5. Dani bez zapisa nisu dokaz da ništa nije pojedeno. Dnevni prehrambeni prosjek
   prikazuje koliko dana ima zapise, a oni i dalje mogu biti nepotpuni.
6. Stvarni unos hrane i težine ne može imati budući datum. Lokalni dani i prozori
   računaju se za Europe/Zagreb, uključujući ljetno/zimsko vrijeme.
7. Proizvodi iz ranijih faza dobivaju početno stanje RAW; ranije količine i nutrijenti
   ne preračunavaju se migracijom. Provjeri stanje svoje etikete. Za kuhano stanje
   možeš napraviti zaseban proizvod. Aktivna zaliha sprječava tihu promjenu stanja.

## Kratka ručna provjera

1. Prijavi se u vlastiti račun. U **Postavke** upiši svoje ciljeve i potvrdi ih.
2. U **Zalihe** dodaj proizvod s poznatim vrijednostima i stanjem sirovo/kuhano.
3. Otvori **Dnevnik prehrane**, odaberi datum i proizvod, upiši količinu i potvrdi.
   Provjeri ukupne nutrijente i usporedbu s ciljevima.
4. Za preračun sirovo/kuhano odaberi drugo stanje te unesi i potvrdi izmjereni omjer.
   Primjer: 100 g sirove namirnice nakon kuhanja teži 250 g → omjer 2,5.
5. Za knjiženje zalihe označi opciju oduzimanja i zasebnu potvrdu. Provjeri količinu
   u Zalihama te njezinu povijest. Bez te opcije količina ostaje nepromijenjena.
6. Promijeni vrijednosti proizvoda u katalogu. Stari dnevnik treba ostati isti.
   Uredi količinu starog unosa i provjeri da koristi njegovu izvornu kopiju.
7. U **Napredak** dodaj težinu za više datuma. Odaberi 7/30 dana i gumbe mjerenja
   ispod grafa. Provjeri prosjek, broj mjerenja te uređivanje i brisanje zapisa.

## Migracija i provjera

`20261024020000_nutrition_diary` je dodatna migracija: čuva prethodne nutrijente,
težine, ciljeve i zalihe, dodaje kopije, izvorne jedinice, verzije zapisa i trajne
potvrde zahtjeva. Stari dnevnički zapisi bez pune etikete ostaju sačuvani; pri
uređivanju se skaliraju iz prethodnih spremljenih vrijednosti i označavaju procjenom.

Prije migracije napravi provjerenu kopiju i zaustavi samo svoj aplikacijski proces.
Koristi `npm run db:migrate`; bez resetiranja ili `db push`. Docker primjenjuje sve
tri migracije prije starta aplikacije. Postupci su u ZIMAOS.md i BACKUP_RESTORE.md.

Izvršeno:

- **80 testova**, svi prošli: prethodnih 57 te 23 nova testa dnevnika, pretvorbi,
  privatnosti, idempotentnosti, težine, postavki, prosjeka i migracije.
- **11 browser testova**, svi prošli: ciljevi, kuhana hrana i omjer mase, povijesna
  kopija nakon promjene proizvoda, uređivanje/brisanje, porcije recepta, težina,
  duplikati datuma, graf i privatnost među članovima te odbijanje zahtjeva bez sesije.
- TypeScript i produkcijski Next.js build prošli. Baza i Prisma shema su bez razlika.
- Docker završni runtime slaže se jednim kopiranjem pripremljenog stabla, kako se veliki
  direktorij ovisnosti ne bi ponavljao u više uzastopnih slojeva.
- Docker build i smoke prošli: dnevnik, nutritivnu kopiju, potvrđenu potrošnju, ponavljanje
  zahtjeva bez duplikata, težinu, ciljeve, backup i podatke nakon ponovnog stvaranja
  kontejnera, uz ranije provjere zaliha i autentikacije.

Naredbe za ponavljanje iz korijena projekta:

```bash
npm run db:generate
npm test
npm run build
npm run typecheck
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run docker:smoke
```

U ovom cloud proxy okruženju Docker koristi dodatni overlay i export naredbe iz
README.md. Testni runneri koriste privremene baze i uklanjaju ih nakon provjere;
ne koriste osobne zapise. Stvarna ZimaOS/Tailscale instalacija još nije provjerena.
Kod u radnom direktoriju i ZIP-u nije time poslan na GitHub ni objavljen kao web-stranica.
