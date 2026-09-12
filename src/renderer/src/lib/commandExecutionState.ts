import { appendWithCap, DEFAULT_OUTPUT_CAP_CHARS } from "./commandOutputBuffer";

export interface CommandExecutionState {
  executionId: string;
  label: string;
  stdout: string;
  stderr: string;
  status: "running" | "completed";
  exitCode?: number | null;
  signal?: string | null;
  error?: string;
}

export type CommandExecutionAction =
  | { type: "started"; executionId: string; label: string }
  | { type: "output"; executionId: string; stream: "stdout" | "stderr"; text: string }
  | { type: "completed"; executionId: string; exitCode: number | null; signal: string | null; error?: string };

/**
 * Pure state machine for one command execution's lifecycle, driven by whichever
 * of two sources learns about a new executionId first: the one-way
 * CommandStartedEvent (sent by main before spawning) or the runCurrentStep()
 * invoke response (which also carries executionId, but may resolve later due to
 * IPC round-trip timing). Both sources dispatch the same "started" action, and
 * initialization is idempotent - whichever arrives first creates the state, and
 * a later duplicate for the same executionId is a no-op, so accumulated output
 * is never reset or discarded. output/completed for an unknown or stale
 * executionId are ignored rather than buffered.
 */
export function reduceCommandExecution(
  state: CommandExecutionState | null,
  action: CommandExecutionAction,
  outputCap: number = DEFAULT_OUTPUT_CAP_CHARS
): CommandExecutionState | null {
  switch (action.type) {
    case "started":
      if (state && state.executionId === action.executionId) {
        return state;
      }
      return {
        executionId: action.executionId,
        label: action.label,
        stdout: "",
        stderr: "",
        status: "running"
      };
    case "output": {
      if (!state || state.executionId !== action.executionId) {
        return state;
      }
      return action.stream === "stdout"
        ? { ...state, stdout: appendWithCap(state.stdout, action.text, outputCap) }
        : { ...state, stderr: appendWithCap(state.stderr, action.text, outputCap) };
    }
    case "completed": {
      if (!state || state.executionId !== action.executionId) {
        return state;
      }
      return { ...state, status: "completed", exitCode: action.exitCode, signal: action.signal, error: action.error };
    }
  }
}
