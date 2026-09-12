import { describe, expect, it, vi } from "vitest";
import { runCommandProcess } from "../commandProcess";
import type { CommandExecutionPlan } from "../../session-engine";

// ESM module namespaces aren't directly spy-able (vi.spyOn on an import fails with
// "Module namespace is not configurable"), so spawn is wrapped as a real vi.fn()
// via vi.mock + importOriginal - it still runs the actual implementation, just
// observably.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});
const { spawn: spawnMock } = await import("node:child_process");

function run(plan: CommandExecutionPlan): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  error?: string;
}> {
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    runCommandProcess(plan, {
      onStdout: (text) => {
        stdout += text;
      },
      onStderr: (text) => {
        stderr += text;
      },
      onCompleted: (completion) => {
        resolvePromise({ stdout, stderr, ...completion });
      }
    });
  });
}

describe("runCommandProcess", () => {
  it("executes a benign node command and reports exit code 0", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: ["-e", "console.log('hello')"],
      cwd: process.cwd()
    };
    const result = await run(plan);
    expect(result.stdout).toContain("hello");
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("receives stdout and stderr as separate streams", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: ["-e", "console.log('out-line'); console.error('err-line')"],
      cwd: process.cwd()
    };
    const result = await run(plan);
    expect(result.stdout).toContain("out-line");
    expect(result.stdout).not.toContain("err-line");
    expect(result.stderr).toContain("err-line");
    expect(result.stderr).not.toContain("out-line");
  });

  it("reports a nonzero exit code as a normal completion, not a thrown error", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: ["-e", "process.exit(3)"],
      cwd: process.cwd()
    };
    const result = await run(plan);
    expect(result.exitCode).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it("reports a clean completion error for a nonexistent executable", async () => {
    const plan: CommandExecutionPlan = {
      executable: "definitely-not-a-real-executable-xyz",
      args: [],
      cwd: process.cwd()
    };
    const result = await run(plan);
    expect(result.exitCode).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("fires onCompleted exactly once even under error/close interaction", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: ["-e", "console.log('once')"],
      cwd: process.cwd()
    };
    let completions = 0;
    await new Promise<void>((resolvePromise) => {
      runCommandProcess(plan, {
        onStdout: () => undefined,
        onStderr: () => undefined,
        onCompleted: () => {
          completions += 1;
          resolvePromise();
        }
      });
    });
    expect(completions).toBe(1);
  });

  it("always spawns with shell:false, regardless of the plan", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: ["-e", "process.exit(0)"],
      cwd: process.cwd()
    };
    await run(plan);
    expect(spawnMock).toHaveBeenCalledWith(
      plan.executable,
      plan.args,
      expect.objectContaining({ shell: false, cwd: plan.cwd })
    );
  });

  it("handles a synchronous spawn throw as one clean completion", async () => {
    const plan: CommandExecutionPlan = {
      executable: process.execPath,
      args: [],
      cwd: process.cwd()
    };
    vi.mocked(spawnMock).mockImplementationOnce(() => {
      throw new Error("simulated synchronous spawn failure");
    });

    let completions = 0;
    const result = await new Promise<{ exitCode: number | null; error?: string }>((resolvePromise) => {
      runCommandProcess(plan, {
        onStdout: () => undefined,
        onStderr: () => undefined,
        onCompleted: (completion) => {
          completions += 1;
          resolvePromise(completion);
        }
      });
    });

    expect(result.exitCode).toBeNull();
    expect(result.error).toContain("simulated synchronous spawn failure");
    expect(completions).toBe(1);
  });
});
