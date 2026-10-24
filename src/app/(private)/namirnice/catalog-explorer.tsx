"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { emptyDraft, sourceLabels, basisLabels, type FoodDraft } from "@/lib/food-draft";
import { catalogAction } from "./actions";
function ProductLinks({ id }: { id: string }) {
  return <div className="catalog-actions"><Link href={`/zalihe/${id}`}>Otvori proizvod</Link><Link href={`/zalihe/${id}#nova-serija`}>Dodaj u zalihe</Link><Link href={`/dnevnik?product=${encodeURIComponent(id)}`}>Dodaj u dnevnik prehrane</Link></div>;
}
function ReviewForm({ initial, requestKey }: { initial: FoodDraft; requestKey: string }) {
  const [draft, setDraft] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [densityConfirmed, setDensityConfirmed] = useState(false);
  const [state, action, pending] = useActionState(catalogAction, {});
  function change(key: keyof FoodDraft, value: string) { setDraft(old => ({ ...old, [key]: value })); setConfirmed(false); if (["basis", "servingUnit"].includes(key)) setDensityConfirmed(false); }
  const input = (key: "name" | "brand" | "barcode" | "calories" | "protein" | "carbs" | "fat" | "fiber" | "servingQuantity" | "packageQuantity" | "reference", label: string, required = false, numeric = false) => <div><label htmlFor={`review-${key}`}>{label}</label><input id={`review-${key}`} name={key} value={draft[key]} onChange={e => change(key, e.target.value)} required={required} maxLength={numeric ? 24 : key === "name" ? 120 : 100} inputMode={numeric ? "decimal" : key === "barcode" ? "numeric" : undefined}/></div>;
  if (state.productId) return <section className="card mt-6" aria-label="Spremljeni proizvod"><h2>Spremljeno u katalog</h2><p role="status">Proizvod je spremljen. Zalihe i dnevnik nisu promijenjeni.</p><ProductLinks id={state.productId}/><p className="muted text-sm">Količinu, mjesto čuvanja i unos prehrane potvrđuješ zasebno.</p></section>;
  return <section className="card mt-6"><h2>Provjeri podatke</h2><p className="muted">Prazno znači nepoznato. Energija, bjelančevine, ugljikohidrati i masti moraju biti potvrđeni prije spremanja.</p>{draft.warnings.map((warning, i) => <p className="notice text-sm mt-3" key={i}>{warning}</p>)}
    <form action={action} onReset={event => event.preventDefault()} aria-label="Provjera namirnice">
      <input type="hidden" name="requestKey" value={requestKey}/>
      <div className="form-grid">{input("name", "Naziv proizvoda", true)}{input("brand", "Proizvođač / marka")}{input("barcode", "Barkod")}
        <div><label htmlFor="review-category">Kategorija</label><input id="review-category" name="category" defaultValue={draft.category ?? ""} maxLength={60} required placeholder="Npr. Mliječni proizvodi" onChange={() => setConfirmed(false)}/></div>
        <div><label htmlFor="review-basis">Osnova nutritivnih vrijednosti</label><select id="review-basis" name="basis" value={draft.basis} onChange={e => change("basis", e.target.value)}>{Object.entries(basisLabels).map(([value, label]) => <option key={value} value={value} disabled={value === "UNKNOWN"}>{label}</option>)}</select></div>
        <div><label htmlFor="review-state">Stanje proizvoda</label><select id="review-state" name="nutritionState" defaultValue={draft.preparation && ["COOKED", "ROASTED"].includes(draft.preparation) ? "COOKED" : "RAW"} onChange={() => setConfirmed(false)}><option value="RAW">Sirovo</option><option value="COOKED">Kuhano / pripremljeno</option></select></div>
        {input("calories", "Energija (kcal)", true, true)}{input("protein", "Bjelančevine (g)", true, true)}{input("carbs", "Ugljikohidrati (g)", true, true)}{input("fat", "Masti (g)", true, true)}{input("fiber", "Vlakna (g, neobavezno)", false, true)}
      </div>
      <p className="muted text-sm mt-3">Sve unesene vrijednosti odnose se na odabranu osnovu. Nepoznata vlakna ostaju označena kao nepoznata; nutritivni rezultat označava se procjenom.</p>
      <div className="form-grid">{input("servingQuantity", "Masa ili volumen jedne porcije", draft.basis === "PER_SERVING", true)}<div><label htmlFor="review-servingUnit">Jedinica porcije</label><select id="review-servingUnit" name="servingUnit" value={draft.servingUnit} onChange={e => change("servingUnit", e.target.value)}><option value="G">g</option><option value="ML">ml</option></select></div><div><label htmlFor="review-density">Gustoća (g/ml, za podatke na ml)</label><input id="review-density" name="density" inputMode="decimal" maxLength={24} onChange={() => { setDensityConfirmed(false); setConfirmed(false); }}/></div></div>
      <label className="checkbox-label"><input type="checkbox" name="densityConfirmed" checked={densityConfirmed} onChange={e => { setDensityConfirmed(e.target.checked); setConfirmed(false); }}/>Potvrđujem gustoću izmjerenu ili navedenu za ovaj proizvod</label>
      <p className="muted text-sm">Katalog računa na 100 g. Za 100 ml ili ml porcije potrebna je potvrđena gustoća; masa porcije u g mora biti poznata. Pretpostavka 1 ml = 1 g nije dopuštena.</p>
      <div className="form-grid">{input("packageQuantity", "Neto količina pakiranja", false, true)}<div><label htmlFor="review-packageUnit">Jedinica pakiranja</label><select id="review-packageUnit" name="packageUnit" value={draft.packageUnit} onChange={e => change("packageUnit", e.target.value)}>{["G", "KG", "ML", "L"].map(u => <option key={u} value={u}>{u.toLowerCase()}</option>)}</select></div>
        <div><label htmlFor="review-source">Izvor podataka</label><select id="review-source" name="source" value={draft.source} onChange={e => change("source", e.target.value)}>{Object.entries(sourceLabels).filter(([key]) => key !== "LOCAL").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{input("reference", "Oznaka izvora (barkod ili FDC ID)")}</div>
      <label className="checkbox-label"><input type="checkbox" name="estimatedNutrition" defaultChecked={draft.source === "OCR" || !draft.fiber} onChange={() => setConfirmed(false)}/>Vrijednosti su procijenjene</label>
      <label className="checkbox-label"><input type="checkbox" name="confirmed" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Provjerio/la sam podatke i potvrđujem spremanje u katalog</label>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <Button type="submit" disabled={pending || draft.basis === "UNKNOWN"} className="mt-3">{pending ? "Spremanje…" : "Spremi u katalog"}</Button>
      <p className="muted text-sm mt-3">Spremanje ne dodaje zalihu niti obrok. Postojeći proizvodi se ne prepisuju.</p>
    </form>
  </section>;
}
export function CatalogExplorer({ requestKey }: { requestKey: string }) {
  const [query, setQuery] = useState(""); const [barcode, setBarcode] = useState(false);
  const [localOnly, setLocalOnly] = useState(true);
  const [page, setPage] = useState(0); const [hasMore, setHasMore] = useState(false);
  const [scanner, setScanner] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [warnings, setWarnings] = useState<string[]>([]);
  const [results, setResults] = useState<FoodDraft[]>([]); const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<FoodDraft | null>(null); const [key, setKey] = useState(requestKey);
  const [ocrText, setOcrText] = useState(""); const [preview, setPreview] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choose(draft: FoodDraft) { setSelected(draft); setKey(crypto.randomUUID()); }
  async function search(value = query, isBarcode = barcode, nextPage = 0) {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setSelected(null); setWarnings([]); setResults([]); setSearched(false);
    try {
      const response = await fetch(`/api/food-search?${new URLSearchParams({ q: value, barcode: isBarcode ? "1" : "0", local: localOnly ? "1" : "0", external: localOnly ? "0" : "1", page: String(nextPage) })}`, { signal: current.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setPage(nextPage); setHasMore(!!data.hasMore); setResults(data.results); setWarnings(data.warnings); setSearched(true);
    } catch (cause) { if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "Pretraga nije uspjela."); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Odaberi JPEG, PNG ili WebP do 5 MB. HEIC pretvori u JPEG."); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setPreview(URL.createObjectURL(file)); setBusy(true); setError(""); setSelected(null); setOcrText("");
    try {
      const response = await fetch("/api/label-ocr", { method: "POST", headers: { "Content-Type": file.type }, body: file, signal: current.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      choose(data.draft); setOcrText(data.text);
    } catch (cause) { if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "Etiketa nije obrađena."); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <>
    <section className="card"><h2>Pronađi namirnicu</h2><form aria-label="Pretraživanje namirnica" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label htmlFor="catalog-query">Naziv ili barkod</label><input id="catalog-query" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} minLength={2} required placeholder="Npr. zobene pahuljice ili EAN barkod"/>
      <label className="checkbox-label"><input type="checkbox" checked={barcode} onChange={e => setBarcode(e.target.checked)}/>Traži po barkodu</label>
      <label className="checkbox-label"><input type="checkbox" checked={!localOnly} onChange={e => { controller.current?.abort(); setBusy(false); setLocalOnly(!e.target.checked); setResults([]); setSelected(null); setSearched(false); }}/>Vanjski izvori (opcionalno)</label>
      <div className="catalog-actions"><Button type="submit" disabled={busy}>Pretraži namirnice</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setScanner(true)}>Skeniraj barkod</Button><Button type="button" variant="outline" onClick={() => choose({ ...emptyDraft(), barcode: barcode ? query : "", basis: "PER_100_G" })}>Ručni unos</Button></div>
    </form><div className="catalog-actions mt-4"><label className="upload-label">Fotografiraj etiketu<input aria-label="Fotografiraj etiketu" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label><label className="upload-label">Odaberi postojeću sliku<input aria-label="Odaberi postojeću sliku" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label></div>
      <p className="muted text-sm mt-4">OCR radi lokalno na NutriHome poslužitelju. Slike do 5 MB i 12 MP; JPEG, PNG ili WebP. Fotografije se ne spremaju trajno. Vanjske baze dobivaju samo naziv pretrage ili barkod.</p><p className="muted text-sm">USDA traži ključ na poslužitelju. Moje namirnice i ugrađena baza rade bez interneta. Vanjski izvori uključuju se samo izričitom odlukom.</p>
    </section>
    {scanner && <BarcodeScanner onClose={() => setScanner(false)} onRead={code => { setScanner(false); setQuery(code); setBarcode(true); void search(code, true); }}/>}
    {busy && <p role="status" className="notice mt-4">Obrada… OCR može trajati do 45 sekundi.</p>}{error && <p role="alert" className="error">{error}</p>}
    {warnings.map((warning, i) => <p key={i} className="notice mt-3">{warning}</p>)}
    {searched && !results.length && <p role="status" className="card mt-4">Proizvod nije pronađen. Fotografiraj etiketu ili odaberi ručni unos.</p>}
    {!!results.length && <section className="mt-6" aria-label="Rezultati pretrage"><h2>Pronađene namirnice ({results.length})</h2><div className="food-list">{results.map((draft, i) => <article className="card" key={`${draft.source}:${draft.reference}:${i}`}><h3>{draft.name}</h3><p className="muted text-sm">{draft.referenceId ? "Ugrađena baza" : draft.brand || "Moje namirnice"} · {sourceLabels[draft.source]} · {basisLabels[draft.basis]}{draft.barcode && ` · ${draft.barcode}`}</p>{draft.referenceId && <><p>{draft.category} · {draft.preparation === "RAW" ? "Sirovo" : draft.preparation === "ROASTED" ? "Pečeno" : draft.preparation === "COOKED" ? "Kuhano / pripremljeno" : "Drugi oblik pripreme"}</p><p className="text-sm">{draft.nameEn}</p><p>{draft.calories || "Nepoznato"} kcal · B {draft.protein || "?"} g · U {draft.carbs || "?"} g · M {draft.fat || "?"} g{draft.fiber !== "" && ` · Vlakna ${draft.fiber} g`}</p><p className="muted text-sm">Ukupni ugljikohidrati (uključuju vlakna). Pregled i potvrda podataka prethode dodavanju.</p></>}{draft.localId ? <><ProductLinks id={draft.localId}/><Link href={`/zalihe/${draft.localId}/uredi`}>Uredi postojeći proizvod</Link></> : <Button type="button" variant="outline" disabled={busy} onClick={() => choose(draft)}>{draft.referenceId ? "Dodaj u moj katalog" : "Pregledaj i uredi podatke"}</Button>}{draft.referenceId && <div className="catalog-actions"><Button type="button" variant="outline" onClick={() => choose(draft)}>Dodaj u dnevnik prehrane</Button><Button type="button" variant="outline" onClick={() => choose(draft)}>Dodaj u zalihe</Button></div>}</article>)}</div><div className="catalog-actions"><Button type="button" disabled={busy || page === 0} onClick={() => void search(query, barcode, page - 1)}>Prethodna stranica</Button><span>Stranica {page + 1}</span><Button type="button" disabled={busy || !hasMore} onClick={() => void search(query, barcode, page + 1)}>Sljedeća stranica</Button></div></section>}
    {preview && <details className="card mt-4" open><summary>Fotografija etikete — samo ovaj pregled</summary>{/* Local object URL; no upload to image optimizers or external hosts. */}<img src={preview} alt="Odabrana nutritivna etiketa za ručnu provjeru" className="label-preview"/></details>}
    {ocrText && <details className="card mt-4"><summary>Prepoznati tekst za provjeru</summary><pre className="ocr-text">{ocrText}</pre></details>}
    {selected && <ReviewForm key={key} initial={selected} requestKey={key}/>}
  </>;
}
