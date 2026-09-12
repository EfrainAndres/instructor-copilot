import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandAction } from "../../model/schema";
import { buildCommandExecutionPlan } from "../commandExecutionPlan";
import { SessionEngineError } from "../../validation/errors";

function command(overrides: Partial<CommandAction> = {}): CommandAction {
  return {
    id: "reset-env",
    label: "Reset environment",
    executable: "node",
    args: ["scripts/reset.mjs", "defect-a"],
    root: "content",
    cwd: "scripts",
    ...overrides
  };
}

describe("buildCommandExecutionPlan", () => {
  const root = join("some", "trusted", "content-root");

  it("resolves cwd inside the root and preserves executable/args exactly", () => {
    const plan = buildCommandExecutionPlan(command(), root);
    expect(plan.executable).toBe("node");
    expect(plan.args).toEqual(["scripts/reset.mjs", "defect-a"]);
    expect(plan.cwd).toBe(resolve(root, "scripts"));
  });

  it("preserves each arg as a separate array entry, never joined into a string", () => {
    const plan = buildCommandExecutionPlan(command({ args: ["--flag", "value with spaces"] }), root);
    expect(plan.args).toEqual(["--flag", "value with spaces"]);
    expect(Array.isArray(plan.args)).toBe(true);
  });

  it("defaults args to an empty array when omitted", () => {
    const { args: _args, ...withoutArgs } = command();
    const plan = buildCommandExecutionPlan(withoutArgs as CommandAction, root);
    expect(plan.args).toEqual([]);
  });

  it("rejects a cwd that escapes the root via '../'", () => {
    expect(() => buildCommandExecutionPlan(command({ cwd: "../escape" }), root)).toThrow(SessionEngineError);
  });

  it("rejects an absolute cwd outright", () => {
    expect(() => buildCommandExecutionPlan(command({ cwd: join("/etc") }), root)).toThrow(SessionEngineError);
  });
});
