"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return <form action={action}>
    <label htmlFor="username">Korisničko ime</label>
    <input id="username" name="username" defaultValue={state.username ?? ""} autoComplete="username" required maxLength={32} spellCheck={false} autoCapitalize="none"/>
    <label htmlFor="password">Lozinka</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128}/>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    <Button type="submit" className="mt-6 w-full" disabled={pending}>{pending ? "Prijava u tijeku…" : "Prijavi se"}<ArrowRight size={18}/></Button>
  </form>;
}
