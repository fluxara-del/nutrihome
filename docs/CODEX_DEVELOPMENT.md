# Razvoj i testiranje u Codex okruženju

Izvorni kod nalazi se u privatnom repozitoriju
<https://github.com/fluxara-del/nutrihome>, na grani `main`.
U ovom okruženju radna mapa je `/workspace/nutrihome`.
Push na GitHub sprema kod; ne objavljuje aplikaciju na internetu.

## Automatska provjera

U Codex zadatku odaberi ovaj repozitorij i zatraži pokretanje ovih naredbi.
Ako klijent prikazuje terminal, iste naredbe možeš pokrenuti sam:

```bash
cd /workspace/nutrihome
export npm_config_cache=/tmp/nutrihome-npm-cache
export NEXT_TELEMETRY_DISABLED=1
npm ci
npm test
npm run build
npm run typecheck
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Zadnja naredba vrijedi za ovo okruženje s instaliranim Chromiumom.
U drugom okruženju prvo pokreni `npx playwright install --with-deps chromium`,
a zatim `npm run test:e2e` bez varijable za sistemski Chromium.
E2E testovi pokreću zaseban poslužitelj na portu 3107, stvaraju privremenu bazu
i nasumičan testni račun te provjeravaju aplikaciju stvarnim preglednikom.
Ne trebaju tvoju lozinku i ne koriste osobnu bazu.

## Ručno korištenje

Ovaj onboarding chat nema korisnički web pregled aplikacije niti vezu do terminala.
Adresa unutar cloud stroja nije javna poveznica koju možeš otvoriti na svom računalu.
Codex ovdje može pokretati testove i interne HTTP provjere; GitHub također ne pokreće
Next.js aplikaciju samim spremanjem koda.

Za ručno klikanje treba klijent s izričito dostupnim privatnim pregledom portova
ili privatna instalacija na vlastitom računalu/ZimaOS-u. U klijentu koji nudi takav
pregled koristi port 3000 i postavi `APP_URL` u lokalnom `.env` na točan origin koji
taj klijent prikaže. Dostupnost takvog pregleda ovisi o klijentu; ovaj chat ga ne pruža.

U stvarnom terminalu na računalu na kojem ćeš pokrenuti aplikaciju:

```bash
# Nakon npm ci; postojeći .env i bazu sačuvaj.
test -f .env || cp .env.example .env
npm run db:generate
# Ako baza već sadrži podatke: napravi backup i zaustavi aplikaciju prije migracije.
npm run db:migrate
# Samo prvi put; unos lozinke je skriven, postojeći vlasnik se ne prepisuje.
npm run owner:create -- vlasnik
npm run dev
```

Nemoj upisivati stvarnu lozinku u chat, commit ili `.env.example`.
Lokalno je aplikacija dostupna na portu 3000. Upute za privatnu instalaciju nalaze
se u [ZimaOS vodiču](ZIMAOS.md) i [Tailscale vodiču](TAILSCALE.md).
Nema automatske javne objave niti zadanog korisničkog računa.
