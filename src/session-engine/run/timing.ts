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

/**
 * The instant a run stops accumulating wall-clock time: `completedAt` for a
 * normally completed run, `termination.at` for a discarded/restarted
 * (abandoned) run - both are permanent endpoints - otherwise `now` for a still-
 * live run. Centralizing this is what makes an abandoned run's elapsed time
 * freeze at the moment it was abandoned rather than continuing to grow every
 * time it's re-rendered against a later `now` (see docs/architecture.md ->
 * Run Lifecycle).
 */
function terminalEndpoint(run: SessionRun, now: string): string {
  return run.completedAt ?? run.termination?.at ?? now;
}

/** Wall-clock elapsed since the run started, through its terminal endpoint (completedAt or termination.at) if the run has ended, else `now`. */
export function sessionWallElapsedMinutes(run: SessionRun, now: string): number {
  return minutesBetween(run.startedAt, terminalEndpoint(run, now));
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

/**
 * Deterministic total schedule delta once a run is completed - measured against
 * the Session's own snapshotted planned duration (`plannedDurationMinutesSnapshot`,
 * e.g. 90 for a Session with an explicit facilitationBufferMinutes), NOT merely
 * the sum of Step plans (e.g. 85). For a legacy Session with no buffer, the two
 * are equal, so this is unchanged for every run created before Phase 9B-B. See
 * docs/architecture.md -> Run Lifecycle and Timing.
 */
export function completedRunScheduleDeltaMinutes(run: SessionRun): number {
  if (!run.completedAt) {
    throw new SessionEngineError("Run is not completed");
  }
  return sessionActiveElapsedMinutes(run, run.completedAt) - run.plannedDurationMinutesSnapshot;
}

/** The run's own derived facilitation buffer: Session plan minus the sum of Step plans - zero for any run with no explicit buffer (every run created before Phase 9B-B). Never a separate persisted field (see docs/data-model.md). */
export function plannedBufferMinutes(run: SessionRun): number {
  return Math.max(0, run.plannedDurationMinutesSnapshot - totalPlannedDurationMinutes(run));
}

export type LiveScheduleStatusKind = "on_plan" | "in_buffer" | "behind";

export interface LiveScheduleStatus {
  kind: LiveScheduleStatusKind;
  magnitudeMinutes: number;
}

/** True when `stepId`'s StepRun occupies the highest `stepOrderSnapshot` in the run - i.e. it is the run's final authored Step, independent of `nextStepId` overrides (the checkpoint model has always been array-order-based, see docs/architecture.md -> Timing and Navigation Semantics). */
function isFinalStepRunByOrder(run: SessionRun, stepId: string): boolean {
  const index = findStepRunIndex(run, stepId);
  const maxOrder = Math.max(...run.stepRuns.map((stepRun) => stepRun.stepOrderSnapshot));
  return run.stepRuns[index]!.stepOrderSnapshot === maxOrder;
}

/**
 * Live (not-yet-completed) buffer-aware schedule status for the given
 * (typically current) Step - see docs/architecture.md -> Run Lifecycle and
 * Timing. On every Step except the run's final one, this is exactly
 * `scheduleDeltaMinutes` in disguise: "on_plan" when at/ahead of the Step's own
 * checkpoint, "behind" otherwise - the facilitation buffer never hides lateness
 * on Slides 1..N-1. Only on the FINAL Step, once elapsed time passes that
 * Step's checkpoint (which by construction equals the full sum of Step plans)
 * but has not yet exceeded the Session's own planned total, does this report
 * "in_buffer" instead of "behind" - reflecting that the instructor is inside
 * the explicit facilitation buffer, not actually late. For a legacy Session
 * with no buffer (Step-plan sum == Session plan), the final Step's checkpoint
 * already equals the Session total, so "in_buffer" can never occur and this
 * reduces exactly to the pre-9B-B on_plan/behind behavior.
 */
export function deriveLiveScheduleStatus(run: SessionRun, stepId: string, now: string): LiveScheduleStatus {
  const activeElapsed = sessionActiveElapsedMinutes(run, now);
  const checkpoint = plannedCheckpointMinutes(run, stepId);
  const delta = activeElapsed - checkpoint;

  if (delta <= 0) {
    return { kind: "on_plan", magnitudeMinutes: -delta };
  }

  if (isFinalStepRunByOrder(run, stepId)) {
    if (activeElapsed <= run.plannedDurationMinutesSnapshot) {
      return { kind: "in_buffer", magnitudeMinutes: run.plannedDurationMinutesSnapshot - activeElapsed };
    }
    return { kind: "behind", magnitudeMinutes: activeElapsed - run.plannedDurationMinutesSnapshot };
  }

  return { kind: "behind", magnitudeMinutes: delta };
}
