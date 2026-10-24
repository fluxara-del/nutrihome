# Sigurnosna kopija i povrat

Baza sadrži osjetljive podatke i sesije. Kopije čuvati šifrirano, uz ograničen pristup,
i redovito ih izvoziti s istog diska/poslužitelja. Sam Docker volume nije sigurnosna kopija.

## Kopija aktivne baze

```bash
# Lokalno: npm run backup -- ./backups
# Docker:
docker compose exec -T app ./node_modules/.bin/tsx scripts/backup.ts /app/backups
```

Alat koristi SQLite backup API, a ne kopiranje otvorenog `.db` filea. Provjerava
`integrity_check` i `foreign_key_check`, postavlja 0600 prava i ispisuje putanju kopije.
Preuzeti baš ispisanu datoteku pomoću `docker compose cp app:/app/backups/IME.db ./`.
Puni budući backup mora uključiti i `/app/data/uploads` kada uploadi budu implementirani.
Nema automatskog rasporeda kopija u fazi 1; postaviti ga na hostu nakon restore provjere.

## Povrat (potrebna je provjerena kopija)

1. Zaustaviti aplikaciju: `docker compose stop app`.
2. Sačuvati trenutni volume i image verziju; povrat ne smije prepisati jedinu kopiju.
3. Pokrenuti servisni kontejner bez aplikacije:
   `docker compose run --rm --no-deps --user 0 --entrypoint sh app`.
   U njemu je `/app/data` isti trajni volume. Kopiju uvesti u `/app/backups` prije toga
   (`docker compose cp ./IME.db app:/app/backups/IME.db` radi i za zaustavljeni kontejner).
4. U servisnom kontejneru sačuvati postojeći DB/WAL/SHM na drugo sigurno mjesto. Kopirati
   odabranu kopiju u `/app/data/nutrihome.db`; ukloniti zastarjele `nutrihome.db-wal` i
   `nutrihome.db-shm` samo nakon što su sačuvani i svi pisci zaustavljeni. Postaviti `chown 1000:1000 /app/data/nutrihome.db` i `chmod 600 /app/data/nutrihome.db`.
   Administrativni helper radi kao root samo tijekom povrata; aplikacija ostaje korisnik node.
5. Provjeriti kopiju u servisnom kontejneru:

   ```bash
   node -e 'const S=require("better-sqlite3");const d=new S("/app/data/nutrihome.db");if(d.pragma("integrity_check",{simple:true})!=="ok"||d.pragma("foreign_key_check").length)process.exit(1);d.exec("DELETE FROM Session; DELETE FROM LoginThrottle");d.close()'
   ```

   Opoziv sesija traži ponovnu prijavu nakon povrata.
6. Pokrenuti verziju kompatibilnu sa shemom kopije: `docker compose up -d --wait`.
   Startup primjenjuje samo pripremljene migracije. Provjeriti prijavu i očekivane podatke.

Prvo uvježbati povrat u zaseban Compose projekt/volume. Ne provjeravati povrat
prepisivanjem jedine osobne baze. Zabilježiti datum i rezultat restore probe.
