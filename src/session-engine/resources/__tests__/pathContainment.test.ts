import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWithinRoot } from "../pathContainment";
import { SessionEngineError } from "../../validation/errors";

describe("resolveWithinRoot", () => {
  const root = join("some", "trusted", "root");

  it("resolves a target inside the root", () => {
    const resolved = resolveWithinRoot(root, join("worksheets", "sample.pdf"));
    expect(resolved).toBe(resolve(root, "worksheets", "sample.pdf"));
  });

  it("resolves the root itself for a '.' target", () => {
    expect(resolveWithinRoot(root, ".")).toBe(resolve(root));
  });

  it("rejects a '../' escape", () => {
    expect(() => resolveWithinRoot(root, join("..", "escape.txt"))).toThrow(SessionEngineError);
  });

  it("rejects a deeply nested '../../' escape", () => {
    expect(() => resolveWithinRoot(root, join("sub", "..", "..", "escape.txt"))).toThrow(/escapes/);
  });

  it("rejects a sibling directory that only shares a string prefix with the root", () => {
    // root = ".../trusted/root", escape target resolves to ".../trusted/root-other/file.txt" -
    // a naive resolved.startsWith(root) check would wrongly accept this.
    expect(() => resolveWithinRoot(root, join("..", "root-other", "file.txt"))).toThrow(/escapes/);
  });

  it("rejects an absolute target path outright, regardless of root", () => {
    const absoluteEscape = join("/etc", "passwd");
    expect(() => resolveWithinRoot(root, absoluteEscape)).toThrow(SessionEngineError);
  });

  it("includes the Resource label in the error message when provided", () => {
    expect(() => resolveWithinRoot(root, "../escape.txt", "Starter Collection")).toThrow(/Starter Collection/);
  });
});
