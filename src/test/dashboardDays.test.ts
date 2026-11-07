import { describe, expect, it } from "vitest";
import { dashboardDays } from "../lib/dashboardDays";

describe("dashboard seven-day sales range", () => {
  it("includes all of Sunday 1 November, not just sales after the current time", () => {
    const sunday = dashboardDays(new Date("2026-11-07T15:49:00Z"))[0];
    expect(sunday.day).toBe("Sun");
    expect(sunday.start.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(sunday.end.toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(new Date("2026-11-01T05:00:00Z") >= sunday.start).toBe(true);
  });

  it("uses the Indian date when UTC is still the previous day", () => {
    const days = dashboardDays(new Date("2026-11-06T20:00:00Z"));
    expect(days[6].day).toBe("Sat");
    expect(days[6].start.toISOString()).toBe("2026-11-06T18:30:00.000Z");
  });
});