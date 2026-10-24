import { addDays, calendarDate } from "./calendar";
import { roundRatio } from "./quantities";
export type Totals = { calories: number; protein: number; carbs: number; fat: number };
export const zeroTotals = (): Totals => ({ calories: 0, protein: 0, carbs: 0, fat: 0 });
export type TrendFood = { date: string; calculatedCaloriesCenti: number; calculatedProteinCenti: number; calculatedCarbsCenti: number; calculatedFatCenti: number };
export type TrendWeight = { date: string; weightG: number };
export function dailyNutrition(logs: TrendFood[]) {
  const days = new Map<string, { date: string; count: number; totals: Totals }>();
  for (const log of logs) {
    const day = days.get(log.date) ?? { date: log.date, count: 0, totals: zeroTotals() };
    day.count++; day.totals.calories += log.calculatedCaloriesCenti; day.totals.protein += log.calculatedProteinCenti; day.totals.carbs += log.calculatedCarbsCenti; day.totals.fat += log.calculatedFatCenti;
    days.set(log.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function mean(values: number[]) { return values.length ? roundRatio(values.reduce((sum, value) => sum + BigInt(value), 0n), BigInt(values.length)) : null; }
export function progressWindow(weights: TrendWeight[], foods: TrendFood[], end: string, days: 7 | 30) {
  calendarDate(end); const start = addDays(end, 1 - days);
  const measured = weights.filter(item => item.date >= start && item.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const nutrition = dailyNutrition(foods.filter(item => item.date >= start && item.date <= end));
  const totals = zeroTotals();
  for (const day of nutrition) for (const key of Object.keys(totals) as (keyof Totals)[]) totals[key] += day.totals[key];
  const averages = nutrition.length ? Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundRatio(BigInt(value), BigInt(nutrition.length))])) as Totals : null;
  const chart = measured.map(point => {
    const rolling = weights.filter(other => other.date >= addDays(point.date, -6) && other.date <= point.date);
    return { ...point, rollingG: mean(rolling.map(other => other.weightG)), rollingCount: rolling.length };
  });
  return { start, end, days, weightCount: measured.length, weightAverageG: mean(measured.map(item => item.weightG)),
    weightChangeG: measured.length >= 2 ? measured.at(-1)!.weightG - measured[0].weightG : null,
    recordedDays: nutrition.length, averages, chart, nutrition };
}
