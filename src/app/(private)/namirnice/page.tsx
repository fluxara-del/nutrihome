import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/session";
import { CatalogExplorer } from "./catalog-explorer";
export const metadata = { title: "Baza namirnica" };
export default async function CatalogPage() {
  await requireUser();
  return <><div className="intro"><div><p className="eyebrow">Katalog kućanstva</p><h1>Baza namirnica</h1><p>Pronađi proizvod, skeniraj barkod ili fotografiraj etiketu. Pregledaj i potvrdi podatke prije spremanja.</p></div></div><CatalogExplorer requestKey={randomUUID()}/></>;
}
