# ZimaOS — faza 1

Ovaj je postupak za pregled i provjeru temelja. Stvarni ZimaOS host nije dostupan
u cloud okruženju; konačno produkcijsko odobrenje dolazi u 7. fazi.

1. Na ZimaOS hostu provjeriti `docker version` i `docker compose version`.
2. Kopirati checkout u trajni direktorij. Ne kopirati node_modules ili razvojnu bazu.
3. `cp .env.example .env`. Postaviti `APP_URL` na točan Tailscale HTTPS origin iz
   [Tailscale vodiča](TAILSCALE.md). DATABASE_URL za kontejner već je u Composeu.
4. `docker compose up --build -d --wait`. Migracije se primjenjuju prije pokretanja
   aplikacije; kvar migracije zaustavlja startup. Health provjerava i tablicu korisnika.
5. `docker compose exec app ./node_modules/.bin/tsx scripts/create-owner.ts vlasnik`.
   Unijeti vlastitu lozinku u interaktivni terminal. Ne postoji zadana lozinka.
6. Provjeriti prijavu preko privatnog HTTPS-a, odjavu i zabranu pristupa bez sesije.
7. Provjeriti `docker compose ps`; status treba biti healthy. Ne dijeliti pune logove
   ako sadrže osobne podatke iz budućih modula.

Volume `nutrihome-data` sadrži bazu i buduće uploade; `nutrihome-backups` sadrži kopije.
App radi kao UID/GID 1000. Kod zamjene volumea bind mountom potrebno je pripremiti
vlasništvo tog direktorija za UID/GID 1000; ne koristiti chmod 777.
Nemoj pokrenuti više app instanci nad istom bazom ili pohraniti SQLite na mrežni disk.
Port je vezan samo na loopback hosta, bez javnog izlaganja i bez automatskog LAN pristupa.
Za LAN koristi privatni HTTPS proxy/Tailscale na klijentu. Otvaranje 0.0.0.0 nije zadano.

## Nadogradnja bez gubitka podataka

1. Napraviti i izvesti [provjerenu sigurnosnu kopiju](BACKUP_RESTORE.md).
2. Zabilježiti oznaku postojeće image verzije i kopirati `.env` na sigurno mjesto.
3. Ažurirati source; `docker compose build`.
4. `docker compose stop app`, zatim `docker compose up -d --wait`; migracija mora završiti uspješno.
   Ne pokretati Prisma migracije kroz `exec` dok aplikacija ima otvorenu SQLite vezu.
5. Provjeriti health, prijavu i očekivano postojeće podatke.

Ne koristiti `docker compose down -v`, `prisma db push`, reset migracija ili brisanje
baze za produkcijske nadogradnje. Prije nekompatibilne migracije trebaju plan i kopija;
vraćanje stare image verzije samo po sebi ne poništava promjenu sheme.
