import { describe, expect, it } from "vitest";
import { christmasCountdown } from "../src/domain/calendar";

describe("christmasCountdown", () => {
  it("counts down to December 25 of this year", () => {
    expect(christmasCountdown(new Date(2026, 10, 27))).toBe("28 days until Christmas");
    expect(christmasCountdown(new Date(2026, 11, 24))).toBe("1 day until Christmas");
  });

  it("names Christmas day itself", () => {
    expect(christmasCountdown(new Date(2026, 11, 25))).toBe("Christmas is today");
  });

  it("rolls to next year after Christmas", () => {
    expect(christmasCountdown(new Date(2026, 11, 26))).toBe("364 days until Christmas");
  });
});