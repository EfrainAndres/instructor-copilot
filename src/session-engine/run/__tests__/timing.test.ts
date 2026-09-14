import { describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { activateStep, completeRun, createSessionRun, pauseRun, terminateRun } from "../engine";
import {
  completedRunScheduleDeltaMinutes,
  deriveLiveScheduleStatus,
  plannedBufferMinutes,
  sessionActiveElapsedMinutes,
  sessionWallElapsedMinutes
} from "../timing";
import type { SessionRun } from "../schema";

const T0 = "2026-09-11T10:00:00.000Z";

function isoAfterMinutes(minutes: number): string {
  return new Date(Date.parse(T0) + minutes * 60000).toISOString();
}

/** Step A planned 5 (checkpoint 5), Step B (final) planned 5 (checkpoint 10), Session plan 15 -> an explicit 5-minute buffer, mirroring Session 1's 85+5=90 shape at a smaller scale. */
function bufferedSession(): Session {
  return {
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
}

/** No buffer: Step plans sum exactly to the Session plan, matching every run created before Phase 9B-B. */
function legacySession(): Session {
  return {
    id: "session-legacy",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Legacy Session",
    plannedDurationMinutes: 10,
    steps: [
      { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 5 },
      { id: "b", type: "closing", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

function newRun(s: Session): SessionRun {
  return createSessionRun({ id: "run-1", trainingId: "training-1", session: s, startedAt: T0 });
}

describe("plannedBufferMinutes", () => {
  it("derives 5 for a Session with an explicit buffer", () => {
    expect(plannedBufferMinutes(newRun(bufferedSession()))).toBe(5);
  });

  it("derives 0 for a legacy Session with no buffer", () => {
    expect(plannedBufferMinutes(newRun(legacySession()))).toBe(0);
  });
});

describe("deriveLiveScheduleStatus - buffer awareness (Phase 9B-B)", () => {
  it("reports on_plan on the final Step before its own checkpoint", () => {
    const run = activateStep(newRun(bufferedSession()), "b", isoAfterMinutes(4));
    const status = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(9)); // 9 elapsed, checkpoint 10
    expect(status.kind).toBe("on_plan");
  });

  it("reports in_buffer (not behind) once past the final Step's checkpoint but within the Session's planned total", () => {
    const run = activateStep(newRun(bufferedSession()), "b", isoAfterMinutes(5));
    const status = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(12)); // 12 elapsed, checkpoint 10, plan 15
    expect(status.kind).toBe("in_buffer");
    expect(status.magnitudeMinutes).toBeCloseTo(3, 10); // 15 - 12 remaining
  });

  it("still reports in_buffer (boundary) at exactly the Session's full planned total", () => {
    const run = activateStep(newRun(bufferedSession()), "b", isoAfterMinutes(5));
    const status = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(15));
    expect(status.kind).toBe("in_buffer");
    expect(status.magnitudeMinutes).toBeCloseTo(0, 10);
  });

  it("reports behind once active time exceeds the Session's full planned total", () => {
    const run = activateStep(newRun(bufferedSession()), "b", isoAfterMinutes(5));
    const status = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(17));
    expect(status.kind).toBe("behind");
    expect(status.magnitudeMinutes).toBeCloseTo(2, 10); // 17 - 15
  });

  it("does NOT hide lateness on an earlier (non-final) Step using the final buffer", () => {
    // Still on Step A (checkpoint 5), 8 minutes elapsed - genuinely behind, buffer must not apply.
    const run = newRun(bufferedSession());
    const status = deriveLiveScheduleStatus(run, "a", isoAfterMinutes(8));
    expect(status.kind).toBe("behind");
    expect(status.magnitudeMinutes).toBeCloseTo(3, 10); // 8 - 5 checkpoint
  });

  it("reduces to plain on_plan/behind for a legacy Session with no buffer (final checkpoint == Session plan)", () => {
    const run = activateStep(newRun(legacySession()), "b", isoAfterMinutes(5));
    const onPlan = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(9));
    expect(onPlan.kind).toBe("on_plan");
    const behind = deriveLiveScheduleStatus(run, "b", isoAfterMinutes(12));
    expect(behind.kind).toBe("behind");
    expect(behind.magnitudeMinutes).toBeCloseTo(2, 10);
  });
});

describe("completedRunScheduleDeltaMinutes - measured against the Session's own planned total (Phase 9B-B)", () => {
  it("is zero for a buffered Session completed in exactly its full planned duration", () => {
    let run = newRun(bufferedSession());
    run = activateStep(run, "b", isoAfterMinutes(10));
    run = completeRun(run, isoAfterMinutes(15));
    expect(completedRunScheduleDeltaMinutes(run)).toBeCloseTo(0, 10);
  });

  it("is +2 for a buffered Session that overruns its full planned duration by 2 minutes", () => {
    let run = newRun(bufferedSession());
    run = activateStep(run, "b", isoAfterMinutes(10));
    run = completeRun(run, isoAfterMinutes(17));
    expect(completedRunScheduleDeltaMinutes(run)).toBeCloseTo(2, 10);
  });

  it("reports exactly as before (against the Step-plan sum) for a legacy Session with no buffer", () => {
    let run = newRun(legacySession());
    run = activateStep(run, "b", isoAfterMinutes(5));
    run = completeRun(run, isoAfterMinutes(10));
    expect(completedRunScheduleDeltaMinutes(run)).toBeCloseTo(0, 10);
  });
});

describe("elapsed time freezes for terminal runs (Phase 9B-B correctness fix)", () => {
  it("freezes sessionWallElapsedMinutes for a discarded run at termination.at", () => {
    const run = terminateRun(newRun(legacySession()), "discarded", isoAfterMinutes(4));
    expect(sessionWallElapsedMinutes(run, isoAfterMinutes(4))).toBeCloseTo(4, 10);
  });

  it("freezes sessionActiveElapsedMinutes for a discarded run at termination.at", () => {
    const run = terminateRun(newRun(legacySession()), "discarded", isoAfterMinutes(4));
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(4))).toBeCloseTo(4, 10);
  });

  it("freezes sessionActiveElapsedMinutes for a restarted (abandoned) run at termination.at", () => {
    const run = terminateRun(newRun(legacySession()), "restarted", isoAfterMinutes(6));
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(6))).toBeCloseTo(6, 10);
  });

  it("does not grow when a later `now` is supplied - both wall and active elapsed stay pinned", () => {
    const run = terminateRun(newRun(legacySession()), "discarded", isoAfterMinutes(4));
    const atTermination = sessionActiveElapsedMinutes(run, isoAfterMinutes(4));
    const wallAtTermination = sessionWallElapsedMinutes(run, isoAfterMinutes(4));

    // A "now" far in the future (e.g. the app re-rendering hours/days later)
    // must never change either result once the run is terminal.
    const muchLater = isoAfterMinutes(4 + 60 * 24 * 30);
    expect(sessionActiveElapsedMinutes(run, muchLater)).toBe(atTermination);
    expect(sessionWallElapsedMinutes(run, muchLater)).toBe(wallAtTermination);
  });

  it("also freezes correctly when the run was paused before being discarded", () => {
    let run = newRun(legacySession());
    run = pauseRun(run, isoAfterMinutes(2)); // 2 min active before pausing
    run = terminateRun(run, "discarded", isoAfterMinutes(9)); // 7 min paused, no more active time
    const atTermination = sessionActiveElapsedMinutes(run, isoAfterMinutes(9));
    expect(atTermination).toBeCloseTo(2, 10);
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(9000))).toBe(atTermination);
  });

  it("leaves completed-run elapsed-time behavior unchanged", () => {
    const run = completeRun(newRun(legacySession()), isoAfterMinutes(5));
    const atCompletion = sessionActiveElapsedMinutes(run, isoAfterMinutes(5));
    expect(atCompletion).toBeCloseTo(5, 10);
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(5000))).toBe(atCompletion);
  });

  it("leaves live (still-incomplete, non-terminal) run behavior unchanged - it keeps measuring through `now`", () => {
    const run = newRun(legacySession());
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(3))).toBeCloseTo(3, 10);
    expect(sessionActiveElapsedMinutes(run, isoAfterMinutes(7))).toBeCloseTo(7, 10);
  });
});
