import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import {
  activateStep,
  completeRun,
  createSessionRun,
  getActiveStepRun,
  isRunPaused,
  pauseRun,
  releaseEvidenceStage,
  resolveCurrentStepCommand,
  resolveNextStepId,
  resolvePreviousStepId,
  resumeRun,
  setChecklistItem,
  skipCurrentStep
} from "../engine";
import { loadSessionRun, saveSessionRun } from "../persistence";
import { SessionEngineError } from "../../validation/errors";
import {
  scheduleDeltaMinutes,
  sessionActiveElapsedMinutes,
  stepActualDurationMinutes,
  totalPausedMinutes
} from "../timing";
import { validateSessionRunSemantics, type SessionRun } from "../schema";

const T0 = "2026-09-11T10:00:00.000Z";
const T5 = "2026-09-11T10:05:00.000Z";
const T6 = "2026-09-11T10:06:00.000Z";
const T8 = "2026-09-11T10:08:00.000Z";
const T10 = "2026-09-11T10:10:00.000Z";
const T12 = "2026-09-11T10:12:00.000Z";
const T13 = "2026-09-11T10:13:00.000Z";
const T18 = "2026-09-11T10:18:00.000Z";
const BEFORE_T0 = "2026-09-11T09:59:00.000Z";

function twoStepSession(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Test Session",
    plannedDurationMinutes: 15,
    steps: [
      {
        id: "a",
        type: "introduction",
        title: "Step A",
        plannedDurationMinutes: 5,
        checklist: [
          { id: "c1", label: "Check 1" },
          { id: "c2", label: "Check 2" }
        ],
        evidenceStages: [{ id: "ev1", label: "Evidence 1", order: 1 }]
      },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 10 }
    ]
  };
}

function threeStepSessionWithOverride(): Session {
  return {
    id: "session-2",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Override Session",
    plannedDurationMinutes: 15,
    steps: [
      { id: "a", type: "introduction", title: "A", plannedDurationMinutes: 5, nextStepId: "c" },
      { id: "b", type: "discussion", title: "B", plannedDurationMinutes: 5 },
      { id: "c", type: "closing", title: "C", plannedDurationMinutes: 5 }
    ]
  };
}

function newRun(session: Session): SessionRun {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session, startedAt: T0 });
}

describe("createSessionRun", () => {
  it("snapshots Session and Step metadata correctly", () => {
    const run = newRun(twoStepSession());
    expect(run.sessionTitleSnapshot).toBe("Test Session");
    expect(run.plannedDurationMinutesSnapshot).toBe(15);
    expect(run.stepRuns[0]).toMatchObject({
      stepId: "a",
      stepTitleSnapshot: "Step A",
      stepTypeSnapshot: "introduction",
      plannedDurationMinutesSnapshot: 5,
      stepOrderSnapshot: 0
    });
    expect(run.stepRuns[1]).toMatchObject({
      stepId: "b",
      stepTitleSnapshot: "Step B",
      stepTypeSnapshot: "discussion",
      plannedDurationMinutesSnapshot: 10,
      stepOrderSnapshot: 1
    });
  });

  it("initializes checklistState to false for every authored checklist item", () => {
    const run = newRun(twoStepSession());
    expect(run.stepRuns[0]!.checklistState).toEqual({ c1: false, c2: false });
  });

  it("initializes evidenceState to locked for every authored evidence stage", () => {
    const run = newRun(twoStepSession());
    expect(run.stepRuns[0]!.evidenceState).toEqual({ ev1: "locked" });
  });

  it("activates the first Step with a single open interval starting at startedAt", () => {
    const run = newRun(twoStepSession());
    expect(run.stepRuns[0]!.status).toBe("active");
    expect(run.stepRuns[0]!.activeIntervals).toEqual([{ startedAt: T0 }]);
    expect(run.stepRuns[1]!.status).toBe("pending");
    expect(run.stepRuns[1]!.activeIntervals).toEqual([]);
  });

  it("produces a run with no active Step for a Session with zero Steps, which can still be completed", () => {
    const emptySession: Session = {
      id: "empty",
      schemaVersion: 1,
      trainingId: "training-1",
      title: "Empty",
      plannedDurationMinutes: 5,
      steps: []
    };
    const run = createSessionRun({ id: "run-empty", trainingId: "training-1", session: emptySession, startedAt: T0 });
    expect(getActiveStepRun(run)).toBeUndefined();
    const completed = completeRun(run, T5);
    expect(completed.completedAt).toBe(T5);
  });

  it("rejects a trainingId that does not match Session.trainingId", () => {
    const session = twoStepSession(); // trainingId: "training-1"
    expect(() =>
      createSessionRun({ id: "run-1", trainingId: "training-2", session, startedAt: T0 })
    ).toThrow(/belongs to Training/);
  });
});

