import { describe, expect, it } from "vitest";
import { formatMinutesAsClock, formatScheduleDelta } from "./timeFormat";

describe("formatMinutesAsClock", () => {
  it("formats sub-hour durations as MM:SS", () => {
    expect(formatMinutesAsClock(0)).toBe("00:00");
    expect(formatMinutesAsClock(6.483333333)).toBe("06:29");
    expect(formatMinutesAsClock(59.99)).toBe("59:59");
  });

  it("formats hour-plus durations as H:MM:SS", () => {
    expect(formatMinutesAsClock(60)).toBe("1:00:00");
    expect(formatMinutesAsClock(90.5)).toBe("1:30:30");
  });

  it("never shows a negative duration", () => {
    expect(formatMinutesAsClock(-5)).toBe("00:00");
  });
});

describe("formatScheduleDelta", () => {
  it("reports ON PLAN with a 'before checkpoint' detail when delta <= 0", () => {
    expect(formatScheduleDelta(-3)).toEqual({ status: "ON PLAN", detail: "03:00 before checkpoint" });
    expect(formatScheduleDelta(0)).toEqual({ status: "ON PLAN", detail: "00:00 before checkpoint" });
  });

  it("reports BEHIND with a 'behind' detail when delta > 0", () => {
    expect(formatScheduleDelta(3)).toEqual({ status: "BEHIND", detail: "03:00 behind" });
  });
});
