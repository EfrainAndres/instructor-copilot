import { describe, expect, it } from "vitest";
import { appendWithCap } from "./commandOutputBuffer";

describe("appendWithCap", () => {
  it("appends normally when under the cap", () => {
    expect(appendWithCap("hello ", "world", 100)).toBe("hello world");
  });

  it("truncates from the front and prefixes a marker once the cap is exceeded", () => {
    const marker = "[earlier output truncated]\n";
    const result = appendWithCap("a".repeat(50), "b".repeat(60), 80);
    expect(result.length).toBe(80);
    expect(result.startsWith(marker)).toBe(true);
    expect(result.slice(marker.length)).toBe("b".repeat(80 - marker.length));
  });

  it("respects a custom configured maximum", () => {
    const result = appendWithCap("", "x".repeat(1000), 200);
    expect(result.length).toBe(200);
  });
});