describe("navigation", () => {
  it("A -> B closes A and opens B", () => {
    const run = activateStep(newRun(twoStepSession()), "b", T5);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    const b = run.stepRuns.find((s) => s.stepId === "b")!;
    expect(a.status).toBe("done");
    expect(a.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
    expect(b.status).toBe("active");
    expect(b.activeIntervals).toEqual([{ startedAt: T5 }]);
  });

  it("A -> B -> Previous A produces a second interval on A", () => {
    let run = newRun(twoStepSession());
    run = activateStep(run, "b", T5);
    run = activateStep(run, "a", T10);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(a.activeIntervals).toHaveLength(2);
    expect(a.activeIntervals[1]).toEqual({ startedAt: T10 });
  });

  it("revisited Step's actual duration excludes time spent on other Steps", () => {
    let run = newRun(twoStepSession());
    run = activateStep(run, "b", T5);
    run = activateStep(run, "a", T10);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    // A: [10:00-10:05] + [10:10-now]; at 10:13 that's 5 + 3 = 8 minutes, never 13.
    expect(stepActualDurationMinutes(a, T13)).toBe(8);
  });

  it("is a no-op when the target Step is already active", () => {
    const run = newRun(twoStepSession());
    const same = activateStep(run, "a", T5);
    expect(same).toBe(run);
  });

  it("respects nextStepId as an override for resolveNextStepId", () => {
    expect(resolveNextStepId(threeStepSessionWithOverride(), "a")).toBe("c");
  });

  it("falls back to authored array order for resolveNextStepId with no override", () => {
    expect(resolveNextStepId(threeStepSessionWithOverride(), "b")).toBe("c");
  });

  it("resolvePreviousStepId uses authored array order regardless of nextStepId overrides", () => {
    expect(resolvePreviousStepId(threeStepSessionWithOverride(), "c")).toBe("b");
    expect(resolvePreviousStepId(threeStepSessionWithOverride(), "b")).toBe("a");
  });
});

describe("skip", () => {
  it("marks the current Step skipped and activates the target", () => {
    const run = skipCurrentStep(newRun(twoStepSession()), T5, "b");
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    const b = run.stepRuns.find((s) => s.stepId === "b")!;
    expect(a.status).toBe("skipped");
    expect(a.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
    expect(b.status).toBe("active");
  });

  it("allows a skipped Step to be revisited and finished normally later", () => {
    let run = skipCurrentStep(newRun(twoStepSession()), T5, "b");
    run = activateStep(run, "a", T10);
    run = activateStep(run, "b", T12);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(a.status).toBe("done");
  });
});

describe("pause / resume", () => {
  it("pause closes the active Step's open interval but keeps it logically active", () => {
    const run = pauseRun(newRun(twoStepSession()), T5);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(a.status).toBe("active");
    expect(a.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
    expect(isRunPaused(run)).toBe(true);
  });

  it("resume opens a fresh interval on the active Step", () => {
    let run = pauseRun(newRun(twoStepSession()), T5);
    run = resumeRun(run, T8);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(a.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }, { startedAt: T8 }]);
    expect(isRunPaused(run)).toBe(false);
  });

  it("excludes paused time from session active elapsed", () => {
    let run = pauseRun(newRun(twoStepSession()), T5);
    run = resumeRun(run, T8);
    expect(totalPausedMinutes(run, T8)).toBe(3);
    expect(sessionActiveElapsedMinutes(run, T8)).toBe(5); // 8 wall - 3 paused
  });

  it("rejects pausing an already-paused run", () => {
    const run = pauseRun(newRun(twoStepSession()), T5);
    expect(() => pauseRun(run, T6)).toThrow(SessionEngineError);
  });

  it("rejects resuming a run that is not paused", () => {
    const run = newRun(twoStepSession());
    expect(() => resumeRun(run, T5)).toThrow(/not paused/);
  });

  it("rejects navigation and skip while paused", () => {
    const run = pauseRun(newRun(twoStepSession()), T5);
    expect(() => activateStep(run, "b", T6)).toThrow(/paused/);
    expect(() => skipCurrentStep(run, T6, "b")).toThrow(/paused/);
  });
});

describe("checklist state", () => {
  it("toggles a known checklist item", () => {
    const session = twoStepSession();
    const run = setChecklistItem(newRun(session), session, "a", "c1", true);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(a.checklistState).toEqual({ c1: true, c2: false });
  });

  it("rejects an unknown checklist id", () => {
    const session = twoStepSession();
    expect(() => setChecklistItem(newRun(session), session, "a", "nope", true)).toThrow(SessionEngineError);
  });
});

describe("completion", () => {
  it("closes the active Step and sets completedAt", () => {
    const run = completeRun(newRun(twoStepSession()), T5);
    const a = run.stepRuns.find((s) => s.stepId === "a")!;
    expect(run.completedAt).toBe(T5);
    expect(a.status).toBe("done");
    expect(a.activeIntervals).toEqual([{ startedAt: T0, endedAt: T5 }]);
  });

  it("rejects any further transition on a completed run", () => {
    const session = twoStepSession();
    const run = completeRun(newRun(session), T5);
    expect(() => activateStep(run, "b", T6)).toThrow(/already completed/);
    expect(() => skipCurrentStep(run, T6, "b")).toThrow(/already completed/);
    expect(() => pauseRun(run, T6)).toThrow(/already completed/);
    expect(() => completeRun(run, T6)).toThrow(/already completed/);
    expect(() => setChecklistItem(run, session, "a", "c1", true)).toThrow(/already completed/);
  });

  it("rejects completing a paused run", () => {
    const run = pauseRun(newRun(twoStepSession()), T5);
    expect(() => completeRun(run, T6)).toThrow(/paused/);
  });
});

describe("backwards time protection", () => {
  it("rejects a timestamp earlier than the run's last known instant", () => {
    const run = newRun(twoStepSession());
    expect(() => activateStep(run, "b", BEFORE_T0)).toThrow(/backwards/);
  });
});

describe("schedule delta", () => {
  it("matches the documented worked example", () => {
    // Step A planned 5, Step B planned 10; checkpoint through B = 15.
    const run = activateStep(newRun(twoStepSession()), "b", T5);
    expect(scheduleDeltaMinutes(run, "b", T12)).toBe(-3); // 12 elapsed - 15 checkpoint
    expect(scheduleDeltaMinutes(run, "b", T18)).toBe(3); // 18 elapsed - 15 checkpoint
  });
});

describe("persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-run-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("round-trips a SessionRun through save and load exactly", async () => {
    const run = activateStep(newRun(twoStepSession()), "b", T5);
    await saveSessionRun(tempDir, run);
    const reloaded = await loadSessionRun(tempDir, run.id);
    expect(reloaded).toEqual(run);
  });

  it("round-trips released evidence state through save and load exactly", async () => {
    const session = sessionWithEvidence();
    const run = releaseEvidenceStage(newRun(session), session, "a", "db");
    await saveSessionRun(tempDir, run);
    const reloaded = await loadSessionRun(tempDir, run.id);
    expect(reloaded.stepRuns.find((sr) => sr.stepId === "a")!.evidenceState).toEqual({
      http: "locked",
      db: "released",
      logs: "locked"
    });
  });

  it("rejects loading a SessionRun with an unsupported schema version", async () => {
    await mkdir(join(tempDir, "runs"), { recursive: true });
    const run = { ...newRun(twoStepSession()), schemaVersion: 999 };
    await writeFile(join(tempDir, "runs", `${run.id}.json`), JSON.stringify(run, null, 2));
    await expect(loadSessionRun(tempDir, run.id)).rejects.toThrow(SessionEngineError);
  });

  it("rejects saving a SessionRun with impossible state (two active StepRuns)", async () => {
    const run = newRun(twoStepSession());
    const corrupt: SessionRun = {
      ...run,
      stepRuns: run.stepRuns.map((stepRun) =>
        stepRun.stepId === "b" ? { ...stepRun, status: "active", activeIntervals: [{ startedAt: T5 }] } : stepRun
      )
    };
    await expect(saveSessionRun(tempDir, corrupt)).rejects.toThrow(/more than one active/);
  });
});

