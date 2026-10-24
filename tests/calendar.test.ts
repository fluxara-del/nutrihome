import { describe, it, expect } from "vitest";
import { localDate, expiryState, nextWeekStart, sundayWindow, calendarDate } from "../src/lib/calendar";
describe("Zagreb calendar", () => {
  it("uses local midnight, not UTC", () => expect(localDate(new Date("2026-06-01T22:30:00Z"))).toBe("2026-06-02"));
  it("validates calendar dates", () => {
    expect(() => calendarDate("2026-02-30")).toThrow();
    expect(() => calendarDate("2026-2-1")).toThrow();
  });
  it("keeps the expiration day usable and excludes past dates", () => {
    expect(expiryState("2026-10-23", "2026-10-24")).toBe("expired");
    expect(expiryState("2026-10-24", "2026-10-24")).toBe("soon");
    expect(expiryState("2026-10-27", "2026-10-24")).toBe("soon");
    expect(expiryState("2026-10-28", "2026-10-24")).toBe("fresh");
    expect(expiryState(null, "2026-10-24")).toBe("unknown");
  });
  it.each([
    ["2026-03-29T05:59:00Z", false], ["2026-03-29T06:00:00Z", true],
    ["2026-03-29T07:00:00Z", false], ["2026-10-25T06:59:00Z", false],
    ["2026-10-25T07:00:00Z", true], ["2026-10-25T08:00:00Z", false],
    ["2026-10-26T07:00:00Z", false],
  ])("Sunday window %s → %s", (instant, expected) => expect(sundayWindow(new Date(instant))).toBe(expected));
  it("handles next week over DST, year boundary and Monday reruns", () => {
    expect(nextWeekStart(new Date("2026-10-25T07:00:00Z"))).toBe("2026-10-26");
    expect(nextWeekStart(new Date("2026-03-29T06:00:00Z"))).toBe("2026-03-30");
    expect(nextWeekStart(new Date("2026-10-26T10:00:00Z"))).toBe("2026-11-02");
    expect(nextWeekStart(new Date("2028-12-31T07:00:00Z"))).toBe("2029-01-01");
  });
});
