# NutriHome — arhitektura (faze 1–3)

## Opseg i odluke

Privatna aplikacija za jedno kućanstvo. Modularni monolit: Next.js App Router,
React, TypeScript, Tailwind i shadcn/ui obrasci komponenti; Prisma 7 sa SQLiteom
putem better-sqlite3 adaptera. Node 24 LTS. Jedan aplikacijski proces i trajni
podatkovni direktorij na lokalnom disku. SQLite nije za mrežni/NFS disk.
Tailscale Serve završava HTTPS; aplikacija ima vlastitu prijavu.

Faze 1–3 isporučuju temelj, zalihe, osobni dnevnik i praćenje težine. Ostali moduli još nisu gotovi. Sučelje prikazuje
stvarne podatke i izričito navodi nedovršene module. Nema lažnih obroka, trendova,
AI procjena ili oznake da su ciljevi ostvareni.

## Granice modula

- Identitet: CLI stvara jednog vlasnika, nema javne registracije. Buduće članove
  povezuje Household; svako čitanje osobnih podataka filtrira householdId/userId.
- Katalog i zalihe: proizvod, serija i nepromjenjivi dnevnik transakcija. Promjena
  količine i dnevnik čine jednu SQLite transakciju; FEFO, zabrana negativne
  zalihe i jedinstveni sourceReference sprječavaju ponovljeno knjiženje.
- Prehrana: unos sadrži snimku izračunatih nutrijenata, izvor i stanje raw/cooked.
  Izmjena kataloga neće retroaktivno mijenjati dnevnik. Kuhano zahtijeva vlastite
  provjerene podatke ili potvrđen faktor prinosa; nema pretpostavljene pretvorbe.
- Recepti: sastojci u gramima, izračun po porciji. Oznake normalizirane zasebnom
  tablicom; ograničenja i preferencije spremaju se kao validirani JSON nizovi.
- Planiranje: jedinstven (householdId, weekStart); nacrt → odobreno. Planiranje
  nikad ne mijenja zalihe. Manjak se agregira po proizvodu prije oduzimanja zaliha.
- Automatizacija: zaseban Node proces u budućoj fazi, koristi iste domenske
  funkcije kao ručni gumb. Lokalni kalendar Europe/Zagreb, nedjelja ujutro,
  jedinstven tjedni ključ i transakcija; ne koristiti fiksni UTC cron zbog DST-a.
- AI: opcionalni budući serverski modul s validacijom, dnevnim limitima i potvrdom.
  Bez ključa svi deterministički moduli moraju raditi.

## Preciznost i podaci

SQLite nema pouzdanu fiksnu decimalnu aritmetiku. Količine su cijeli brojevi:
`quantityMg`/`quantityGramsMilli` = tisućinke grama, `quantityMlMilli` = tisućinke ml,
`servingsMilli` = tisućinke porcije, nutrijenti = stotinke g/kcal,
novac = eurocenti, težina = grami. JS računa uz BigInt posredne vrijednosti i
zaokružuje tek na granici. Broj komada zahtijeva potvrđenu masu komada; ml zahtijeva
gustoću. Nije dopušteno automatski smatrati da 1 ml = 1 g.
`date`, `expirationDate` i `weekStart` su kalendarski ISO YYYY-MM-DD u Zagrebu;
vremenske oznake su UTC. Potrošnja je jedan proizvod ili recept, nikad oba.

CLI i adapter koriste istu apsolutnu putanju baze. Priprema stvara datoteku s pravima
0600, uključuje WAL i ne mijenja postojeću shemu; time izbjegava i Prisma 7.10
pogrešku parsiranja poruke za nepostojeću SQLite bazu.

Migracija dodaje CHECK ograničenja uz Prisma strane ključeve, indekse i unique
ključeve. Aplikacija mora validirati ulaz i vlasništvo prije svake mutacije.
Buduće migracije moraju sačuvati podatke; bez `db push` na produkciji.

