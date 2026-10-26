import { describe, expect, it } from "vitest";
import { addDays, daysBetween, learningDay, weekRange, weekStartOf } from "@/lib/time";

describe("Riyadh learning day", () => {
  it("rolls over at midnight Asia/Riyadh (UTC+3), not UTC", () => {
    expect(learningDay(new Date("2026-10-24T20:59:59Z"))).toBe("2026-10-24"); // 23:59 Riyadh
    expect(learningDay(new Date("2026-10-24T21:00:00Z"))).toBe("2026-10-25"); // 00:00 Riyadh
  });
  it("computes day arithmetic", () => {
    expect(daysBetween("2026-10-20", "2026-10-25")).toBe(5);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("weeks run Sunday → Saturday", () => {
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25"); // Sunday
    expect(weekStartOf("2026-10-31")).toBe("2026-10-25"); // Saturday
    expect(weekRange("2026-10-28")).toEqual({ start: "2026-10-25", end: "2026-10-31" });
  });
});
