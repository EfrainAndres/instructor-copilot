import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { SessionEngineError } from "../../validation/errors";
import { addInstructorNote, completeRun, createSessionRun, pauseRun } from "../engine";
import { loadSessionRun, saveSessionRun } from "../persistence";
import { validateSessionRunSemantics, type SessionRun } from "../schema";

const T0 = "2026-09-11T10:00:00.000Z";
const T5 = "2026-09-11T10:05:00.000Z";
const T10 = "2026-09-11T10:10:00.000Z";
const BEFORE_T0 = "2026-09-11T09:59:00.000Z";
const AFTER_T10 = "2026-09-11T10:11:00.000Z";

function session(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Notes Session",
    plannedDurationMinutes: 20,
    steps: [
      { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 10 },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 10 }
    ]
  };
}

function newRun(s: Session): SessionRun {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session: s, startedAt: T0 });
}

describe("addInstructorNote", () => {
  it("creates a note with the correct id/run/session/step/timestamp/text", () => {
    const s = session();
    const run = newRun(s);
    const next = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "Hello" });

    expect(next.notes).toHaveLength(1);
    const note = next.notes[0]!;
    expect(note.id).toBe("note-1");
    expect(note.runId).toBe(run.id);
    expect(note.sessionId).toBe(run.sessionId);
    expect(note.stepId).toBe("a");
    expect(note.timestamp).toBe(T5);
    expect(note.text).toBe("Hello");
  });

  it("trims stored text", () => {
    const s = session();
    const run = newRun(s);
    const next = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "  spaced out  " });
    expect(next.notes[0]!.text).toBe("spaced out");
  });

  it("rejects whitespace-only text", () => {
    const s = session();
    const run = newRun(s);
    expect(() => addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "   " })).toThrow(
      SessionEngineError
    );
  });

  it("rejects an unknown Step", () => {
    const s = session();
    const run = newRun(s);
    expect(() =>
      addInstructorNote(run, s, { stepId: "does-not-exist", noteId: "note-1", timestamp: T5, text: "Hi" })
    ).toThrow(SessionEngineError);
  });

  it("is allowed while paused and does not change timing", () => {
    const s = session();
    let run = newRun(s);
    run = pauseRun(run, T5);
    const stepABefore = run.stepRuns.find((sr) => sr.stepId === "a")!;

    const next = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "Paused note" });

    expect(next.notes).toHaveLength(1);
    expect(next.stepRuns.find((sr) => sr.stepId === "a")).toEqual(stepABefore);
    expect(next.pauseIntervals).toEqual(run.pauseIntervals);
  });

  it("rejects adding a note after completion", () => {
    const s = session();
    let run = newRun(s);
    run = completeRun(run, T10);
    expect(() => addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T10, text: "Too late" })).toThrow(
      SessionEngineError
    );
  });
});

describe("validateSessionRunSemantics - InstructorNote checks", () => {
  it("rejects duplicate note ids", () => {
    const s = session();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "First" });
    const duplicated: SessionRun = {
      ...run,
      notes: [...run.notes, { ...run.notes[0]!, timestamp: T5, text: "Second" }]
    };
    expect(() => validateSessionRunSemantics(duplicated)).toThrow(/duplicate InstructorNote/);
  });

  it("rejects a note.runId mismatch", () => {
    const s = session();
    const run = newRun(s);
    const bad: SessionRun = {
      ...run,
      notes: [{ id: "note-1", runId: "some-other-run", sessionId: run.sessionId, stepId: "a", timestamp: T5, text: "x" }]
    };
    expect(() => validateSessionRunSemantics(bad)).toThrow(/runId/);
  });

  it("rejects a note.sessionId mismatch", () => {
    const s = session();
    const run = newRun(s);
    const bad: SessionRun = {
      ...run,
      notes: [{ id: "note-1", runId: run.id, sessionId: "some-other-session", stepId: "a", timestamp: T5, text: "x" }]
    };
    expect(() => validateSessionRunSemantics(bad)).toThrow(/sessionId/);
  });

  it("rejects a note.stepId not present in the run", () => {
    const s = session();
    const run = newRun(s);
    const bad: SessionRun = {
      ...run,
      notes: [{ id: "note-1", runId: run.id, sessionId: run.sessionId, stepId: "not-a-step", timestamp: T5, text: "x" }]
    };
    expect(() => validateSessionRunSemantics(bad)).toThrow(/unknown Step/);
  });

  it("rejects a note timestamp earlier than SessionRun.startedAt", () => {
    const s = session();
    const run = newRun(s);
    const bad: SessionRun = {
      ...run,
      notes: [{ id: "note-1", runId: run.id, sessionId: run.sessionId, stepId: "a", timestamp: BEFORE_T0, text: "x" }]
    };
    expect(() => validateSessionRunSemantics(bad)).toThrow(/earlier than SessionRun.startedAt/);
  });

  it("rejects a note timestamp later than SessionRun.completedAt", () => {
    const s = session();
    let run = newRun(s);
    run = completeRun(run, T10);
    const bad: SessionRun = {
      ...run,
      notes: [{ id: "note-1", runId: run.id, sessionId: run.sessionId, stepId: "a", timestamp: AFTER_T10, text: "x" }]
    };
    expect(() => validateSessionRunSemantics(bad)).toThrow(/later than SessionRun.completedAt/);
  });

  it("does not require notes for every Step, and note order is not significant", () => {
    const s = session();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-2", timestamp: T5, text: "second in id order" });
    run = { ...run, notes: [...run.notes] };
    // Only one Step has a note; the other has none. Order in the array is arbitrary.
    expect(() => validateSessionRunSemantics(run)).not.toThrow();
  });
});

describe("note save/load round-trip and shutdown/recovery persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-notes-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("round-trips a run with notes through save/load exactly", async () => {
    const s = session();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "Persisted note" });

    await saveSessionRun(tempDir, run);
    const reloaded = await loadSessionRun(tempDir, run.id);

    expect(reloaded).toEqual(run);
    expect(reloaded.notes).toEqual([
      { id: "note-1", runId: run.id, sessionId: run.sessionId, stepId: "a", timestamp: T5, text: "Persisted note" }
    ]);
  });

  it("preserves a note across a shutdown-suspend/reload cycle (Phase 6B recovery path)", async () => {
    const s = session();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T5, text: "Before shutdown" });
    run = pauseRun(run, T10); // stand-in for prepareRunForShutdown's pause

    await saveSessionRun(tempDir, run);
    const recovered = await loadSessionRun(tempDir, run.id);

    expect(recovered.notes).toEqual(run.notes);
    expect(recovered.notes.find((n) => n.id === "note-1")?.text).toBe("Before shutdown");
  });
});
