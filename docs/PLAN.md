# Plan implementacije

| Faza | Isporuka | Uvjet provjere |
| --- | --- | --- |
| 1 — temelj (dovršeno) | Arhitektura, puni početni model, migracija, vlasnik/sesije, hrvatski kostur, PWA temelj, Docker i backup | Testovi domenskih temelja i ograničenja baze; HTTP i browser prijava/odjava; build; Docker smoke |
| 2 — zalihe (dovršeno) | CRUD proizvoda/serija, FEFO, audit transakcije, pretraživanje i upozorenja | Negativne zalihe, istodobnost, dvostruko knjiženje i rokovi |
| 3 — dnevnik (dovršeno) | Hrana/recept u dnevniku, izmjena/brisanje, ciljevi, težina i 7/30-dnevni trendovi | Snapshot nutrijenata, sirovo/kuhano, autorizacija i prosjeci |
| 4 — recepti i plan | Recepti, porcije, deterministički planer, zamjena i odobravanje | Prehrambena ograničenja, ciljevi i provjerljiv izvještaj budžeta |
| 5 — kupnja i raspored | Agregacija, kupnja → serije, nedjeljni nacrt i ručni gumb | Manjkovi, isteci, idempotentnost, DST i restart joba |
| 6 — AI (opcionalno) | Recepti, zamjene i etikete, potvrda i troškovni limiti | Schema validacija, odbijanje nevaljanih podataka, nema samostalnih mutacija |
| 7 — produkcijsko očvršćivanje | ZimaOS/Tailscale verifikacija, povrat kopije, PWA uređaji, sigurnosna revizija | Stvarna instalacija, restore drill, HTTPS, CSP i pregled pristupa |

Svaka faza je zasebna pregledljiva isporuka s testovima i opisom nedovršenog rada.
Veće promjene arhitekture zahtijevaju odobrenje prije implementacije.
Početna shema priprema kasnije module; postojanje tablice ne znači gotovu funkciju.
