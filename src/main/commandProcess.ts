import { spawn } from "node:child_process";
import type { CommandExecutionPlan } from "../session-engine";

export interface CommandProcessCompletion {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
}

export interface CommandProcessCallbacks {
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
  onCompleted: (completion: CommandProcessCompletion) => void;
}

/**
 * Spawns exactly `plan.executable`/`plan.args` - never a shell string - with
 * shell explicitly false. No caller-provided spawn options exist; this is the
 * only place that constructs them. A nonzero exit code is a normal completion,
 * not a thrown error; only a failure to start the process (e.g. ENOENT) becomes
 * a completion with `error` set. `onCompleted` fires exactly once.
 */
export function runCommandProcess(plan: CommandExecutionPlan, callbacks: CommandProcessCallbacks): void {
  let completed = false;
  function complete(result: CommandProcessCompletion): void {
    if (completed) return;
    completed = true;
    callbacks.onCompleted(result);
  }

  let child;
  try {
    child = spawn(plan.executable, plan.args, {
      cwd: plan.cwd,
      shell: false,
      windowsHide: true
    });
  } catch (error) {
    complete({ exitCode: null, signal: null, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => callbacks.onStdout(chunk));
  child.stderr.on("data", (chunk: string) => callbacks.onStderr(chunk));

  child.on("error", (error) => {
    complete({ exitCode: null, signal: null, error: error.message });
  });

  child.on("close", (exitCode, signal) => {
    complete({ exitCode, signal });
  });
}
