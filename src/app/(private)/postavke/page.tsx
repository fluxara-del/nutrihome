import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Settings } from "lucide-react";
import { loadSettings } from "@/lib/nutrition-data";
import { SettingsForm } from "../nutrition-forms";
export const metadata = { title: "Postavke" };
export default async function SettingsPage() {
  const settings = await loadSettings();
  return <><div className="intro"><div><p className="eyebrow">Osobne postavke</p><h1>Postavke</h1><p>Vlastiti ciljevi i preferencije. Jezik: hrvatski · mjere: metričke · vrijeme: Europe/Zagreb.</p></div><Settings size={28}/></div><section className="card"><h2>{settings.goalsConfirmed ? "Ciljevi su potvrđeni" : "Početne vrijednosti još nisu potvrđene"}</h2><p className="muted">{settings.goalsConfirmed ? "Ove vrijednosti koriste se za usporedbu u dnevniku, uključujući prikaz starijih datuma." : "Pregledaj vrijednosti i prilagodi ih svojim potrebama prije potvrde."}</p><p><Link href="/postavke/baza-namirnica">Baza namirnica</Link></p><p className="muted">Planner podržava preferencije: vegetarijansko, vegansko, bez glutena, visok udio proteina, priprema unaprijed, za posao, do 20 minuta, za zamrzavanje i iskoristi uskoro. Isključeni pojmovi provjeravaju naziv, marku i kategoriju sastojka; nisu provjera alergena.</p><SettingsForm key={settings.version} settings={settings} requestKey={randomUUID()}/></section></>;
}
