import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { localDate, addDays } from "@/lib/calendar";
import { selectedDate, displayNumber, stateLabels } from "@/lib/nutrition-input";
import { loadDiary } from "@/lib/nutrition-data";
import { NutritionProgress } from "@/components/nutrition-progress";
import { FoodForm, DeleteNutritionForm, type FoodSource } from "../nutrition-forms";
import type { NutritionSnapshot } from "@/lib/nutrition-snapshot";
export const metadata = { title: "Dnevnik prehrane" };
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const query = await searchParams, today = localDate(), date = selectedDate(query.date), data = await loadDiary(date);
  const pretty = new Intl.DateTimeFormat("hr-HR", { timeZone: "Europe/Zagreb", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  return <><div className="intro"><div><p className="eyebrow">{pretty}</p><h1>Dnevnik prehrane</h1><p>Zabilježeni obroci i izračun prema podacima spremljenima uz svaki unos.</p></div><NotebookPen size={30}/></div>
    <form action="/dnevnik" method="get" className="card date-picker" aria-label="Datum dnevnika"><div><label htmlFor="diary-date">Prikaži datum</label><input id="diary-date" type="date" name="date" max={today} defaultValue={date} required/></div><button className="inline-flex min-h-11 items-center rounded-xl bg-primary text-background px-4" type="submit">Prikaži dan</button><Link href={`/dnevnik?date=${addDays(date, -1)}`}>Prethodni dan</Link>{date < today && <Link href={`/dnevnik?date=${addDays(date, 1)}`}>Sljedeći dan</Link>}<Link href="/dnevnik">Danas</Link></form>
    <section className="card mt-6"><h2>Zabilježeno za odabrani dan</h2><NutritionProgress totals={data.totals} goals={data.settings}/><p className="muted text-sm mt-4 mb-0">Ciljevi su trenutačne osobne postavke. Prikaz obuhvaća samo spremljene unose; ne potvrđuje da je cijeli dan evidentiran.</p></section>
    <div className="diary-grid mt-6"><section className="card"><div className="card-header"><h2>Novi unos</h2><Plus size={20}/></div><FoodForm sources={data.sources} date={date} today={today} requestKey={randomUUID()}/></section><section><h2>Unosi prehrane ({data.logs.length})</h2>{!data.logs.length && <div className="card empty"><NotebookPen size={38}/><h3>Nema zabilježenih unosa.</h3><p>To ne znači da je stvarni unos bio nula. Dodaj pojedenu hranu ili porciju postojećeg recepta.</p></div>}<div className="food-list">{data.logs.map(log => {
      const snapshot = log.nutritionSnapshot ? JSON.parse(log.nutritionSnapshot) as NutritionSnapshot : null;
      const name = log.sourceName ?? log.product?.name ?? log.recipe?.title ?? "Raniji unos";
      const source: FoodSource = { id: log.productId ?? log.recipeId!, name, type: log.productId ? "PRODUCT" : "RECIPE", state: snapshot?.state ?? log.foodState, estimated: snapshot?.estimated ?? true,
        hasDensity: snapshot?.kind === "product" && snapshot.densityMgPerMl !== null, hasPieceWeight: snapshot?.kind === "product" && snapshot.pieceWeightMg !== null };
      const unit = log.enteredUnit ?? (log.productId ? "G" : "SERVING"), quantity = log.enteredQuantity ?? String(log.quantityMilli / 1000);
      const unitLabels: Record<string, string> = { G: "g", KG: "kg", ML: "ml", L: "l", PIECE: "kom", SERVING: "porcija" };
      const edit = { id: log.id, version: log.version, date: log.date, source, quantity, unit, foodState: log.foodState, yield: log.yieldMilli === null ? "" : String(log.yieldMilli / 1000), estimated: log.estimatedNutrition, inventoryDeducted: log.inventoryDeducted, legacy: !snapshot || snapshot.kind === "legacy" };
      return <article className="card food-entry" key={`${log.id}:${log.version}`} aria-label={`Unos: ${name}`}><div className="card-header"><h3>{name}</h3><strong>{displayNumber(log.calculatedCaloriesCenti / 100)} kcal</strong></div><p className="muted text-sm">{displayNumber(Number(quantity.replace(",", ".")), 3)} {unitLabels[unit]} · {stateLabels[log.foodState]}</p><div className="macro-row"><span>Bjelančevine <strong>{displayNumber(log.calculatedProteinCenti / 100)} g</strong></span><span>Ugljikohidrati <strong>{displayNumber(log.calculatedCarbsCenti / 100)} g</strong></span><span>Masti <strong>{displayNumber(log.calculatedFatCenti / 100)} g</strong></span></div><div className="stock-badges mt-3">{log.estimatedNutrition && <span className="warning-badge">Procijenjeni podaci</span>}{log.inventoryDeducted && <span className="badge">Potrošnja zalihe potvrđena</span>}{edit.legacy && <span className="warning-badge">Raniji zapis bez pune etikete</span>}</div><details className="entry-editor"><summary>Uredi unos</summary><FoodForm sources={data.sources} date={date} today={today} entry={edit} requestKey={randomUUID()}/></details><details><summary>Izbriši unos</summary><DeleteNutritionForm id={log.id} version={log.version} kind="food" deducted={log.inventoryDeducted} requestKey={randomUUID()}/></details></article>;
    })}</div></section></div></>;
}
