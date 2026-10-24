import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa";
export const metadata: Metadata = { title: { default: "NutriHome", template: "%s · NutriHome" }, description: "Privatno mjesto za tvoju prehranu, zalihe i planove.", appleWebApp: { capable: true, title: "NutriHome", statusBarStyle: "default" }, icons: { apple: "/icon-192.png", icon: "/icon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#285b43" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="hr" suppressHydrationWarning><body>{children}<PwaRegistration/></body></html>;
}
