import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "NutriHome — moje kućanstvo", short_name: "NutriHome", description: "Privatna prehrana, zalihe i planiranje obroka.", lang: "hr", start_url: "/", scope: "/", display: "standalone", background_color: "#f5f6f2", theme_color: "#285b43", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
