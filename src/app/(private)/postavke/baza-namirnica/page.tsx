import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { bundledReference, decodeReference } from "@/lib/reference-food";
import { ImportForm } from "./import-form";
export default async function ReferenceSettings(){
 const user=await requireUser();const client=db();
 const [state,count,owner]=await Promise.all([client.referenceCatalog.findUnique({where:{id:"main"}}),client.referenceFood.count(),client.user.findFirst({orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true}})]);
 let integrity="Paket nije dostupan ili nije ispravan";try{const {bytes,expected}=await bundledReference();decodeReference(bytes,expected);integrity=state?.sha256===expected?"Ugrađeni paket: SHA-256 ispravan; uvezeni paket se podudara":"Ugrađeni paket: SHA-256 ispravan; baza koristi drugi lokalni paket";}catch{}
 return <><div className="intro"><h1>Baza namirnica</h1></div><section className="card"><h2>Ugrađeni referentni katalog</h2><dl><dt>Broj namirnica</dt><dd>{count}</dd><dt>Verzija</dt><dd>{state?.version??"Nije uvezeno"}</dd><dt>Datum izrade paketa</dt><dd>{state?.builtAt??"—"}</dd><dt>Izvor i licenca</dt><dd>{state?.source} · {state?.license}</dd><dt>Integritet datoteke</dt><dd>{integrity}</dd><dt>Sažetak uvezenog paketa (provjeren pri uvozu)</dt><dd className="ocr-text">{state?.sha256??"—"}</dd></dl></section><section className="card mt-6"><h2>Ručno ažuriranje</h2>{owner?.id===user.id?<ImportForm/>:<p>Ažuriranje je dostupno prvom administratorskom računu. Uloga administratora određuje se redoslijedom stvaranja računa.</p>}</section></>;
}
