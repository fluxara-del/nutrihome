import { describe, it, expect } from "vitest";
import { fixed, toMilligrams } from "../src/lib/quantities";
import { nutritionForMass, nutritionPerServing } from "../src/lib/nutrition";
describe("fixed-point quantities", () => {
  it("preserves decimal and Croatian comma input exactly", () => {
    expect(fixed("0.1", 3) + fixed("0,2", 3)).toBe(300);
    expect(toMilligrams("1,25", "KG")).toBe(1_250_000);
    expect(toMilligrams("12.345", "G")).toBe(12345);
  });
  it("requires verified density/weight and supports liquid and pieces", () => {
    expect(() => toMilligrams("100", "ML")).toThrow();
    expect(() => toMilligrams("1", "PIECE")).toThrow();
    expect(toMilligrams("250", "ML", { densityMgPerMl: 1030 })).toBe(257500);
    expect(toMilligrams("0.25", "L", { densityMgPerMl: 1030 })).toBe(257500);
    expect(toMilligrams("2", "PIECE", { pieceWeightMg: 60000 })).toBe(120000);
  });
  it.each(["-1", "1e3", "NaN", "1.2345", "", " 1", "2147483648"])("rejects invalid/unsafe mass: %s", value => {
    expect(() => toMilligrams(value, "G")).toThrow();
  });
  it("rejects zero, rounded zero, overflow and unknown units", () => {
    expect(() => toMilligrams("0", "G")).toThrow();
    expect(() => toMilligrams("0.001", "ML", { densityMgPerMl: 1 })).toThrow();
    expect(() => toMilligrams("3000", "KG")).toThrow();
    expect(() => toMilligrams("1", "OZ" as "G")).toThrow();
  });
});
describe("deterministic nutrition", () => {
  const per100 = { calories: 37000, protein: 1300, carbs: 6000, fat: 700, fiber: 1000 };
  it("calculates 75 grams independently of an AI service", () => {
    expect(nutritionForMass(per100, 75000)).toEqual({ calories: 27750, protein: 975, carbs: 4500, fat: 525, fiber: 750 });
  });
  it("calculates fractional recipe servings and rounds only the boundary", () => {
    expect(nutritionPerServing(per100, 2500)).toEqual({ calories: 14800, protein: 520, carbs: 2400, fat: 280, fiber: 400 });
    expect(() => nutritionPerServing(per100, 0)).toThrow();
  });
  it("rejects negative nutrient values", () => expect(() => nutritionForMass({ ...per100, protein: -1 }, 1000)).toThrow());
});
