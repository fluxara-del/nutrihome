"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, NotebookPen, CookingPot, CalendarDays, ShoppingBasket, ChartNoAxesCombined, Settings } from "lucide-react";
export const sections = [
  { href: "/", label: "Nadzorna ploča", icon: LayoutDashboard },
  { href: "/zalihe", label: "Zalihe", icon: Package },
  { href: "/dnevnik", label: "Dnevnik prehrane", icon: NotebookPen },
  { href: "/recepti", label: "Recepti", icon: CookingPot },
  { href: "/plan", label: "Tjedni plan", icon: CalendarDays },
  { href: "/kupnja", label: "Kupnja", icon: ShoppingBasket },
  { href: "/napredak", label: "Napredak", icon: ChartNoAxesCombined },
  { href: "/postavke", label: "Postavke", icon: Settings },
];
export function Navigation() {
  const path = usePathname();
  return <nav className="nav" aria-label="Glavni izbornik">{sections.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><Icon size={20} aria-hidden="true"/>{label}</Link>)}</nav>;
}
