import { describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { createSessionRun } from "../engine";
import { validateSessionRunRecoveryCompatibility } from "../recoveryCompatibility";
import { SessionEngineError } from "../../validation/errors";

const T0 = "2026-09-11T10:00:00.000Z";

function baseSession(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Recovery Session",
    plannedDurationMinutes: 15,
    steps: [
      {
        id: "a",
        type: "introduction",
        title: "Step A",
        plannedDurationMinutes: 5,
        checklist: [{ id: "c1", label: "Check 1" }],
        evidenceStages: [{ id: "ev1", label: "Evidence 1", order: 1 }]
      },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 10 }
    ]
  };
}

function runFor(session: Session) {
  return createSessionRun({ id: "run-1", trainingId: session.trainingId, session, startedAt: T0 });
}

describe("validateSessionRunRecoveryCompatibility", () => {
  it("succeeds for an unchanged Session", () => {
    const session = baseSession();
    expect(() => validateSessionRunRecoveryCompatibility(runFor(session), session)).not.toThrow();
  });

  it("rejects a different Training id", () => {
    const session = baseSession();
    const run = runFor(session);
    const otherTrainingSession: Session = { ...session, trainingId: "training-2" };
    expect(() => validateSessionRunRecoveryCompatibility(run, otherTrainingSession)).toThrow(SessionEngineError);
  });

  it("rejects a different Session id", () => {
    const session = baseSession();
    const run = runFor(session);
    const renamedSession: Session = { ...session, id: "session-2" };
    expect(() => validateSessionRunRecoveryCompatibility(run, renamedSession)).toThrow(SessionEngineError);
  });

  it("rejects a changed Step count/order", () => {
    const session = baseSession();
    const run = runFor(session);
    const extraStepSession: Session = {
      ...session,
      steps: [...session.steps, { id: "c", type: "closing", title: "Step C", plannedDurationMinutes: 5 }]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, extraStepSession)).toThrow(/Steps/);

    const reorderedSession: Session = { ...session, steps: [session.steps[1]!, session.steps[0]!] };
    expect(() => validateSessionRunRecoveryCompatibility(run, reorderedSession)).toThrow(SessionEngineError);
  });

  it("rejects a changed Step title/type/planned duration", () => {
    const session = baseSession();
    const run = runFor(session);

    const changedTitle: Session = {
      ...session,
      steps: [{ ...session.steps[0]!, title: "Renamed" }, session.steps[1]!]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, changedTitle)).toThrow(/title/);

    const changedType: Session = {
      ...session,
      steps: [{ ...session.steps[0]!, type: "closing" }, session.steps[1]!]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, changedType)).toThrow(/type/);

    const changedDuration: Session = {
      ...session,
      steps: [{ ...session.steps[0]!, plannedDurationMinutes: 99 }, session.steps[1]!]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, changedDuration)).toThrow(/planned duration/);
  });

  it("rejects a changed Session title/planned duration", () => {
    const session = baseSession();
    const run = runFor(session);
    expect(() =>
      validateSessionRunRecoveryCompatibility(run, { ...session, title: "Renamed Session" })
    ).toThrow(/Session title/);
    expect(() =>
      validateSessionRunRecoveryCompatibility(run, { ...session, plannedDurationMinutes: 999 })
    ).toThrow(/planned duration/);
  });

  it("rejects changed checklist ids", () => {
    const session = baseSession();
    const run = runFor(session);
    const changedChecklist: Session = {
      ...session,
      steps: [{ ...session.steps[0]!, checklist: [{ id: "different", label: "Different" }] }, session.steps[1]!]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, changedChecklist)).toThrow(/checklist/);
  });

  it("rejects changed evidence-stage ids", () => {
    const session = baseSession();
    const run = runFor(session);
    const changedEvidence: Session = {
      ...session,
      steps: [
        { ...session.steps[0]!, evidenceStages: [{ id: "different", label: "Different", order: 1 }] },
        session.steps[1]!
      ]
    };
    expect(() => validateSessionRunRecoveryCompatibility(run, changedEvidence)).toThrow(/evidence stages/);
  });
});