## Sigurnost temelja

Lozinke: scrypt s nasumičnom soli; sesije: 256-bitni nasumični tokeni, u bazi samo
SHA-256 sažetak, apsolutni rok 7 dana, HttpOnly/SameSite=Strict i Secure na HTTPS-u.
Next server actions provjeravaju Origin, a aplikacija dodatno uspoređuje s APP_URL.
Prijava ima trajni globalni limit pokušaja (jedan vlasnik), generičke poruke pogreške
i zaštitu od usporednog ažuriranja brojača. Nema povjerenja u X-Forwarded-For.
APP_URL je obavezna u produkciji. Sve stranice s podacima zahtijevaju sesiju.
Health endpoint vraća samo stanje, bez detalja baze ili korisnika.

PWA service worker sprema samo javnu offline stranicu. Ne sprema odgovore s osobnim
podacima. CSP još dopušta inline skripte/eval za Next razvojni/runtime način;
nonce-based CSP je stavka produkcijskog očvršćivanja, ne potpuna XSS zaštita.
Uploadi i AI endpointi ne postoje u fazi 1.

## Deployment i ograničenja

Compose objavljuje port samo na 127.0.0.1. Tailscale Serve na ZimaOS hostu služi
privatni HTTPS, uz tailnet ACL. Ne koristiti Funnel. Docker nema pristup socketu
iz aplikacije. Kontejner nije root; baza i budući uploadi su u `/app/data`.
Migracija se izvršava prije aplikacije, uz jednu instancu i obaveznu sigurnosnu
kopiju prije nadogradnje. Online backup koristi SQLite backup API i integrity_check;
restore se radi dok je aplikacija zaustavljena.

Produkcijska spremnost traži dovršavanje modula, provjeru stvarnog ZimaOS hosta,
Tailscale HTTPS-a, instalacije PWA-a i zasebnu sigurnosnu reviziju. Faza 1 to ne tvrdi.

## Faza 2: provedena pravila zaliha

`inventory-data.ts` je serverska granica za čitanje: uzima stvarnog prijavljenog
korisnika, a `inventory.ts` za svaki postupak provjerava članstvo u kućanstvu.
Server Actions dodatno provjeravaju Origin, sesiju i validiraju ulaz; klijent nikad
ne određuje householdId ili identitet zapisničara. UI prima samo potrebna polja.

`InventoryOperation` je nepromjenjivi zapis potvrđenog zahtjeva s korisnikom,
SHA-256 otiskom normaliziranog sadržaja i jedinstvenim ključem po kućanstvu.
`InventoryTransaction.operationId` povezuje promjene pojedinih serija; stari zapisi
ostaju valjani s NULL vezom. Ponovljen jednak zahtjev vraća prethodni rezultat,
a isti ključ s drugim sadržajem se odbija. Neuspjeh bilo kojeg knjiženja vraća i
količine i operaciju na prethodno stanje.

`InventoryBatch.version` povećava se pri promjeni količine ili podataka. Zastarjeli
ispravak se odbija. Potrošnja koristi uvjetnu promjenu količine/verzije i ograničeno
ponavljanje cijele transakcije pri SQLite sukobu. Adapter mapira SQLITE_BUSY u Prisma
P1008; ponavljanje zadržava isti ključ i ne oslabljuje provjeru dostupne količine.

Potrošnja koristi samo serije koje nisu istekle, najbliži poznati rok prvi, zatim
serije bez roka po vremenu nastanka. Dan isteka još je upotrebljiv u kalendaru Zagreba.
Istekle serije mogu se eksplicitno otpisati ispravkom na 0 uz razlog. Nema fizičkog
brisanja serija ili povijesti; nekorišteni proizvod bez veza smije se izbrisati.
Promjena pretvorbenog faktora proizvoda ne preračunava postojeće mase u bazi.

