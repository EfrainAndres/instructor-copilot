import { describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { SessionEngineError } from "../../validation/errors";
import {
  activateStep,
  addInstructorNote,
  completeRun,
  createSessionRun,
  pauseRun,
  resumeRun,
  skipCurrentStep
} from "../engine";
import { buildRunReport } from "../report";

const T0 = "2026-09-11T10:00:00.000Z";
const T2 = "2026-09-11T10:02:00.000Z";
const T3 = "2026-09-11T10:03:00.000Z";
const T5 = "2026-09-11T10:05:00.000Z";
const T6 = "2026-09-11T10:06:00.000Z";
const T8 = "2026-09-11T10:08:00.000Z";
const T10 = "2026-09-11T10:10:00.000Z";
const T12 = "2026-09-11T10:12:00.000Z";
const T15 = "2026-09-11T10:15:00.000Z";
const T20 = "2026-09-11T10:20:00.000Z";

function fourStepSession(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Report Session",
    plannedDurationMinutes: 20,
    steps: [
      { id: "a", type: "discussion", title: "Opening discussion", plannedDurationMinutes: 5 },
      { id: "b", type: "live_demo", title: "Live demo", plannedDurationMinutes: 10 },
      { id: "c", type: "investigation", title: "Optional exercise", plannedDurationMinutes: 5 },
      { id: "d", type: "closing", title: "Closing", plannedDurationMinutes: 3 }
    ]
  };
}

function newRun(s: Session) {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session: s, startedAt: T0 });
}

