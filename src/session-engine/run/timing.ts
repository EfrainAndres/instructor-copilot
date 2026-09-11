import { SessionEngineError } from "../validation/errors";
import type { SessionRun, StepRun } from "./schema";

function minutesBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 60000;
}

/** Sum of a StepRun's closed intervals, plus the open one (if any) measured against `now`. */
export function stepActualDurationMinutes(stepRun: StepRun, now: string): number {
  let total = 0;
  for (const interval of stepRun.activeIntervals) {
    total += minutesBetween(interval.startedAt, interval.endedAt ?? now);
  }
  return total;
}

/** Wall-clock elapsed since the run started, through `completedAt` if the run is done, else `now`. */
export function sessionWallElapsedMinutes(run: SessionRun, now: string): number {
  return minutesBetween(run.startedAt, run.completedAt ?? now);
}

/** Sum of all pause intervals, plus the open one (if any) measured against `now`. */
export function totalPausedMinutes(run: SessionRun, now: string): number {
  let total = 0;
  for (const interval of run.pauseIntervals) {
    total += minutesBetween(interval.startedAt, interval.endedAt ?? now);
  }
  return total;
}

/** Wall elapsed minus paused time - the time actually spent teaching. */
export function sessionActiveElapsedMinutes(run: SessionRun, now: string): number {
  return sessionWallElapsedMinutes(run, now) - totalPausedMinutes(run, now);
}

function findStepRunIndex(run: SessionRun, stepId: string): number {
  const index = run.stepRuns.findIndex((stepRun) => stepRun.stepId === stepId);
  if (index < 0) {
    throw new SessionEngineError(`Step "${stepId}" is not part of this run`);
  }
  return index;
}

/**
 * Sum of snapshotted planned durations for Steps from index 0 through `stepId`'s
 * index, inclusive - the "checkpoint" the schedule delta is measured against. Uses
 * StepRun snapshots (not the live Session) so a completed run's numbers can never
 * change if the Session is edited afterward.
 */
export function plannedCheckpointMinutes(run: SessionRun, stepId: string): number {
  const index = findStepRunIndex(run, stepId);
  let total = 0;
  for (let i = 0; i <= index; i++) {
    total += run.stepRuns[i]!.plannedDurationMinutesSnapshot;
  }
  return total;
}

export function totalPlannedDurationMinutes(run: SessionRun): number {
  return run.stepRuns.reduce((sum, stepRun) => sum + stepRun.plannedDurationMinutesSnapshot, 0);
}

/**
 * Live schedule delta for the given (typically current) Step: negative means still
 * ahead of/at the planned checkpoint, positive means behind it. See
 * docs/architecture.md -> Timing and Navigation Semantics.
 */
export function scheduleDeltaMinutes(run: SessionRun, stepId: string, now: string): number {
  return sessionActiveElapsedMinutes(run, now) - plannedCheckpointMinutes(run, stepId);
}

/** Deterministic total schedule delta once a run is completed. */
export function completedRunScheduleDeltaMinutes(run: SessionRun): number {
  if (!run.completedAt) {
    throw new SessionEngineError("Run is not completed");
  }
  return sessionActiveElapsedMinutes(run, run.completedAt) - totalPlannedDurationMinutes(run);
}
