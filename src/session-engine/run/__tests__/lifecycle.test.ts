import { describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { SessionEngineError } from "../../validation/errors";
import {
  activateStep,
  addInstructorNote,
  completeRun,
  createSessionRun,
  isRunAbandoned,
  isRunCompleted,
  isRunTerminal,
  pauseRun,
  prepareRunForShutdown,
  setChecklistItem,
  terminateRun
} from "../engine";
import { buildRunReport } from "../report";
import { validateSessionRunSemantics, type SessionRun } from "../schema";

const T0 = "2026-09-11T10:00:00.000Z";
const T5 = "2026-09-11T10:05:00.000Z";
const T8 = "2026-09-11T10:08:00.000Z";
const T10 = "2026-09-11T10:10:00.000Z";

function session(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Lifecycle Session",
    plannedDurationMinutes: 20,
    steps: [
      {
        id: "a",
        type: "introduction",
        title: "Step A",
        plannedDurationMinutes: 10,
        checklist: [{ id: "c1", label: "Check 1" }]
      },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 10 }
    ]
  };
}

function newRun(s: Session): SessionRun {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session: s, startedAt: T0 });
}

describe("terminateRun (Restart/Discard, Phase 9B-B)", () => {
  it("closes the open Step interval and leaves the Step 'active' as an honest historical record", () => {
    const run = newRun(session());
    const terminated = terminateRun(run, "discarded", T5);

    const stepA = terminated.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepA.status).toBe("active");
    expect(stepA.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
  });

  it("closes an open pause interval when discarding a paused run", () => {
    const paused = pauseRun(newRun(session()), T5);
    const terminated = terminateRun(paused, "discarded", T8);

    expect(terminated.pauseIntervals).toEqual([{ startedAt: T5, endedAt: T8 }]);
    const stepA = terminated.stepRuns.find((sr) => sr.stepId === "a")!;
    // Already closed by pauseRun at T5 - terminateRun must not reopen or move it.
    expect(stepA.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
  });

  it("produces a run with no completedAt", () => {
    const terminated = terminateRun(newRun(session()), "discarded", T5);
    expect(terminated.completedAt).toBeUndefined();
  });

  it("produces a terminal run distinguishable by kind", () => {
    const discarded = terminateRun(newRun(session()), "discarded", T5);
    const restarted = terminateRun(newRun(session()), "restarted", T5);

    expect(isRunTerminal(discarded)).toBe(true);
    expect(isRunAbandoned(discarded)).toBe(true);
    expect(isRunCompleted(discarded)).toBe(false);
    expect(discarded.termination).toEqual({ kind: "discarded", at: T5 });

    expect(isRunAbandoned(restarted)).toBe(true);
    expect(restarted.termination).toEqual({ kind: "restarted", at: T5 });
  });

  it("rejects further engine mutations once terminated", () => {
    const terminated = terminateRun(newRun(session()), "discarded", T5);
    const s = session();

    expect(() => activateStep(terminated, "b", T8)).toThrow(/discarded/);
    expect(() => setChecklistItem(terminated, s, "a", "c1", true)).toThrow(/discarded/);
    expect(() => addInstructorNote(terminated, s, { stepId: "a", noteId: "n1", timestamp: T8, text: "x" })).toThrow(
      /discarded/
    );
    expect(() => completeRun(terminated, T8)).toThrow(/discarded/);
    expect(() => terminateRun(terminated, "restarted", T8)).toThrow(/discarded/);
  });

  it("is rejected if the run is already completed", () => {
    const completed = completeRun(newRun(session()), T5);
    expect(() => terminateRun(completed, "discarded", T8)).toThrow(/already completed/);
  });

  it("is a shutdown no-op regardless of termination kind", () => {
    const discarded = terminateRun(newRun(session()), "discarded", T5);
    const restarted = terminateRun(newRun(session()), "restarted", T5);

    expect(prepareRunForShutdown(discarded, T8)).toBe(discarded);
    expect(prepareRunForShutdown(restarted, T8)).toBe(restarted);
  });

  it("passes validateSessionRunSemantics for both terminal kinds", () => {
    const discarded = terminateRun(newRun(session()), "discarded", T5);
    const restarted = terminateRun(pauseRun(newRun(session()), T5), "restarted", T8);
    expect(() => validateSessionRunSemantics(discarded)).not.toThrow();
    expect(() => validateSessionRunSemantics(restarted)).not.toThrow();
  });

  it("rejects a run that is somehow both completed and terminated", () => {
    const completed = completeRun(newRun(session()), T5);
    const impossible: SessionRun = { ...completed, termination: { kind: "discarded", at: T8 } };
    expect(() => validateSessionRunSemantics(impossible)).toThrow(SessionEngineError);
  });

  it("rejects a discarded/restarted run for a normal Run Report", () => {
    const discarded = terminateRun(newRun(session()), "discarded", T5);
    const restarted = terminateRun(newRun(session()), "restarted", T5);
    expect(() => buildRunReport(discarded)).toThrow(/discarded/);
    expect(() => buildRunReport(restarted)).toThrow(/restarted/);
  });

  it("still builds a normal Run Report for a genuinely completed run", () => {
    const completed = completeRun(newRun(session()), T10);
    expect(() => buildRunReport(completed)).not.toThrow();
  });

  it("rejects a note timestamped after the run's termination", () => {
    const run = newRun(session());
    const s = session();
    const withNote = addInstructorNote(run, s, { stepId: "a", noteId: "n1", timestamp: T5, text: "before" });
    const terminated = terminateRun(withNote, "discarded", T8);
    const invalid: SessionRun = {
      ...terminated,
      notes: [...terminated.notes, { id: "n2", runId: run.id, sessionId: run.sessionId, stepId: "a", timestamp: T10, text: "late" }]
    };
    expect(() => validateSessionRunSemantics(invalid)).toThrow(/later than the run's termination/);
  });
});