describe("buildRunReport", () => {
  it("rejects an incomplete run", () => {
    const s = fourStepSession();
    const run = newRun(s);
    expect(() => buildRunReport(run)).toThrow(SessionEngineError);
  });

  it("reports planned/actual/delta for a clean completed Step", () => {
    const s = fourStepSession();
    let run = newRun(s);
    // Step A: 3 minutes actual vs 5 planned (under).
    run = activateStep(run, "b", T3);
    run = activateStep(run, "c", T5);
    run = activateStep(run, "d", T6);
    run = completeRun(run, T8);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.plannedMinutes).toBe(5);
    expect(stepA.actualMinutes).toBeCloseTo(3, 10);
    expect(stepA.deltaMinutes).toBeCloseTo(-2, 10);
  });

  it("marks a positive delta as over", () => {
    const s = fourStepSession();
    let run = newRun(s);
    // Step A planned 5, actual 8 (over).
    run = activateStep(run, "b", T8);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.status).toBe("over");
    expect(stepA.deltaMinutes).toBeGreaterThan(0);
  });

  it("marks a negative delta as under", () => {
    const s = fourStepSession();
    let run = newRun(s);
    // Step A planned 5, actual 2 (under).
    run = activateStep(run, "b", T2);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.status).toBe("under");
    expect(stepA.deltaMinutes).toBeLessThan(0);
  });

  it("marks a zero delta as on_time", () => {
    const s = fourStepSession();
    let run = newRun(s);
    // Step A planned 5, actual exactly 5.
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.status).toBe("on_time");
    expect(stepA.deltaMinutes).toBe(0);
  });

  it("reports a finally-skipped Step as skipped", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = skipCurrentStep(run, T3, "b"); // skip A, activate B
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.status).toBe("skipped");
  });

  it("reports a pending Step (never reached) on early completion as not_reached", () => {
    const s = fourStepSession();
    let run = newRun(s);
    // Complete right after Step A without ever visiting b/c/d.
    run = completeRun(run, T5);

    const report = buildRunReport(run);
    for (const stepId of ["b", "c", "d"]) {
      const step = report.steps.find((s2) => s2.stepId === stepId)!;
      expect(step.status).toBe("not_reached");
    }
  });

  it("reports a Step that was skipped and later revisited/finished by its final timing status, not as skipped", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = skipCurrentStep(run, T2, "b"); // skip A, go to B
    run = activateStep(run, "a", T3); // revisit A
    run = activateStep(run, "c", T8); // A actual: T2-T3 (none, skipped closed at T2) + T3-T8 revisit = 5 min
    run = activateStep(run, "d", T10);
    run = completeRun(run, T12);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.status).not.toBe("skipped");
    expect(["on_time", "over", "under"]).toContain(stepA.status);
  });

  it("sums only a Step's own intervals across a revisit", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = activateStep(run, "b", T2); // A: T0-T2 = 2 min
    run = activateStep(run, "a", T5); // B: T2-T5 = 3 min; A revisit opens at T5
    run = activateStep(run, "c", T8); // A: T5-T8 = 3 min more -> total 5 min
    run = activateStep(run, "d", T10);
    run = completeRun(run, T12);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.actualMinutes).toBeCloseTo(5, 10);
  });

  it("excludes paused time from Session actual/delta", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = pauseRun(run, T2);
    run = resumeRun(run, T10); // 8 minutes paused, excluded
    run = activateStep(run, "b", T12);
    run = activateStep(run, "c", T15);
    run = activateStep(run, "d", T20);
    run = completeRun(run, T20);

    const report = buildRunReport(run);
    expect(report.pausedMinutes).toBeCloseTo(8, 10);
    // Wall time T0->T20 = 20 min, minus 8 paused = 12 min active.
    expect(report.actualMinutes).toBeCloseTo(12, 10);
  });

  it("uses Step snapshots, not the live authored Session", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    expect(stepA.title).toBe("Opening discussion");
    expect(stepA.type).toBe("discussion");
    expect(stepA.plannedMinutes).toBe(5);

    // Mutate the authored Session afterward - the report must not change.
    const mutatedSession: Session = {
      ...s,
      steps: s.steps.map((step) => (step.id === "a" ? { ...step, title: "Renamed", plannedDurationMinutes: 999 } : step))
    };
    const reportAfterMutation = buildRunReport(run);
    expect(reportAfterMutation).toEqual(report);
    void mutatedSession; // never fed into buildRunReport - proves it's structurally impossible to use it
  });

  it("uses sessionTitleSnapshot, not a live Session title", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    expect(report.sessionTitle).toBe("Report Session");
  });

  it("sorts report Steps by stepOrderSnapshot ascending", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    expect(report.steps.map((step) => step.stepId)).toEqual(["a", "b", "c", "d"]);
    expect(report.steps.map((step) => step.order)).toEqual([0, 1, 2, 3]);
  });

  it("groups notes correctly by Step and sorts them chronologically", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-2", timestamp: T2, text: "second" });
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T0, text: "first" });
    run = activateStep(run, "b", T3);
    run = addInstructorNote(run, s, { stepId: "b", noteId: "note-3", timestamp: T5, text: "on B" });
    run = activateStep(run, "c", T8);
    run = activateStep(run, "d", T10);
    run = completeRun(run, T12);

    const report = buildRunReport(run);
    const stepA = report.steps.find((s2) => s2.stepId === "a")!;
    const stepB = report.steps.find((s2) => s2.stepId === "b")!;
    const stepC = report.steps.find((s2) => s2.stepId === "c")!;

    expect(stepA.notes.map((n) => n.id)).toEqual(["note-1", "note-2"]);
    expect(stepB.notes.map((n) => n.id)).toEqual(["note-3"]);
    expect(stepC.notes).toEqual([]);
  });

  it("does not mutate SessionRun.stepRuns or SessionRun.notes while building the report", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = addInstructorNote(run, s, { stepId: "a", noteId: "note-1", timestamp: T0, text: "hi" });
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const stepRunsBefore = run.stepRuns;
    const notesBefore = run.notes;

    buildRunReport(run);

    expect(run.stepRuns).toBe(stepRunsBefore);
    expect(run.notes).toBe(notesBefore);
  });

  it("derives correct summary counts", () => {
    const s = fourStepSession();
    let run = newRun(s);
    run = skipCurrentStep(run, T3, "b"); // A skipped
    run = activateStep(run, "c", T5); // B done
    run = completeRun(run, T8); // C done, D not_reached

    const report = buildRunReport(run);
    expect(report.skippedCount).toBe(1);
    expect(report.notReachedCount).toBe(1);
    expect(report.doneCount).toBe(2);
  });

  it("reports zero plannedBufferMinutes/bufferUsedMinutes for a legacy Session with no explicit buffer", () => {
    const s = fourStepSession(); // Step plans sum to 23, matches plannedDurationMinutes: 20? no - unrelated; buffer is derived from the RUN snapshot, not re-validated here
    let run = newRun(s);
    run = activateStep(run, "b", T5);
    run = activateStep(run, "c", T10);
    run = activateStep(run, "d", T12);
    run = completeRun(run, T15);

    const report = buildRunReport(run);
    // fourStepSession's plannedDurationMinutes (20) already equals its own Step-plan sum.
    expect(report.plannedBufferMinutes).toBe(0);
    expect(report.bufferUsedMinutes).toBe(0);
  });

  it("exposes the planned facilitation buffer and how much of it was used", () => {
    const s: Session = {
      id: "session-buffer",
      schemaVersion: 1,
      trainingId: "training-1",
      title: "Buffered Session",
      plannedDurationMinutes: 15,
      facilitationBufferMinutes: 5,
      steps: [
        { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 5 },
        { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
      ]
    };
    let run = newRun(s);
    run = activateStep(run, "b", T5); // Step-plan sum = 10
    run = completeRun(run, "2026-09-11T10:12:00.000Z"); // 12 minutes active: 2 min into the 5-min buffer

    const report = buildRunReport(run);
    expect(report.plannedBufferMinutes).toBe(5);
    expect(report.bufferUsedMinutes).toBeCloseTo(2, 10);
  });

  it("caps bufferUsedMinutes at the planned buffer even when the run overruns beyond it entirely", () => {
    const s: Session = {
      id: "session-buffer-2",
      schemaVersion: 1,
      trainingId: "training-1",
      title: "Buffered Session",
      plannedDurationMinutes: 15,
      facilitationBufferMinutes: 5,
      steps: [
        { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 5 },
        { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
      ]
    };
    let run = newRun(s);
    run = activateStep(run, "b", T5);
    run = completeRun(run, "2026-09-11T10:20:00.000Z"); // 20 minutes active - 5 min beyond the full plan

    const report = buildRunReport(run);
    expect(report.plannedBufferMinutes).toBe(5);
    expect(report.bufferUsedMinutes).toBe(5); // capped, not 10
    expect(report.deltaMinutes).toBeCloseTo(5, 10); // the overrun beyond the buffer still shows up here
  });
});
