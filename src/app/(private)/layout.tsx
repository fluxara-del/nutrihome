import { Leaf, ShieldCheck, LogOut } from "lucide-react";
import { requireUser } from "@/lib/session";
import { Navigation } from "@/components/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/prijava/actions";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="brand-icon"><Leaf/></span>NutriHome</div><Navigation/><div className="sidebar-footer"><p className="private-label"><ShieldCheck size={16}/>Tvoje privatno kućanstvo</p><small>Mali koraci. Dobre navike.</small></div></aside><div><header className="topbar"><span className="topbar-title">Moje kućanstvo / NutriHome</span><div className="actions"><ThemeToggle/><span className="avatar" aria-label={`Prijavljeni korisnik: ${user.username}`}>{user.username.charAt(0).toLocaleUpperCase("hr")}</span><form action={logoutAction}><Button type="submit" variant="ghost" aria-label="Odjavi se"><LogOut size={19}/></Button></form></div></header><main className="main">{children}</main></div></div>;
}
