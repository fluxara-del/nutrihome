"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const next = localStorage.getItem("nutrihome-theme") === "dark";
    setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);
  return <Button type="button" variant="ghost" aria-label={dark ? "Uključi svijetlu temu" : "Uključi tamnu temu"} onClick={() => {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("nutrihome-theme", next ? "dark" : "light");
  }}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</Button>;
}
