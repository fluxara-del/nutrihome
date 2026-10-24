import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ProductForm } from "../forms";
export const metadata = { title: "Novi proizvod" };
export default async function NewProduct() {
  await requireUser();
  return <><Link className="back-link" href="/zalihe">← Sve zalihe</Link><div className="intro"><div><p className="eyebrow">Katalog kućanstva</p><h1>Novi proizvod</h1><p>Najprije upiši podatke o namirnici. Količine i rokove dodaješ kroz serije.</p></div></div><p className="notice mb-6"><Link href="/namirnice">Pretraži bazu, skeniraj barkod ili fotografiraj etiketu →</Link></p><ProductForm/></>;
}
