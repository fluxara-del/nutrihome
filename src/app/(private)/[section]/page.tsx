import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { requireUser } from "@/lib/session";
const modules: Record<string, { title: string; phase: number; description: string }> = {
  recepti: { title: "Recepti", phase: 4, description: "Vlastiti recepti, točne količine sastojaka i izračun hranjivih vrijednosti po porciji." },
  plan: { title: "Tjedni plan", phase: 4, description: "Sedmodnevni plan s pregledom ciljeva, zaliha i ograničenja, uz tvoje konačno odobrenje." },
  kupnja: { title: "Kupnja", phase: 5, description: "Objedinjeni sastojci iz plana umanjeni za raspoložive zalihe i potvrda kupljenih namirnica." },
};
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  await requireUser();
  const { section } = await params;
  const module = modules[section];
  if (!module) notFound();
  return <><div className="intro"><div><p className="eyebrow">Plan razvoja</p><h1>{module.title}</h1><p>{module.description}</p></div><span className="badge">Faza {module.phase}</span></div><section className="card empty"><Construction size={44} strokeWidth={1.3}/><h2>Ovaj modul još nije implementiran.</h2><p>Trenutačno je dostupan temelj aplikacije: prijava, baza podataka i pregled stvarnog stanja kućanstva. Funkcije ovog modula dolaze u {module.phase}. fazi.</p></section></>;
}
