# Faza 4 — recepti i sedmodnevni plan

Razvojna grana: `phase-4-recipes-meal-planner`, cilj PR-a: `phase-3-6-local-food-db`.
Korisnička baza nije otvorena, resetirana ni migrirana tijekom implementacije.

## Implementirano

- `/recepti`: pretraga, filtriranje oznaka, paginacija, arhiva; novi recept, detalj i uređivanje.
- Sastojci iz osobnog kataloga: početnih 200 proizvoda i lokalna pretraga s paginacijom. Nema vanjskih mrežnih poziva za odabir sastojka.
- Precizne mase do 0,001 g i porcije do 0,001; izračun svih nutrijenata po porciji; nepoznata vlakna ostaju nepoznata. Sirovo/kuhano je izričito označeno.
- Prijenos recepta u postojeći dnevnik. Kasnije uređivanje recepta ne mijenja povijesni unos.
- `/plan`: ručno generiranje sedam dana prema potvrđenim osobnim ciljevima, 1–12 dnevnih obroka, zamjena recepta, promjena porcije i ponovno predlaganje pojedinog obroka.
- Provjera kalorija (±10 %), proteina, prehrambenih ograničenja i isključenih pojmova; neprovjerljivi uvjeti nisu prešutno zanemareni.
- Pregled manjka nakon zaliha upotrebljivih na planirani dan, bez dvostrukog korištenja iste serije. To nije popis kupnje faze 5.
- `/plan/cijene`: ručno potvrđene procjene €/kg, bez izmišljanja cijena. Prazna cijena znači nepoznato, ne nulu. Procjena dodatnog troška ne uključuje pakiranja.
- Odobrenje uz prihvaćanje prikazanih upozorenja; snimljeni izvještaj, provjera zastarjelosti, ponovno otvaranje nacrta, autor i optimističke verzije.
- Kontrolirana migracija dodaje podatke i proširuje oznake uz očuvanje starih recepata i planova. Stari planovi bez autora/snimke ne preuzimaju se automatski i ne brišu se.

## Granice

Planner daje deterministički prijedlog, ne jamstvo optimalnog plana ili postizanja
ciljeva. Ako nema izvedivog recepta za tvrda ograničenja, prikazuje grešku. Prehrambene
sigurnosne oznake potvrđuje korisnik; aplikacija ne zna puni sastav proizvoda ni alergene.
Plan koristi osobne ciljeve autora, ne zbroj ciljeva svih članova kućanstva. Planove
kućanstva svi članovi mogu vidjeti, ali mijenja i odobrava ih samo autor.

Nema automatske potrošnje zaliha, upisa dnevnika, rezervacije zaliha, kupnje,
nedjeljnog rasporeda ili AI-ja. Odobreni izvještaj opisuje stanje pri odobrenju,
a ne buduću rezervaciju. Nema korisničkog brisanja povijesnih recepata ili planova.

## Provjera

- Lokalni TypeScript prolazi. Svih 131 testova prošlo je prije posljednjeg dodavanja regeneracije obroka; posljednjih 16 domenskih testova zasebno prolazi (ukupno 132 s migracijom i postojećom regresijom).
- Dodano 17 unit/integracijskih testova: izračun, nepoznata vlakna, potvrda, idempotentnost, zastarjelost, izolacija kućanstava, autorstvo, arhiva, tvrda ograničenja, FEFO i kumulativni manjak, cijene, potvrđivanje i snimke, migracija starih podataka te mjerenje 500 recepata / 1000 serija.
- Dodan browser scenarij: unos i uređivanje recepta, dnevnik 1,5 porcija, cijena, generiranje, zamjena, 1,25 porcija, odobravanje, ponovno otvaranje i dokaz da zalihe ostaju iste.
- Browser scenarij sprema snimke šest stranica na 375×812, 390×844, 768×1024 i 1440×900, u obje teme. Postojeća QA matrica ažurirana je da recepte i plan više ne tretira kao buduće module.
- Lokalni produkcijski build blokiran je Turbopack procesom unutar Windows sandboxa (`node process exited before we could connect`, CSS/manifest). Lokalni browser testovi zbog toga nisu izvršeni. Build i E2E provjeravaju se na GitHub CI-ju; rezultati još nisu potvrđeni u ovoj verziji izvještaja.
- Docker i fizički mobilni uređaj/ZimaOS nisu lokalno dostupni. Docker smoke pokreće Linux CI.

Konačni rezultati CI-ja i vizualnog pregleda dopunjuju se prije označavanja PR-a spremnim za pregled.

### Dodatne provjere tijekom implementacije

- Zadržana je poruka potvrde cijene nakon osvježavanja podataka (Medium UX). Izvorni browser rezultat: CI `40204196279`; dodana regresijska provjera.
- Ispravljen je lokator novog E2E testa koji je relativnom `has` filtru pogrešno dodao roditeljski lokator (testna infrastruktura; nije greška aplikacije). Izvorni rezultat: CI `40204741158`, čekanje odabira recepta.
- Raspoloživost serija računa se jednom po proizvodu i slotu, umjesto za svakog kandidata i sastojak. Lokalna izolirana provjera čistog planerskog izračuna i izvještaja za 500 recepata × 50 sastojaka / 1000 serija: 325 ms za 21 slot, 526 ms za 84 slota. To nije mjerenje HTTP-a ni zapisivanja u bazu. Dokaz: `phase4-evidence/local-planner-performance.json`, ponovljivo s `npm run qa:performance`. Puni početni neoptimizirani benchmark zaustavljen je prije dovršetka jer je trajao predugo; nema dovršenog početnog rezultata za usporedbu.
- Plan sada čuva i upute te izvorne količine sastojaka uz nutritivne snimke, vidljive kroz „Snimljeni sastojci i upute”. Link na recept i dalje otvara aktualnu uređivu verziju.
