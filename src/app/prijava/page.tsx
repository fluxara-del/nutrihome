import { redirect } from "next/navigation";
import { Leaf, ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";
export const metadata = { title: "Prijava" };
export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return <main className="login-page"><div className="login-panel"><div className="brand"><span className="brand-icon"><Leaf/></span>NutriHome</div><section className="card"><p className="eyebrow">Dobro došli kući</p><h1>Tvoj prostor za zdravije navike.</h1><p className="muted">Prijavi se u svoje privatno kućanstvo.</p><LoginForm/></section><p className="private-label mt-5 justify-center"><ShieldCheck size={16}/>Privatno kućanstvo · Pristup samo uz prijavu</p></div></main>;
}
