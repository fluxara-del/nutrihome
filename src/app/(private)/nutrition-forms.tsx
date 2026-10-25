"use client";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { foodAction, weightAction, settingsAction, deleteFoodAction, deleteWeightAction, type NutritionState } from "./nutrition-actions";
import { stateLabels } from "@/lib/nutrition-input";
export type FoodSource = { id: string; name: string; type: "PRODUCT" | "RECIPE"; state: "RAW" | "COOKED"; estimated: boolean; hasDensity: boolean; hasPieceWeight: boolean };
export type FoodEdit = { id: string; version: number; date: string; source: FoodSource; quantity: string; unit: string; foodState: string; yield: string; estimated: boolean; inventoryDeducted: boolean; legacy: boolean };
type Action = (previous: NutritionState, form: FormData) => Promise<NutritionState>;
function useRequest(action: Action, initialKey: string) {
  const [state, formAction, pending] = useActionState(action, {});
  const [key, setKey] = useState(initialKey);
  useEffect(() => { if (state.savedRequestId) setKey(crypto.randomUUID()); }, [state.savedRequestId]);
  return { state, formAction, pending, key };
}
function Field({ name, label, value = "", type = "text", required = true, decimal = false, max }: { name: string; label: string; value?: string; type?: string; required?: boolean; decimal?: boolean; max?: string }) {
  const id = useId(); return <div><label htmlFor={id}>{label}</label><input id={id} name={name} type={type} defaultValue={value} required={required} inputMode={decimal ? "decimal" : undefined} max={max} maxLength={24}/></div>;
}
function Messages({ state, dateLink }: { state: NutritionState; dateLink?: "dnevnik" | "napredak" }) {
  return <>{state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status" className="notice mt-4">{state.success}{dateLink && state.date && <> <Link href={`/${dateLink}?${dateLink === "dnevnik" ? "date" : "end"}=${state.date}`}>Otvori datum {state.date}</Link></>}</p>}</>;
}
function Confirm({ label = "Potvrđujem spremanje" }: { label?: string }) { return <label className="checkbox-label"><input type="checkbox" name="confirmed" required/>{label}</label>; }
export function FoodForm({ sources, date, today, requestKey, entry, initialSourceId, initialSourceType }: { sources: FoodSource[]; date: string; today: string; requestKey: string; entry?: FoodEdit; initialSourceId?: string; initialSourceType?: "PRODUCT" | "RECIPE" }) {
  const { state, formAction, pending, key } = useRequest(foodAction, requestKey);
  const [type, setType] = useState<"PRODUCT" | "RECIPE">(entry?.source.type ?? initialSourceType ?? "PRODUCT");
  const [sourceId, setSourceId] = useState(entry?.source.id ?? sources.find(source => source.id === initialSourceId && source.type === type)?.id ?? sources.find(source => source.type === type)?.id ?? "");
  const [foodState, setFoodState] = useState(entry?.foodState ?? sources.find(source => source.id === sourceId)?.state ?? "RAW");
  const [factor, setFactor] = useState(entry?.yield ?? "");
  const [deduct, setDeduct] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.savedRequestId || entry) return;
    const form = formRef.current;
    if (!form) return;
    const quantity = form.elements.namedItem("quantity") as HTMLInputElement | null;
    if (quantity) quantity.value = "";
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)').forEach(input => { input.checked = false; });
    setDeduct(false);
  }, [state.savedRequestId, entry]);
  const id = useId();
  const source = entry?.source ?? sources.find(item => item.type === type && item.id === sourceId);
  const isRecipe = type === "RECIPE", list = sources.filter(item => item.type === type);
  const conversion = !isRecipe && foodState !== (source?.state ?? "RAW");
  const units = isRecipe ? [["SERVING", "porcija"]] : [["G", "g"], ["KG", "kg"], ...(!conversion && source?.hasDensity ? [["ML", "ml"], ["L", "l"]] : []), ...(!conversion && source?.hasPieceWeight ? [["PIECE", "kom"]] : [])];
  return <form ref={formRef} onReset={event => event.preventDefault()} action={formAction} aria-label={entry ? "Uredi unos prehrane" : "Dodaj unos prehrane"}>
    <input type="hidden" name="requestKey" value={key}/><input type="hidden" name="id" value={entry?.id ?? ""}/><input type="hidden" name="version" value={entry?.version ?? 0}/>
    {entry ? <><p className="notice">{entry.legacy ? "Raniji unos: izračun se skalira iz spremljenih vrijednosti i označava kao procjena." : "Izmjena koristi nutritivne podatke spremljene pri prvom unosu. Promjene kataloga ne mijenjaju taj izvor."}</p><strong>{entry.source.name}</strong><input type="hidden" name="sourceType" value={type}/><input type="hidden" name="sourceId" value={sourceId}/></> : <div className="form-grid"><div><label htmlFor={`${id}-type`}>Vrsta unosa</label><select id={`${id}-type`} name="sourceType" value={type} onChange={event => { const next = event.target.value as typeof type; const first = sources.find(item => item.type === next); setType(next); setSourceId(first?.id ?? ""); setFoodState(first?.state ?? "RAW"); setFactor(""); }}><option value="PRODUCT">Proizvod</option><option value="RECIPE">Porcije recepta</option></select></div><div><label htmlFor={`${id}-source`}>{isRecipe ? "Recept" : "Namirnica"}</label><select id={`${id}-source`} name="sourceId" required value={sourceId} onChange={event => { setSourceId(event.target.value); setFoodState(sources.find(item => item.id === event.target.value)?.state ?? "RAW"); setFactor(""); }}><option value="">Odaberi…</option>{list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>}
    {!entry && list.length === 0 && <p className="notice mt-4">{isRecipe ? "Još nema recepata sa sastojcima. Modul stvaranja recepata dolazi u fazi 4." : <Link href="/zalihe/novo">Najprije dodaj proizvod u Zalihe.</Link>}</p>}
    <div className="form-grid"><Field name="date" label="Datum prehrane" type="date" value={state.values?.date ?? entry?.date ?? date} max={today}/><Field name="quantity" label={isRecipe ? "Broj porcija" : "Količina hrane"} decimal value={state.values?.quantity ?? entry?.quantity ?? ""}/><div><label htmlFor={`${id}-unit`}>Jedinica unosa</label><select id={`${id}-unit`} key={`${sourceId}:${type}:${foodState}`} name="unit" defaultValue={state.values?.unit ?? entry?.unit ?? (isRecipe ? "SERVING" : "G")}>{units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!isRecipe && <div><label htmlFor={`${id}-state`}>Stanje izvagane hrane</label><select id={`${id}-state`} name="foodState" value={foodState} onChange={event => setFoodState(event.target.value)}><option value="RAW">Sirovo</option><option value="COOKED">Kuhano</option></select></div>}</div>
    {isRecipe ? <input type="hidden" name="foodState" value={source?.state ?? "COOKED"}/> : <><p className="muted text-sm mt-4">Podaci odabranog izvora: {stateLabels[source?.state ?? "RAW"]}. Za drugo stanje potreban je izmjeren omjer mase; automatska pretpostavka nije dopuštena.</p>{foodState !== (source?.state ?? "RAW") && <div className="notice"><label htmlFor={`${id}-yield`}>Omjer kuhane / sirove mase</label><input id={`${id}-yield`} name="yield" inputMode="decimal" value={factor} onChange={event => setFactor(event.target.value)} placeholder="Npr. 2,5" required/><p className="text-sm mt-3">Primjer: 100 g sirove hrane nakon kuhanja teži 250 g → omjer 2,5. Koristi vlastito mjerenje. Preračun je procjena uz pretpostavku očuvanja nutrijenata; gubitci pri pripremi nisu izmjereni.</p><label className="checkbox-label"><input type="checkbox" name="yieldConfirmed" required defaultChecked={!!entry?.yield}/>Potvrđujem izmjereni omjer mase</label></div>}</>}
    <label className="checkbox-label"><input key={`${sourceId}:${foodState}`} type="checkbox" name="estimated" disabled={source?.estimated || conversion} defaultChecked={source?.estimated || conversion || entry?.estimated}/>Ovaj unos sadrži procijenjene podatke</label>
    {!entry && <><label className="checkbox-label"><input type="checkbox" name="deductInventory" checked={deduct} onChange={event => setDeduct(event.target.checked)}/>Oduzmi potrošenu količinu iz zaliha</label><p className="muted text-sm">Ako si potrošnju već zabilježio/la u Zalihama, ostavi ovu opciju isključenu. Oduzimanje provjerava aktualnu zalihu i današnje rokove.</p>{deduct && <label className="checkbox-label"><input type="checkbox" name="confirmedStock" required/>Potvrđujem da potrošnja još nije knjižena i želim oduzimanje zalihe</label>}</>}
    {entry?.inventoryDeducted && <p className="notice mt-4">Potrošnja zalihe već je potvrđena. Uređivanje dnevnika ne troši je ponovno i ne vraća zalihu. Ispravak napravi u Zalihama.</p>}
    <Confirm/><Messages state={state} dateLink="dnevnik"/><Button type="submit" disabled={pending || !source} className="mt-3">{pending ? "Spremanje…" : entry ? "Spremi unos" : "Dodaj u dnevnik"}</Button>
  </form>;
}
export function WeightForm({ requestKey, date, today, entry }: { requestKey: string; date: string; today: string; entry?: { id: string; version: number; date: string; weightG: number } }) {
  const { state, formAction, pending, key } = useRequest(weightAction, requestKey);
  return <form action={formAction} aria-label={entry ? "Uredi mjerenje težine" : "Dodaj mjerenje težine"}><input type="hidden" name="requestKey" value={key}/><input type="hidden" name="id" value={entry?.id ?? ""}/><input type="hidden" name="version" value={entry?.version ?? 0}/><div className="form-grid"><Field name="date" label="Datum mjerenja" type="date" max={today} value={state.values?.date ?? entry?.date ?? date}/><Field name="weight" label="Težina (kg)" decimal value={state.values?.weight ?? (entry ? String(entry.weightG / 1000) : "")}/></div><Confirm/><Messages state={state} dateLink="napredak"/><Button type="submit" disabled={pending} className="mt-3">{pending ? "Spremanje…" : entry ? "Spremi mjerenje" : "Dodaj mjerenje"}</Button></form>;
}
export function DeleteNutritionForm({ requestKey, id, version, kind, deducted = false }: { requestKey: string; id: string; version: number; kind: "food" | "weight"; deducted?: boolean }) {
  const { state, formAction, pending, key } = useRequest(kind === "food" ? deleteFoodAction : deleteWeightAction, requestKey);
  return <form action={formAction} aria-label={kind === "food" ? "Izbriši unos prehrane" : "Izbriši mjerenje težine"}><input type="hidden" name="requestKey" value={key}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/>{deducted && <p className="notice">Brisanje unosa ne vraća već potrošenu zalihu.</p>}<Confirm label={kind === "food" ? "Potvrđujem brisanje unosa prehrane" : "Potvrđujem brisanje mjerenja"}/><Messages state={state}/><Button type="submit" variant="outline" disabled={pending}>Izbriši zapis</Button></form>;
}
export type SettingsValues = { version: number; calorieTargetCenti: number; proteinTargetCenti: number; carbohydrateTargetCenti: number; fatTargetCenti: number; mealCount: number; weeklyBudgetCents: number | null; dietaryPreferences: string; excludedIngredients: string };
export function SettingsForm({ settings, requestKey }: { settings: SettingsValues; requestKey: string }) {
  const { state, formAction, pending, key } = useRequest(settingsAction, requestKey), id = useId();
  const val = (name: string, original: string | number) => state.values?.[name] ?? String(original);
  return <form action={formAction} aria-label="Osobni ciljevi"><input type="hidden" name="requestKey" value={key}/><input type="hidden" name="version" value={settings.version}/><input type="hidden" name="timezone" value="Europe/Zagreb"/>
    <div className="form-grid">{[["calories", "Dnevni kalorijski cilj (kcal)", settings.calorieTargetCenti], ["protein", "Cilj bjelančevina (g)", settings.proteinTargetCenti], ["carbs", "Cilj ugljikohidrata (g)", settings.carbohydrateTargetCenti], ["fat", "Cilj masti (g)", settings.fatTargetCenti]].map(([name, label, value]) => <Field key={name} name={String(name)} label={String(label)} decimal value={val(String(name), Number(value) / 100)}/>)}<Field name="mealCount" label="Broj obroka dnevno" value={val("mealCount", settings.mealCount)}/><Field name="weeklyBudget" label="Tjedni budžet (€, neobavezno)" decimal required={false} value={val("weeklyBudget", settings.weeklyBudgetCents == null ? "" : settings.weeklyBudgetCents / 100)}/></div>
    <div className="form-grid"><div><label htmlFor={`${id}-preferences`}>Prehrambene preferencije</label><textarea id={`${id}-preferences`} name="preferences" rows={4} maxLength={5000} defaultValue={val("preferences", (JSON.parse(settings.dietaryPreferences) as string[]).join("\n"))}/></div><div><label htmlFor={`${id}-excluded`}>Isključeni sastojci</label><textarea id={`${id}-excluded`} name="excluded" rows={4} maxLength={5000} defaultValue={val("excluded", (JSON.parse(settings.excludedIngredients) as string[]).join("\n"))}/></div></div><p className="muted text-sm mt-3">Po jedan pojam u retku. Preferencije i budžet bit će dostupni planeru u sljedećim fazama; zasad se samo spremaju.</p><p className="notice">Ciljeve biraš samostalno. Aplikacija ne propisuje kalorijski deficit ni medicinske preporuke. Makro ciljevi uspoređuju se zasebno; njihove kalorijske vrijednosti nisu automatski izjednačene s kalorijskim ciljem.</p><Confirm label="Potvrđujem svoje ciljeve i postavke"/><Messages state={state}/><Button type="submit" disabled={pending} className="mt-3">{pending ? "Spremanje…" : "Spremi ciljeve"}</Button>
  </form>;
}