describe("run state integrity: open Step interval invariants", () => {
  it("rejects a 'done' StepRun with an open activeInterval", () => {
    const run = newRun(twoStepSession());
    const corrupt: SessionRun = {
      ...run,
      stepRuns: run.stepRuns.map((stepRun) =>
        stepRun.stepId === "a" ? { ...stepRun, status: "done", activeIntervals: [{ startedAt: T0 }] } : stepRun
      )
    };
    expect(() => validateSessionRunSemantics(corrupt)).toThrow(/not the active Step/);
  });

  it("rejects two StepRuns with open activeIntervals even if only one has status=\"active\"", () => {
    const run = newRun(twoStepSession());
    const corrupt: SessionRun = {
      ...run,
      stepRuns: run.stepRuns.map((stepRun) =>
        stepRun.stepId === "b" ? { ...stepRun, status: "pending", activeIntervals: [{ startedAt: T5 }] } : stepRun
      )
    };
    expect(() => validateSessionRunSemantics(corrupt)).toThrow(/not the active Step/);
  });

  it("rejects an unpaused active StepRun with no open activeInterval", () => {
    const run = newRun(twoStepSession());
    const corrupt: SessionRun = {
      ...run,
      stepRuns: run.stepRuns.map((stepRun) =>
        stepRun.stepId === "a" ? { ...stepRun, activeIntervals: [{ startedAt: T0, endedAt: T5 }] } : stepRun
      )
    };
    expect(() => validateSessionRunSemantics(corrupt)).toThrow(/no open active interval while the run is unpaused/);
  });

  it("accepts a paused run whose active StepRun has its Step interval closed", () => {
    const run = pauseRun(newRun(twoStepSession()), T5);
    expect(() => validateSessionRunSemantics(run)).not.toThrow();
    const a = run.stepRuns.find((stepRun) => stepRun.stepId === "a")!;
    expect(a.status).toBe("active");
    expect(a.activeIntervals.some((interval) => interval.endedAt === undefined)).toBe(false);
  });

  it("rejects a single StepRun with more than one open activeInterval", () => {
    const run = newRun(twoStepSession());
    const corrupt: SessionRun = {
      ...run,
      stepRuns: run.stepRuns.map((stepRun) =>
        stepRun.stepId === "a"
          ? { ...stepRun, activeIntervals: [{ startedAt: T0 }, { startedAt: T5 }] }
          : stepRun
      )
    };
    expect(() => validateSessionRunSemantics(corrupt)).toThrow(/more than one open active interval/);
  });

  it("allows an incomplete, unpaused run with no active Step and no open Step interval (e.g. skip without a target)", () => {
    const run = skipCurrentStep(newRun(twoStepSession()), T5);
    expect(getActiveStepRun(run)).toBeUndefined();
    expect(() => validateSessionRunSemantics(run)).not.toThrow();
  });
});

