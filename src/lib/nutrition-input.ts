import { z } from "zod";
import { calendarDate, localDate } from "./calendar";
import { fixed } from "./quantities";
export class NutritionError extends Error {}
export const stateLabels = { RAW: "Sirovo", COOKED: "Kuhano" };
const decimal = z.string().trim().min(1, "Unesite broj.").max(24).regex(/^\d+(?:[.,]\d+)?$/, "Koristite pozitivan decimalni broj.");
const date = z.string().refine(value => { try { calendarDate(value); return true; } catch { return false; } }, "Datum nije ispravan.");
const base = { requestKey: z.uuid(), confirmed: z.literal(true, { error: "Potvrdite spremanje ili brisanje." }) };
const version = z.number().int().nonnegative();
export const foodSchema = z.strictObject({ ...base, id: z.string().max(100).default(""), version: version.default(0), date,
  sourceType: z.enum(["PRODUCT", "RECIPE"]), sourceId: z.string().min(1, "Odaberite proizvod ili recept.").max(100),
  quantity: decimal, unit: z.enum(["G", "KG", "ML", "L", "PIECE", "SERVING"]), foodState: z.enum(["RAW", "COOKED"]),
  yield: z.union([decimal, z.literal("")]).default(""), yieldConfirmed: z.boolean().default(false), estimated: z.boolean().default(false),
  deductInventory: z.boolean().default(false), confirmedStock: z.boolean().default(false),
});
export const weightSchema = z.strictObject({ ...base, id: z.string().max(100).default(""), version: version.default(0), date, weight: decimal });
export const deleteSchema = z.strictObject({ ...base, id: z.string().min(1).max(100), version });
export const settingsSchema = z.strictObject({ ...base, version, calories: decimal, protein: decimal, carbs: decimal, fat: decimal,
  mealCount: z.number().int().min(1).max(12), weeklyBudget: z.union([decimal, z.literal("")]),
  preferences: z.string().max(5000), excluded: z.string().max(5000), timezone: z.literal("Europe/Zagreb"),
});
export function parseNutrition<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "";
    throw new NutritionError(!message || /^(Invalid|Too|Unrecognized)/.test(message) ? "Provjerite polja, datum, količinu i potvrdu." : message);
  }
  return result.data;
}
export function numberFixed(value: string, digits: number) {
  try { return fixed(value, digits); } catch { throw new NutritionError("Previše decimalnih mjesta ili prevelika vrijednost."); }
}
export function actualDate(value: string, today = localDate()) {
  calendarDate(value);
  if (value > today) throw new NutritionError("Stvarni unos hrane i težine ne može imati budući datum.");
  return value;
}
export function selectedDate(value: unknown, fallback = localDate()) {
  if (typeof value !== "string") return fallback;
  try { return actualDate(value); } catch { return fallback; }
}
export function lines(value: string): string[] {
  const list = [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  if (list.length > 50 || list.some(line => line.length > 100)) throw new NutritionError("Najviše 50 pojmova, svaki do 100 znakova.");
  return list;
}
export function displayNumber(value: number, digits = 2) { return value.toLocaleString("hr-HR", { maximumFractionDigits: digits }); }
