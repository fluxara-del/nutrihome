"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="login-page"><div className="card"><h1>Nešto je pošlo po zlu.</h1><p>Pokušajte ponovno. Ako se problem nastavi, provjerite stanje aplikacije.</p><Button onClick={reset}>Pokušaj ponovno</Button></div></main>;
}
