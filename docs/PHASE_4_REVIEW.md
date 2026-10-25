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

- Lokalno prolazi svih 132 unit/integracijskih testova i TypeScript. Na Linuxu i Windowsu također prolaze 132 testa, produkcijski build, TypeScript, 20 Playwright testova i benchmark. Linux Docker smoke također prolazi.
- Dodano 17 unit/integracijskih testova: izračun, nepoznata vlakna, potvrda, idempotentnost, zastarjelost, izolacija kućanstava, autorstvo, arhiva, tvrda ograničenja, FEFO i kumulativni manjak, cijene, potvrđivanje i snimke, migracija starih podataka te mjerenje 500 recepata / 1000 serija.
- Dodan browser scenarij: unos i uređivanje recepta, dnevnik 1,5 porcija, cijena, generiranje, zamjena, 1,25 porcija, odobravanje, ponovno otvaranje i dokaz da zalihe ostaju iste.
- Browser scenarij spremio je snimke šest stranica na 375×812, 390×844, 768×1024 i 1440×900, u obje teme. Postojeća QA matrica ažurirana je da recepte i plan više ne tretira kao buduće module.
- Lokalni produkcijski build blokiran je Turbopack procesom unutar Windows sandboxa (`node process exited before we could connect`, CSS/manifest). Lokalni browser testovi zbog toga nisu izvršeni. Build i E2E stvarno su izvršeni na GitHub CI-ju; lokalni sandbox ne koristi se kao dokaz produkcijskog browser prolaza.
- Docker i fizički mobilni uređaj/ZimaOS nisu lokalno dostupni. Docker smoke pokreće Linux CI.

Provjereni kod: `3e9c0250b696bce94336fd8581f367722944b26b`. [CI 40205818180](https://github.com/fluxara-del/nutrihome/actions/runs/40205818180). Oba posla završila su uspješno. Naknadni commit uz izvještaj dodaje samo dokumentaciju i dokaze; provjereni aplikacijski kod ostaje isti.

### Dodatne provjere tijekom implementacije

- Zadržana je poruka potvrde cijene nakon osvježavanja podataka (Medium UX). Izvorni browser rezultat: CI `40204196279`; dodana regresijska provjera.
- Ispravljen je lokator novog E2E testa koji je relativnom `has` filtru pogrešno dodao roditeljski lokator (testna infrastruktura; nije greška aplikacije). Izvorni rezultat: CI `40204741158`, čekanje odabira recepta.
- Raspoloživost serija računa se jednom po proizvodu i slotu, umjesto za svakog kandidata i sastojak. Lokalna izolirana provjera čistog planerskog izračuna i izvještaja za 500 recepata × 50 sastojaka / 1000 serija: 325 ms za 21 slot, 526 ms za 84 slota. To nije mjerenje HTTP-a ni zapisivanja u bazu. Dokaz: `phase4-evidence/local-planner-performance.json`, ponovljivo s `npm run qa:performance`. Puni početni neoptimizirani benchmark zaustavljen je prije dovršetka jer je trajao predugo; nema dovršenog početnog rezultata za usporedbu.
- Plan sada čuva i upute te izvorne količine sastojaka uz nutritivne snimke, vidljive kroz „Snimljeni sastojci i upute”. Link na recept i dalje otvara aktualnu uređivu verziju.

## Rezultati vizualnog pregleda

Automatski je provjereno svih 48 kombinacija novih stranica (6 × 4 veličine × 2 teme),
uz postojeću QA matricu svih osnovnih stranica. Nema pomicanja cijelog dokumenta u
širinu. Tablica ciljeva namjerno ima vlastiti horizontalni okvir na mobitelu.
Ručno su pregledane reprezentativne snimke svih šest novih stranica, kroz obje teme
i sve četiri širine. Polja, potvrde, nutritivni izračuni i navigacija ostaju dostupni;
nije pronađeno preklapanje sadržaja. Dugi testni naziv autora prelama se unutar kartice.

Trajni primjeri:

- [Novi recept, 375, svijetla tema](phase4-evidence/375-light-new.png)
- [Detalj recepta, 390, tamna tema](phase4-evidence/390-dark-detail.png)
- [Uređivanje, 768, tamna tema](phase4-evidence/768-dark-edit.png)
- [Odobreni plan, 1440, svijetla tema](phase4-evidence/1440-light-approved-plan.png)
- [Metrike postojeće QA matrice](phase4-evidence/layout-metrics.json)
- [Linux planner: 322 ms za 21 obrok, 470 ms za 84](phase4-evidence/linux-planner-performance.json)

Puni skup snimki dostupan je u browser-results artefaktima navedenog CI-ja (privremeno
čuvanje 7 dana); gore navedene odabrane snimke ostaju u repozitoriju.

## Problemi pronađeni i popravljeni

| Kritičnost | Reprodukcija / nalaz | Dokaz i popravak | Ponovna provjera |
| --- | --- | --- | --- |
| High | 500 recepata s po 50 sastojaka i 1000 serija: ponovljeni prolaz kroz iste serije i parsiranje datuma za svakog kandidata | Početni čisti benchmark prekinut prije završetka; raspoloživost i bliski rok sada se računaju jednom po proizvodu i slotu | `qa:performance`, Linux 322/470 ms; test velikog skupa prolazi |
| Medium | Spremi cijenu: osvježavanje verzije odmah uklanja potvrdu uspjeha | CI 40204196279; stabilan identitet obrasca i zadržana poruka potvrde | Cijeli browser scenarij prolazi |
| Medium | Očisti cijenu pa pokušaj spremiti starim obrascem | Brisanje retka moglo bi vratiti početnu verziju; zadržava se null cijena i rastuća verzija | Regresijski test zastarjelog obrasca prolazi |
| Medium | Odobri plan, zatim promijeni upute recepta | Pregled izvornog koda: uz snimljene nutrijente treba sačuvati sastojke i upute, a poveznica vodi na aktualni recept | Test odobrenog plana zadržava stare upute; snimljeni sastojci/upute dostupni u planu |
| Low | Automatizacija ne pronalazi izbor recepta preko složenog relativnog lokatora i implicitne oznake | CI 40204741158 i 40205398203; imenovani obrasci, izričito pridružena oznaka izbora i jednostavni dostupni lokatori | Svih 20 browser testova prolazi na Linuxu i Windowsu |

Nema poznatih otvorenih Critical/High grešaka faze 4 nakon navedenih provjera.
Postojeći Low nalaz učitavanja svih serija prije paginacije zaliha iz QA faze 3.6
ostaje izvan ove isporuke. Fizička kamera, stvarni iOS/Android uređaj, PWA instalacija
i ZimaOS instalacija nisu provjereni. Prehrambena sigurnost oznaka i točnost unesenih
cijena ovise o korisničkoj provjeri, kako je prikazano u sučelju.

Windows CI završio je svih 20 browser testova za 1,6 min (Linux 57,2 s). Windows
benchmark čistog planera spremljen je u
[windows-planner-performance.json](phase4-evidence/windows-planner-performance.json).
Linux Docker log potvrđuje `recipe, plan, replay, approval and unchanged stock/logs`,
restart, očuvanje baze te dvije provjere spremljenog plana/snimki, uključujući proces
s `--network none`. Nijedan od tih testova nije radio nad stvarnom korisničkom bazom.
