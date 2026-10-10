import { describe, expect, it } from "vitest";
import { localIsoDate } from "./local-date";
describe("localIsoDate", () => {
  it("uses local calendar parts rather than UTC conversion", () => {
    const date = new Date();
    date.getFullYear = () => 2026;
    date.getMonth = () => 9;
    date.getDate = () => 10;
    date.toISOString = () => "2026-10-09T16:01:00.000Z";
    expect(localIsoDate(date)).toBe("2026-10-10");
  });
});
