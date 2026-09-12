import { describe, expect, it } from "vitest";
import { reduceCommandExecution } from "./commandExecutionState";

describe("reduceCommandExecution", () => {
  it("initializes state on 'started' and accumulates subsequent output", () => {
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "Reset" });
    state = reduceCommandExecution(state, { type: "output", executionId: "e1", stream: "stdout", text: "hi\n" });
    expect(state).toMatchObject({ executionId: "e1", stdout: "hi\n", status: "running" });
  });

  it("does not discard output that arrives before the invoke response's 'started' dispatch, since the one-way started event already initialized state", () => {
    // Normal fast path: main's CommandStartedEvent arrives and is dispatched first.
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "Reset" });
    // Output arrives before the runCurrentStep() invoke promise has resolved.
    state = reduceCommandExecution(state, { type: "output", executionId: "e1", stream: "stdout", text: "fast output" });
    // The invoke response now resolves and dispatches its own "started" - must be a no-op.
    state = reduceCommandExecution(state, { type: "started", executionId: "e1", label: "Reset" });
    expect(state?.stdout).toBe("fast output");
  });

  it("initializes state from the invoke response's 'started' if it happens to arrive first, then still accepts the one-way started event as a no-op", () => {
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "Reset" });
    state = reduceCommandExecution(state, { type: "output", executionId: "e1", stream: "stderr", text: "early" });
    // The one-way started event for the same execution arrives later - no reset.
    state = reduceCommandExecution(state, { type: "started", executionId: "e1", label: "Reset" });
    expect(state?.stderr).toBe("early");
  });

  it("ignores output/completed for an executionId that doesn't match the current state", () => {
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "Reset" });
    state = reduceCommandExecution(state, { type: "output", executionId: "stale", stream: "stdout", text: "ignored" });
    expect(state?.stdout).toBe("");
    state = reduceCommandExecution(state, {
      type: "completed",
      executionId: "stale",
      exitCode: 0,
      signal: null
    });
    expect(state?.status).toBe("running");
  });

  it("replaces stale completed state when a new execution starts", () => {
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "First" });
    state = reduceCommandExecution(state, { type: "completed", executionId: "e1", exitCode: 0, signal: null });
    expect(state?.status).toBe("completed");

    state = reduceCommandExecution(state, { type: "started", executionId: "e2", label: "Second" });
    expect(state).toMatchObject({ executionId: "e2", status: "running", stdout: "", stderr: "" });
  });

  it("applies completed exactly once and records exitCode/signal/error", () => {
    let state = reduceCommandExecution(null, { type: "started", executionId: "e1", label: "Reset" });
    state = reduceCommandExecution(state, { type: "completed", executionId: "e1", exitCode: 2, signal: null });
    expect(state).toMatchObject({ status: "completed", exitCode: 2, signal: null });
  });
});
