import { describe, it, expect } from "vitest";
import { dailyNutrition, progressWindow } from "../src/lib/nutrition-trends";
const log = (date: string, calories: number) => ({ date, calculatedCaloriesCenti: calories, calculatedProteinCenti: 1000, calculatedCarbsCenti: 2000, calculatedFatCenti: 500 });
describe("calendar-based personal trends", () => {
  it("aggregates multiple entries into actual recorded days and excludes missing dates from averages", () => {
    const foods = [log("2026-10-24", 10000), log("2026-10-24", 20000), log("2026-10-25", 50000), log("2026-10-18", 90000)];
    const seven = progressWindow([], foods, "2026-10-25", 7), thirty = progressWindow([], foods, "2026-10-25", 30);
    expect(seven.recordedDays).toBe(2); expect(seven.averages?.calories).toBe(40000);
    expect(thirty.recordedDays).toBe(3); expect(thirty.averages?.calories).toBe(56667);
    expect(dailyNutrition(foods).find(day => day.date === "2026-10-24")?.count).toBe(2);
  });
  it("computes seven-calendar-day rolling weight means, including data before the visible window", () => {
    const weights = [{ date: "2026-10-18", weightG: 80000 }, { date: "2026-10-24", weightG: 82000 }, { date: "2026-10-25", weightG: 81000 }];
    const seven = progressWindow(weights, [], "2026-10-25", 7);
    expect(seven.start).toBe("2026-10-19"); expect(seven.weightCount).toBe(2); expect(seven.weightAverageG).toBe(81500);
    expect(seven.chart[0]).toMatchObject({ rollingG: 81000, rollingCount: 2 });
    expect(seven.chart[1]).toMatchObject({ rollingG: 81500, rollingCount: 2 });
    expect(seven.weightChangeG).toBe(-1000);
    expect(progressWindow(weights, [], "2026-10-25", 30).weightAverageG).toBe(81000);
  });
  it("distinguishes no records from a genuine zero-calorie record and a single measurement", () => {
    const empty = progressWindow([], [], "2026-10-25", 30);
    expect(empty.averages).toBeNull(); expect(empty.weightAverageG).toBeNull(); expect(empty.weightChangeG).toBeNull();
    const recorded = progressWindow([{ date: "2026-10-25", weightG: 80000 }], [log("2026-10-25", 0)], "2026-10-25", 7);
    expect(recorded.recordedDays).toBe(1); expect(recorded.averages?.calories).toBe(0); expect(recorded.weightChangeG).toBeNull();
  });
  it("handles DST and leap/year boundaries using calendar days rather than fixed local hours", () => {
    expect(progressWindow([], [], "2026-03-30", 7).start).toBe("2026-03-24");
    expect(progressWindow([], [], "2026-10-26", 7).start).toBe("2026-10-20");
    expect(progressWindow([], [], "2028-03-01", 30).start).toBe("2028-02-01");
    expect(progressWindow([], [], "2027-01-01", 7).start).toBe("2026-12-26");
    expect(() => progressWindow([], [], "2026-02-30", 7)).toThrow();
  });
});
