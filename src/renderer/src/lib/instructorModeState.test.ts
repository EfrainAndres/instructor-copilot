import { describe, expect, it } from "vitest";
import type { Session } from "../../../session-engine/model/schema";
import { activateStep, createSessionRun, pauseRun, completeRun } from "../../../session-engine/run/engine";
import { deriveInstructorModeState } from "./instructorModeState";

const T0 = "2026-09-11T10:00:00.000Z";
const T5 = "2026-09-11T10:05:00.000Z";
const T12 = "2026-09-11T10:12:00.000Z";

function threeStepSession(): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Test Session",
    plannedDurationMinutes: 20,
    steps: [
      { id: "a", type: "introduction", title: "A", plannedDurationMinutes: 5 },
      { id: "b", type: "discussion", title: "B", plannedDurationMinutes: 10 },
      { id: "c", type: "closing", title: "C", plannedDurationMinutes: 5 }
    ]
  };
}

function newRun(session: Session) {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session, startedAt: T0 });
}

describe("deriveInstructorModeState", () => {
  it("reports the first Step as current with Previous disabled and Next enabled", () => {
    const session = threeStepSession();
    const state = deriveInstructorModeState(session, newRun(session), T0);
    expect(state.currentStepId).toBe("a");
    expect(state.stepNumber).toBe(1);
    expect(state.stepCount).toBe(3);
    expect(state.canGoPrevious).toBe(false);
    expect(state.canGoNext).toBe(true);
    expect(state.canSkip).toBe(true);
    expect(state.canPause).toBe(true);
    expect(state.canResume).toBe(false);
    expect(state.canComplete).toBe(false);
  });

  it("disables Complete until the current Step has no next target", () => {
    const session = threeStepSession();
    let run = newRun(session);
    run = activateStep(run, "b", T5);
    let state = deriveInstructorModeState(session, run, T5);
    expect(state.canComplete).toBe(false);

    run = activateStep(run, "c", T12);
    state = deriveInstructorModeState(session, run, T12);
    expect(state.canGoNext).toBe(false);
    expect(state.canComplete).toBe(true);
  });

  it("disables navigation/skip/pause/complete while paused, and enables Resume", () => {
    const session = threeStepSession();
    const run = pauseRun(newRun(session), T5);
    const state = deriveInstructorModeState(session, run, T5);
    expect(state.paused).toBe(true);
    expect(state.canGoPrevious).toBe(false);
    expect(state.canGoNext).toBe(false);
    expect(state.canSkip).toBe(false);
    expect(state.canPause).toBe(false);
    expect(state.canResume).toBe(true);
    expect(state.canComplete).toBe(false);
    // Still structurally has a next Step - the UI should keep showing "Next" (disabled), not swap to "Complete".
    expect(state.hasNextTarget).toBe(true);
  });

  it("reports the completed state with a fixed schedule delta and no controls enabled", () => {
    const session = threeStepSession();
    let run = newRun(session);
    run = completeRun(run, T5);
    const state = deriveInstructorModeState(session, run, T12); // now is irrelevant once completed
    expect(state.completed).toBe(true);
    expect(state.currentStepId).toBeUndefined();
    expect(state.canPause).toBe(false);
    expect(state.canResume).toBe(false);
    expect(state.canComplete).toBe(false);
    expect(state.scheduleDeltaMinutesValue).toBe(5 - 20); // 5 min active elapsed - 20 total planned
    expect(state.liveScheduleStatus).toBeUndefined();
    expect(state.canRestart).toBe(false);
    expect(state.canDiscard).toBe(false);
  });

  it("enables Restart/Discard on any live run regardless of pause state (Phase 9B-B)", () => {
    const session = threeStepSession();
    const live = deriveInstructorModeState(session, newRun(session), T0);
    expect(live.canRestart).toBe(true);
    expect(live.canDiscard).toBe(true);

    const paused = deriveInstructorModeState(session, pauseRun(newRun(session), T5), T5);
    expect(paused.canRestart).toBe(true);
    expect(paused.canDiscard).toBe(true);
  });

  it("derives a live buffer-aware schedule status for the current Step while not completed", () => {
    const session = threeStepSession();
    const state = deriveInstructorModeState(session, newRun(session), T0);
    expect(state.liveScheduleStatus).toEqual({ kind: "on_plan", magnitudeMinutes: 5 });
  });

  it("defaults facilitationBufferMinutes to 0 when the Session has none authored", () => {
    const session = threeStepSession();
    const state = deriveInstructorModeState(session, newRun(session), T0);
    expect(state.facilitationBufferMinutes).toBe(0);
  });

  it("surfaces an authored facilitationBufferMinutes", () => {
    const session: Session = { ...threeStepSession(), facilitationBufferMinutes: 5 };
    const state = deriveInstructorModeState(session, newRun(session), T0);
    expect(state.facilitationBufferMinutes).toBe(5);
  });
});