Katalog se za privatno kućanstvo filtrira na serveru (uključujući hrvatske dijakritike)
i prikazuje po 20 proizvoda; povijest operacija ima 20 zapisa po stranici. Filtri mjesta
odabiru proizvode prisutne na tom mjestu; brojke po proizvodu jasno prikazuju sva mjesta.
Prag male zalihe odnosi se samo na upotrebljivu količinu; 0 isključuje to upozorenje.

## Faza 3: osobna prehrana i trendovi

Dnevnik, težina i postavke filtriraju se po stvarnom userId, uključujući korisnike
istog kućanstva. Katalog i recepti ostaju zajednički unutar kućanstva. `nutrition-data.ts`
provjerava sesiju i vraća podatke za prikaz; Server Actions zasebno provjeravaju Origin,
sesiju i vlasništvo. Nema render-side mutacija, automatskog stvaranja ciljeva ili slanja
osobnih podataka vanjskim servisima.

Svaki FoodLog sprema izvorni naziv, nutritivnu kopiju, unesenu jedinicu/količinu,
izračunate cjelobrojne nutrijente i korišteni omjer mase. Izmjena količine ili datuma
koristi kopiju, a ne sadašnji katalog/recept. Recept se računa iz zbroja umnožaka
sastojaka i omjera porcija s BigInt posrednim vrijednostima; zaokruživanje je tek na
konačnoj granici. Stari unosi bez pune kopije ostaju sačuvani, a pri uređivanju se
proporcionalno skaliraju iz prethodno spremljenih nutrijenata i označavaju procjenom.

Stanje proizvoda definira bazu nutritivnih podataka i mase u zalihi. Aktivna zaliha
sprječava tihu promjenu sirovo/kuhano. Za drugu pripremu koristi se drugi proizvod.
Omjer kuhane/sirove mase mora biti korisnički potvrđen i vrijedi samo za g/kg; gustoća
i masa komada ne prenose se u drugo stanje. Takav je nutritivni preračun označen kao
procjena jer omjer mase ne mjeri gubitke nutrijenata pri pripremi.

`NutritionRequest` pamti ključ, vrstu, otisak sadržaja i cilj mutacije, bez kopije
osobnih vrijednosti. Isti zahtjev nije moguće ponoviti niti oživjeti izbrisani unos
ponavljanjem starog zahtjeva. Verzije zapisa sprječavaju zastarjele izmjene i brisanja.

Potrošnja uz novi dnevnik je zadana isključena i traži zasebnu potvrdu. Prehrambeni
zapis, sve promjene zaliha i oba dnevnika operacija čine jednu SQLite transakciju.
Neuspjeh bilo kojeg sastojka ili završnog FoodLog unosa vraća sve promjene. Izmjena i
brisanje prehrambenog zapisa nikada automatski ne troše niti vraćaju zalihu; sučelje
izričito upućuje na zaseban auditirani ispravak u Zalihama. Provjera rokova koristi
aktualni dan i trenutno stanje inventara, čak i kod starijeg prehrambenog datuma.

Jedno mjerenje težine dopušteno je po korisniku i datumu. Datumi stvarne prehrane i
težine ne mogu biti u budućnosti. Ciljevi su isključivo korisnički odabrani i potvrđeni;
prikaz starijih dana uspoređuje se s trenutačnim ciljevima, ne s izmišljenim povijesnim
ciljem. Podaci o preferencijama i budžetu zasad se samo spremaju za budući planer.

Trendovi koriste lokalne kalendarske datume Zagreba. Prosjeci prehrane obuhvaćaju samo
dane s zapisima i prikazuju broj tih dana; bez zapisa nije isto što i stvarni unos 0.
Težina se prikazuje za 7 ili 30 dana, s pomičnim prosjekom dostupnih mjerenja u posljednjih
7 kalendarskih dana. Čitanje uključuje dodatnih 6 ranijih dana za točan prosjek prvih
vidljivih točaka. Graf povezuje stvarna mjerenja i ne stvara vrijednosti za prazne dane.
