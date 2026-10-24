# Faza 3.6 — ugrađeni katalog (pregled)

## Podaci i porijeklo

Isporučeno je **4.748 stvarnih zapisa** USDA FoodData Central SR Legacy April 2018, iz službenog JSON arhiva:
https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip

Izvorna datoteka sadrži 7.793 zapisa. Izabrano je 13 kategorija: povrće, voće, žitarice/tjestenina, mlijeko/jaja, perad, mahunarke, riba, orašasti plodovi/sjemenke, ulja, začini, svinjetina, govedina, janjetina/teletina/divljač. Izostavljene su kategorije restoranske hrane, grickalica, slatkiša i drugih složenih proizvoda. SR Legacy može sadržavati pojedine imenovane proizvode i unutar izabranih kategorija. Nema Open Food Facts dumpa niti izmišljenih barkodova.

Skript provjerava potpunost energije/proteina/ugljikohidrata/masti, granice i jedinstvenost normaliziranog izvornog naziva. Za ovaj skup svih 4.748 odabranih zapisa prošlo je provjere. Identitet je stabilni `usda-sr-FDC_ID`; izvorni engleski naziv nije skraćen u referentnoj tablici. Osobni obrazac ograničava naziv na postojećih 120 znakova i dopušta pregled prije spremanja.

USDA navodi public domain i CC0-1.0: https://fdc.nal.usda.gov/api-guide/#bkmk-6
U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, SR Legacy (April 2018). https://fdc.nal.usda.gov/

`catalog/reference/manifest.json` sadrži verziju, datum pakiranja, broj zapisa, SHA-256 izvornog JSON-a i komprimiranog paketa. Datum pakiranja nije datum USDA mjerenja. Izvorna izdanja mogu imati kasniji datum objave zapisa u FDC-u.

## Mapiranje i ograničenja

- USDA nutrient ID 1008 (kcal), 1003 (protein, g), 1005 (carbohydrate by difference, g), 1004 (total lipid, g), 1079 (fiber, g).
- Sve vrijednosti su na **100 g jestivog dijela**, pohranjene kao stotinke. Nema pretpostavljene gustoće ni mase komada.
- Ugljikohidrati su **ukupni izračunati razlikom, uključuju vlakna**, a ne europski dostupni ugljikohidrati s etiketa. Ne oduzimamo vlakna automatski. Vrsta je eksplicitno pohranjena i prikazana u referentnom rezultatu/upozorenju.
- Nedostajući nutrijent ostaje `null`, u obrascu prazan. Nula se prenosi samo ako je izvor stvarno navodi. Nepoznata vlakna u osobnom katalogu koriste postojeći `fiberKnown=false` mehanizam.
- Hrvatski nazivi ručno su dodani za devet točno određenih zapisa (banana, jabuka, jaje, krumpir, dvije riže i tri pileća prsa). Ostala hrana zadržava engleski naziv; kategorije su prevedene. Ovo nije potpuni hrvatski rječnik.
- Priprema se konzervativno izvodi iz izričitih riječi u nazivu (`raw`, `cooked`, `boiled`, `stewed`, `fried`, `roasted`, `baked`). `OTHER` nije tvrdnja da je hrana sirova. Izvorni naziv je uvijek vidljiv; osobni obrazac zahtijeva provjeru stanja.
- Pretraga po svim normaliziranim tokenima radi unutar SQLitea, vraća do 20 zapisa po izvoru/stranici i ne učitava cijeli katalog po zahtjevu. Indeks kategorija/naziv podržava pregled; `contains`/`instr` zahtijevaju skeniranje malog kataloga. FTS nije uveden zbog djelomičnih naziva i kompatibilnosti. Nije provedeno mjerenje na stvarnom ZimaOS uređaju.

## Uvoz i ažuriranje bez mreže

Za prvu instalaciju nakon `npm ci` pokrenuti `npm run db:migrate`. Kontrolirane migracije dodaju samo `ReferenceFood` i `ReferenceCatalog`. Zatim se lokalni paket uvozi samo ako nema instaliranog kataloga. Ne koristi se `db push`, reset ili brisanje osobnih tablica.

Ponovna izrada paketa (održavatelj, mreža potrebna samo za preuzimanje izvora):

```powershell
Invoke-WebRequest 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip' -OutFile sr.zip
Expand-Archive sr.zip -DestinationPath sr
npm run catalog:prepare -- ./sr/FoodData_Central_sr_legacy_food_json_2018-04.json
```

Provjeriti stvarni naziv raspakirane datoteke. Verziju i datum u `scripts/prepare-reference.mjs` promijeniti za novo izdanje pravila/podataka, pregledati izbor kategorija i nutritivno mapiranje. Skript je determinističan za isto izdanje, ulaz i Node/zlib verziju; između različitih zlib verzija komprimirani sažetak može se razlikovati. Pohraniti novi paket i manifest zajedno u Git. Izvorni veliki arhiv ne mora se distribuirati s aplikacijom.

