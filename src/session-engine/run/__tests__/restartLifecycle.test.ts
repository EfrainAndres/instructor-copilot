import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import {
  activateStep,
  completeRun,
  createSessionRun,
  isRunPaused,
  pauseRun,
  prepareRunForShutdown,
  releaseEvidenceStage,
  resumeRun,
  setChecklistItem
} from "../engine";
import { loadSessionRun, saveSessionRun } from "../persistence";
import { sessionActiveElapsedMinutes, stepActualDurationMinutes } from "../timing";

const T0 = "2026-09-11T10:00:00.000Z"; // Step A activates
const SHUTDOWN = "2026-09-11T10:20:00.000Z"; // instructor quits after 20 minutes on Step A
const RESTART_CHECK = "2026-09-11T10:30:00.000Z"; // app relaunched 10 minutes later, still paused
const RESUME_AT = "2026-09-11T10:31:00.000Z"; // instructor clicks Resume

function session(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Restart Session",
    plannedDurationMinutes: 20,
    steps: [
      {
        id: "a",
        type: "live_demo",
        title: "Step A",
        plannedDurationMinutes: 20,
        checklist: [{ id: "c1", label: "Check 1" }],
        evidenceStages: [
          { id: "ev1", label: "Evidence 1", order: 1, detail: "Detail 1" },
          { id: "ev2", label: "Evidence 2", order: 2, detail: "Detail 2" }
        ]
      },
      { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

function newRun(s: Session) {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session: s, startedAt: T0 });
}

describe("prepareRunForShutdown", () => {
  it("creates exactly one open pause interval and closes the Step active interval for an unpaused run", () => {
    const run = newRun(session());
    const suspended = prepareRunForShutdown(run, SHUTDOWN);

    expect(isRunPaused(suspended)).toBe(true);
    expect(suspended.pauseIntervals).toEqual([{ startedAt: SHUTDOWN }]);

    const stepA = suspended.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepA.status).toBe("active");
    expect(stepA.activeIntervals).toEqual([{ startedAt: T0, endedAt: SHUTDOWN }]);
  });

  it("is a no-op (same reference) when the run is already paused", () => {
    const run = pauseRun(newRun(session()), SHUTDOWN);
    const suspended = prepareRunForShutdown(run, RESTART_CHECK);
    expect(suspended).toBe(run);
  });

  it("is a no-op (same reference) when the run is already completed", () => {
    const run = completeRun(newRun(session()), SHUTDOWN);
    const suspended = prepareRunForShutdown(run, RESTART_CHECK);
    expect(suspended).toBe(run);
  });

  it("leaves evidence state unchanged", () => {
    const session1 = session();
    let run = newRun(session1);
    run = releaseEvidenceStage(run, session1, "a", "ev1");
    const beforeEvidence = run.stepRuns.find((sr) => sr.stepId === "a")!.evidenceState;

    const suspended = prepareRunForShutdown(run, SHUTDOWN);
    expect(suspended.stepRuns.find((sr) => sr.stepId === "a")!.evidenceState).toEqual(beforeEvidence);
  });

  it("leaves checklist state unchanged", () => {
    const session1 = session();
    let run = newRun(session1);
    run = setChecklistItem(run, session1, "a", "c1", true);

    const suspended = prepareRunForShutdown(run, SHUTDOWN);
    expect(suspended.stepRuns.find((sr) => sr.stepId === "a")!.checklistState).toEqual({ c1: true });
  });
});

describe("timer correctness across a simulated restart", () => {
  it("excludes the offline window from Session/Step active elapsed while still paused after restart", () => {
    const run = prepareRunForShutdown(newRun(session()), SHUTDOWN);

    // "Restart": nothing mutates the run, we simply compute timing at a later `now`.
    const stepA = run.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepActualDurationMinutes(stepA, RESTART_CHECK)).toBe(20); // NOT 30
    expect(sessionActiveElapsedMinutes(run, RESTART_CHECK)).toBe(20); // NOT 30
    expect(isRunPaused(run)).toBe(true);
  });

  it("stays paused until an explicit resume, then resume closes the old pause interval and opens a fresh Step interval", () => {
    const suspended = prepareRunForShutdown(newRun(session()), SHUTDOWN);
    expect(isRunPaused(suspended)).toBe(true);

    const resumed = resumeRun(suspended, RESUME_AT);
    expect(isRunPaused(resumed)).toBe(false);
    expect(resumed.pauseIntervals).toEqual([{ startedAt: SHUTDOWN, endedAt: RESUME_AT }]);

    const stepA = resumed.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepA.activeIntervals).toEqual([
      { startedAt: T0, endedAt: SHUTDOWN },
      { startedAt: RESUME_AT }
    ]);

    // Paused time (10:20-10:31, 11 min) is excluded from active elapsed at the resume instant.
    expect(sessionActiveElapsedMinutes(resumed, RESUME_AT)).toBe(20);
  });
});

describe("save -> simulated process reset -> load preserves released/locked evidence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-restart-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("round-trips a shutdown-suspended run with mixed evidence state exactly", async () => {
    const session1 = session();
    let run = newRun(session1);
    run = releaseEvidenceStage(run, session1, "a", "ev1"); // ev2 stays locked
    run = prepareRunForShutdown(run, SHUTDOWN);

    await saveSessionRun(tempDir, run);

    // Simulated process reset: a completely fresh load, as a new process would do.
    const reloaded = await loadSessionRun(tempDir, run.id);
    expect(reloaded).toEqual(run);
    expect(reloaded.stepRuns.find((sr) => sr.stepId === "a")!.evidenceState).toEqual({
      ev1: "released",
      ev2: "locked"
    });
    expect(isRunPaused(reloaded)).toBe(true);
  });
});

describe("navigation revisit after activating a different Step, then shutdown", () => {
  it("preserves the correct active Step through shutdown suspension", () => {
    let run = newRun(session());
    run = activateStep(run, "b", "2026-09-11T10:05:00.000Z");
    const suspended = prepareRunForShutdown(run, "2026-09-11T10:10:00.000Z");
    expect(suspended.stepRuns.find((sr) => sr.stepId === "b")!.status).toBe("active");
    expect(suspended.stepRuns.find((sr) => sr.stepId === "a")!.status).toBe("done");
  });
});
