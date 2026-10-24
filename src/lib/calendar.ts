export const TIMEZONE = "Europe/Zagreb";
export function localDate(instant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
export function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Neispravan datum.");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Neispravan datum.");
  return parsed;
}
export function addDays(value: string, days: number): string {
  const date = calendarDate(value); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function expiryState(expiration: string | null, today = localDate()): "unknown" | "expired" | "soon" | "fresh" {
  calendarDate(today);
  if (!expiration) return "unknown";
  calendarDate(expiration);
  return expiration < today ? "expired" : expiration <= addDays(today, 3) ? "soon" : "fresh";
}
// The next Monday after the local calendar date, including next week if today is Monday.
export function nextWeekStart(instant = new Date()): string {
  const date = localDate(instant), day = calendarDate(date).getUTCDay();
  return addDays(date, day === 0 ? 1 : 8 - day);
}
export function sundayWindow(instant = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  return parts.some(p => p.type === "weekday" && p.value === "Sun") && parts.some(p => p.type === "hour" && p.value === "08");
}