function sessionWithCommand(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Command Session",
    plannedDurationMinutes: 10,
    steps: [
      {
        id: "a",
        type: "live_demo",
        title: "Step A",
        plannedDurationMinutes: 5,
        command: {
          id: "reset-env",
          label: "Reset environment",
          executable: "node",
          args: ["scripts/reset.mjs"],
          root: "content",
          cwd: "scripts"
        }
      },
      { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

describe("resolveCurrentStepCommand", () => {
  it("succeeds for the exact authored command id on the current Step", () => {
    const session = sessionWithCommand();
    const command = resolveCurrentStepCommand(session, "a", "reset-env");
    expect(command).toEqual(session.steps[0]!.command);
  });

  it("rejects a command id that does not match the current Step's command", () => {
    const session = sessionWithCommand();
    expect(() => resolveCurrentStepCommand(session, "a", "some-other-id")).toThrow(
      /does not match the current Step/
    );
  });

  it("rejects when the current Step has no command", () => {
    const session = sessionWithCommand();
    expect(() => resolveCurrentStepCommand(session, "b", "reset-env")).toThrow(/no command/);
  });

  it("rejects when there is no current Step", () => {
    const session = sessionWithCommand();
    expect(() => resolveCurrentStepCommand(session, undefined, "reset-env")).toThrow(/No Step is currently active/);
  });
});

function sessionWithEvidence(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Evidence Session",
    plannedDurationMinutes: 10,
    steps: [
      {
        id: "a",
        type: "live_demo",
        title: "Step A",
        plannedDurationMinutes: 5,
        evidenceStages: [
          { id: "http", label: "HTTP response", order: 1, detail: "200 OK" },
          { id: "db", label: "Database state", order: 2, detail: "Order persisted correctly." },
          { id: "logs", label: "Logs", order: 3, detail: "No errors logged." }
        ]
      },
      { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

describe("releaseEvidenceStage", () => {
  it("changes exactly one target stage to released, leaving the others locked", () => {
    const session = sessionWithEvidence();
    const run = releaseEvidenceStage(newRun(session), session, "a", "db");
    const stepRun = run.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepRun.evidenceState).toEqual({ http: "locked", db: "released", logs: "locked" });
  });

  it("allows releasing stages out of authored/default order", () => {
    const session = sessionWithEvidence();
    let run = newRun(session);
    run = releaseEvidenceStage(run, session, "a", "logs");
    run = releaseEvidenceStage(run, session, "a", "http");
    const stepRun = run.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepRun.evidenceState).toEqual({ http: "released", db: "locked", logs: "released" });
  });

  it("is idempotent when releasing an already released stage", () => {
    const session = sessionWithEvidence();
    let run = newRun(session);
    run = releaseEvidenceStage(run, session, "a", "http");
    expect(() => releaseEvidenceStage(run, session, "a", "http")).not.toThrow();
    const again = releaseEvidenceStage(run, session, "a", "http");
    expect(again.stepRuns.find((sr) => sr.stepId === "a")!.evidenceState.http).toBe("released");
  });

  it("rejects an unknown EvidenceStage id", () => {
    const session = sessionWithEvidence();
    expect(() => releaseEvidenceStage(newRun(session), session, "a", "does-not-exist")).toThrow(SessionEngineError);
  });

  it("rejects an EvidenceStage id that belongs to a different Step", () => {
    const session: Session = {
      ...sessionWithEvidence(),
      steps: [
        sessionWithEvidence().steps[0]!,
        {
          id: "b",
          type: "closing",
          title: "Step B",
          plannedDurationMinutes: 5,
          evidenceStages: [{ id: "other-stage", label: "Other", order: 1 }]
        }
      ]
    };
    expect(() => releaseEvidenceStage(newRun(session), session, "a", "other-stage")).toThrow(SessionEngineError);
  });

  it("succeeds while the run is paused without changing pause/timing state", () => {
    const session = sessionWithEvidence();
    const paused = pauseRun(newRun(session), T5);
    const run = releaseEvidenceStage(paused, session, "a", "http");
    expect(isRunPaused(run)).toBe(true);
    expect(run.pauseIntervals).toEqual(paused.pauseIntervals);
    expect(run.stepRuns.find((sr) => sr.stepId === "a")!.activeIntervals).toEqual(
      paused.stepRuns.find((sr) => sr.stepId === "a")!.activeIntervals
    );
  });

  it("rejects releasing evidence after the run is completed", () => {
    const session = sessionWithEvidence();
    const completed = completeRun(newRun(session), T5);
    expect(() => releaseEvidenceStage(completed, session, "a", "http")).toThrow(/already completed/);
  });

  it("preserves released state across Step navigation/revisit", () => {
    const session = sessionWithEvidence();
    let run = newRun(session);
    run = releaseEvidenceStage(run, session, "a", "db");
    run = activateStep(run, "b", T5);
    run = activateStep(run, "a", T6);
    const stepRun = run.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepRun.evidenceState.db).toBe("released");
    expect(stepRun.evidenceState.http).toBe("locked");
  });

  it("leaves other StepRuns, checklist, and timing untouched", () => {
    const session = sessionWithEvidence();
    const before = newRun(session);
    const after = releaseEvidenceStage(before, session, "a", "http");
    expect(after.stepRuns.find((sr) => sr.stepId === "b")).toEqual(before.stepRuns.find((sr) => sr.stepId === "b"));
    const beforeA = before.stepRuns.find((sr) => sr.stepId === "a")!;
    const afterA = after.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(afterA.checklistState).toEqual(beforeA.checklistState);
    expect(afterA.activeIntervals).toEqual(beforeA.activeIntervals);
    expect(afterA.status).toBe(beforeA.status);
  });
});
