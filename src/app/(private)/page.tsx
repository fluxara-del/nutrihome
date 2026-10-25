import { Package, Timer, NotebookPen, CookingPot, ArrowUpRight, CalendarDays, Scale } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadDiary, loadProgress } from "@/lib/nutrition-data";
import { NutritionProgress } from "@/components/nutrition-progress";
import { displayNumber } from "@/lib/nutrition-input";
import { localDate, addDays } from "@/lib/calendar";
export default async function Dashboard() {
  const user = await requireUser(), today = localDate();
  const [products, expiring, recipes, diary, progress] = await Promise.all([
    db().foodProduct.count({ where: { householdId: user.householdId } }),
    db().inventoryBatch.count({ where: { householdId: user.householdId, quantityMg: { gt: 0 }, expirationDate: { gte: today, lte: addDays(today, 3) } } }),
    db().recipe.count({ where: { householdId: user.householdId } }), loadDiary(today), loadProgress(today, 7),
  ]);
  const date = new Intl.DateTimeFormat("hr-HR", { timeZone: "Europe/Zagreb", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const stats = [{ title: "Proizvodi u katalogu", value: products, icon: Package }, { title: "Serije istječu za ≤ 3 dana", value: expiring, icon: Timer }, { title: "Današnji unosi prehrane", value: diary.logs.length, icon: NotebookPen }, { title: "Spremljeni recepti", value: recipes, icon: CookingPot }];
  const lastWeight = progress.thirty.chart.at(-1);
  return <><div className="intro"><div><p className="eyebrow">{date}</p><h1>Dobro došli u NutriHome.</h1><p>Tvoji zabilježeni obroci, zalihe i osobni ciljevi na jednom privatnom mjestu.</p></div><span className="badge">Dnevnik i zalihe</span></div>
  <div className="stats">{stats.map(({ title, value, icon: Icon }) => <div className="card" key={title}><div className="stat-icon"><Icon size={20}/></div><div className="stat-number">{value}</div><div className="stat-title">{title}</div></div>)}</div>
  <div className="dashboard-grid"><section className="card"><div className="card-header"><h2>Prehrana za danas</h2><Link href="/dnevnik" aria-label="Otvori dnevnik prehrane"><ArrowUpRight size={20}/></Link></div><NutritionProgress totals={diary.totals} goals={diary.settings}/><p className="muted text-sm mt-5 mb-0">Prikaz obuhvaća samo zabilježene unose. Dani bez zapisa nisu potvrda da je stvarni unos bio nula.</p></section>
  <section className="card"><div className="card-header"><h2>Današnji zabilježeni obroci</h2><NotebookPen size={20}/></div>{!diary.logs.length ? <p className="muted">Još nema zabilježenih unosa. <Link href="/dnevnik">Dodaj obrok u dnevnik.</Link></p> : <ul className="module-list">{diary.logs.slice(0, 5).map(log => <li key={log.id}><Link href="/dnevnik">{log.sourceName ?? log.product?.name ?? log.recipe?.title ?? "Raniji unos"}{log.estimatedNutrition ? " · procjena" : ""}</Link><span>{displayNumber(log.calculatedCaloriesCenti / 100)} kcal</span></li>)}</ul>}</section>
  <section className="card"><div className="card-header"><h2>Zabilježena težina</h2><Scale size={20}/></div>{lastWeight ? <><p className="stock-number">{displayNumber(lastWeight.weightG / 1000, 3)} kg</p><p className="muted text-sm">Zadnje mjerenje: {lastWeight.date}. Prosjek posljednjih 7 dana: {progress.seven.weightAverageG === null ? "nema mjerenja" : `${displayNumber(progress.seven.weightAverageG / 1000, 3)} kg`} ({progress.seven.weightCount} mjerenja).</p></> : <p className="muted">Nema mjerenja u posljednjih 30 dana.</p>}<Link className="back-link mb-0!" href="/napredak">Otvori napredak i mjerenja</Link></section>
  <section className="card"><div className="card-header"><h2>Što slijedi</h2><CalendarDays size={20}/></div><ul className="module-list"><li><Link href="/zalihe">Upravljanje zalihama</Link><span>Dostupno</span></li><li><Link href="/dnevnik">Dnevnik i napredak</Link><span>Dostupno</span></li><li><Link href="/recepti">Recepti i plan obroka</Link><span>Dostupno</span></li><li><Link href="/kupnja">Kupnja i automatizacija</Link><span>Faza 5</span></li></ul><p className="muted mt-5 text-sm">Planiranje ne troši zalihe. Uz dnevnik ih možeš oduzeti samo zasebnom potvrdom.</p></section></div></>;
}