Prije ažuriranja postojeće baze napraviti `npm run backup`. Lokalni uvoz:

```powershell
npm run catalog:import -- ./catalog/reference/catalog.json.gz SHA256_IZ_MANIFESTA
```

Ili otvoriti **Postavke → Baza namirnica**, odabrati pripremljenu `.json.gz` datoteku, upisati provjereni SHA-256 i potvrditi zamjenu. Aplikacija nema sustav uloga: zajedničkim katalogom upravlja prvi račun po `createdAt`, uz `id` kao razrješenje izjednačenja. Ostali prijavljeni računi vide status. SHA-256 otkriva oštećenje, nije digitalni potpis: paket i očekivani sažetak moraju doći iz pouzdanog izvora. Učitavanje je ograničeno na 5 MB, raspakiravanje na 20 MB i 10.000 zapisa.

Uvoz prvo validira sve zapise i duplikate, zatim atomski zamjenjuje samo referentni snapshot i metapodatke. Isti sažetak je no-op. Zapisi uklonjeni iz novog snapshota uklanjaju se samo iz reference. Osobni proizvodi nisu povezani živom relacijom i ne prepisuju se; povijesni obroci zadržavaju svoje snapshotove. Ponovno pokretanje ne vraća ručno uvezen katalog na ugrađenu verziju.

Docker slika nosi `catalog/` izvan podatkovnog volumena. Pri pokretanju radi migraciju i lokalni import ako je prazan; SQLite ostaje u postojećem trajnom `/app/data` volumenu. Rekreiranje kontejnera ne briše ručno ažuriranu referencu.

## Tijek korisnika

Pretraga prvo vraća Moje namirnice pa Ugrađenu bazu. Vanjski izvori prema zadanim postavkama su isključeni i API zahtijeva `external=1`; `local=1` uvijek ima prednost. Poznati lokalni barkod ne šalje se dalje ni uz uključene vanjske izvore. Za nepoznati barkod dostupni su fotografiranje etikete, ručni unos i izričito uključivanje vanjske pretrage. OCR i ZXing kod ostaju postojeći lokalni mehanizmi.

Referentne akcije otvaraju postojeći obrazac **Provjeri podatke**. Nakon potvrde osobnog proizvoda korisnik bira postojeći obrazac dnevnika ili zalihe i tamo potvrđuje količinu i ostale podatke. Klik na rezultat sam ne stvara osobni proizvod, zalihu ili obrok. Ispravljeno je postojeće odsijecanje decimala u `reviewedProduct`: 1,09 g više ne postaje 1 g.

## Stvarne lokalne provjere (Windows sandbox, 25.10.2026.)

- `npm ci`: uspješno nakon preusmjeravanja npm cachea unutar radne mape; Node 24.22.1.
- `npm test`: **109/109 prolazi**, uključujući stvarni paket, hrvatske nazive i dijakritiku, sirovo/kuhano, nule/null, integritet, duplikate, ponovni import, ažuriranje, očuvanje osobnog proizvoda, stvarnog obroka, recepta i zalihe. U offline testu fetcher uvijek baca grešku i nije pozvan.
- `npm run typecheck`: prolazi.
- Stvarni `prisma migrate deploy` i CLI import: prolaze na privremenoj E2E bazi; uvezeno 4.748 zapisa.
- `npm run build`: **nije prošao u ovom sandboxu**; Turbopack nema pravo stvaranja Windows junctiona (`Access denied`). Pokušaj s `--webpack` također je blokiran `EPERM mkdir` u `.next`. To nije potvrda ispravnosti produkcijskog builda.
- `npm run test:e2e`: **nije izvršio browser scenarije**; migracije, import i stvaranje izoliranog računa prolaze, ali produkcijski poslužitelj staje jer nema uspješnog builda. Dodan je stvarni browser scenarij banana → pregled i potvrda → 120 g dnevnik, s provjerom 106,8 kcal i 1,31 g proteina, te mobilnim i tamnim administratorskim prikazom.
- Docker smoke: **nije izvršen**; Docker nije instaliran/dostupan, a `bash` vodi na WSL koji zahtijeva ažuriranje.
- Vizualni pregled desktop/mobile i light/dark te regresija kamere/OCR-a u pregledniku **još nisu potvrđeni**. Postojeći browser testovi su sačuvani i prilagođeni novoj opciji vanjskih izvora.

GitHub Actions već ima Linux i Windows poslove s buildom/E2E te Linux Docker smokeom. Njihovi stvarni rezultati moraju se pregledati prije spajanja. Faza 3.6 se **ne proglašava potpuno potvrđenom** dok build, browser testovi i Docker smoke ne prođu. Faza 4 nije započeta.
