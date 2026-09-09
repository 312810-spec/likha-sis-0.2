import { describe, expect, it } from "vitest";
import {
  PHILIPPINE_HOLIDAYS_SY_2025_2026,
  findHoliday,
  holidaysInRange,
  isNonWorkingDay,
} from "./ph-holidays";

describe("PHILIPPINE_HOLIDAYS_SY_2025_2026", () => {
  it("is sourced, non-empty reference data", () => {
    expect(PHILIPPINE_HOLIDAYS_SY_2025_2026.length).toBeGreaterThan(10);
  });
});

describe("findHoliday", () => {
  it("finds a known regular holiday", () => {
    expect(findHoliday("2026-01-01")?.name).toBe("New Year's Day");
  });

  it("returns null for a non-holiday date", () => {
    expect(findHoliday("2026-01-02")).toBeNull();
  });
});

describe("holidaysInRange", () => {
  it("returns holidays within an inclusive date range", () => {
    const result = holidaysInRange("2025-12-01", "2025-12-31");
    expect(result.map((h) => h.date)).toEqual([
      "2025-12-08",
      "2025-12-25",
      "2025-12-30",
      "2025-12-31",
    ]);
  });
});

describe("isNonWorkingDay", () => {
  it("is true for a regular holiday", () => {
    expect(isNonWorkingDay("2025-12-25")).toBe(true);
  });

  it("is false for an ordinary school day", () => {
    expect(isNonWorkingDay("2026-01-15")).toBe(false);
  });
});
