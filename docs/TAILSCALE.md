# Privatni udaljeni pristup

Tailscale instalirati/pokrenuti na ZimaOS hostu prema aktualnim službenim uputama,
ne unutar aplikacijskog kontejnera. Potreban je aktivan tailnet, MagicDNS i HTTPS
certifikati uključeni u Tailscale administraciji. Nikakav auth key se ne sprema u repo.

```bash
sudo tailscale serve --bg http://127.0.0.1:3000
sudo tailscale serve status
```

Upotrijebiti stvarni HTTPS URL prikazan u statusu kao `APP_URL` u `.env`, pa pokrenuti
`docker compose up -d --force-recreate --wait`. Ako se mijenja host port pomoću
NUTRIHOME_PORT, isti port mora biti u `tailscale serve` naredbi. Kolačić sesije je
Secure na HTTPS-u. Obavezna je i vlastita aplikacijska prijava.

Provjeriti tailnet ACL pravila: pristup trebaju imati samo tvoji odabrani korisnici i
uređaji. **Ne koristiti Tailscale Funnel**, javni reverse proxy ili router port forwarding.
Testirati pristup s Androida i desktopa unutar tailneta te odbijanje uređaja bez pristupa.

Za Android/desktop PWA: u podržanom pregledniku otvoriti HTTPS aplikaciju i odabrati
instalaciju aplikacije. Manifest, PNG ikone i service worker su dio faze 1; stvarnu
instalaciju na uređajima treba ručno provjeriti. Offline način prikazuje javnu poruku,
ne osobne podatke. Tailscale postavke i stvarni HTTPS certifikat nisu provjerljivi iz
ove cloud sesije; uspjeh lokalnog HTTP testa nije potvrda udaljenog pristupa.
