import { describe, expect, it } from "vitest";
import { isValidCoordinate } from "./school-coordinates";

describe("isValidCoordinate", () => {
  it("accepts a valid coordinate", () => {
    expect(isValidCoordinate(14.5995, 120.9842)).toBe(true);
  });

  it("accepts boundary values", () => {
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
  });

  it("rejects an out-of-range latitude", () => {
    expect(isValidCoordinate(90.1, 0)).toBe(false);
    expect(isValidCoordinate(-90.1, 0)).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    expect(isValidCoordinate(0, 180.1)).toBe(false);
    expect(isValidCoordinate(0, -180.1)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidCoordinate(NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, Infinity)).toBe(false);
  });
});
