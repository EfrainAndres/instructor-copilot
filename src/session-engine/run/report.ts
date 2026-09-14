import type { StepType } from "../model/schema";
import { SessionEngineError } from "../validation/errors";
import type { InstructorNote, SessionRun } from "./schema";
import {
  completedRunScheduleDeltaMinutes,
  plannedBufferMinutes,
  sessionActiveElapsedMinutes,
  stepActualDurationMinutes,
  totalPausedMinutes,
  totalPlannedDurationMinutes
} from "./timing";

export type RunReportStepStatus = "on_time" | "over" | "under" | "skipped" | "not_reached";

export interface RunReportStep {
  stepId: string;
  order: number;
  title: string;
  type: StepType;
  plannedMinutes: number;
  actualMinutes: number;
  deltaMinutes: number;
  status: RunReportStepStatus;
  notes: InstructorNote[];
}

export interface RunReport {
  runId: string;
  sessionId: string;
  sessionTitle: string;
  startedAt: string;
  completedAt: string;
  /** Sum of Step plans only (excludes any facilitation buffer) - unchanged meaning from Phase 7. */
  plannedMinutes: number;
  actualMinutes: number;
  pausedMinutes: number;
  /** Against the Session's own planned total (Step plans + buffer, e.g. 90) - see completedRunScheduleDeltaMinutes. */
  deltaMinutes: number;
  /** The Session's own explicit facilitation buffer (Phase 9B-B), derived from snapshots - 0 for any run with none. */
  plannedBufferMinutes: number;
  /** How much of the planned buffer was actually used, capped at plannedBufferMinutes - never negative, never counts ordinary Step overruns as "buffer used" beyond what the buffer could absorb. */
  bufferUsedMinutes: number;
  steps: RunReportStep[];
  doneCount: number;
  skippedCount: number;
  notReachedCount: number;
}

// Floating-point minute math can leave a value like 4.999999999999 instead of 5;
// only an epsilon this small is normalized to zero - never a real ±30s/±1min
// "close enough" tolerance, which the product spec explicitly rejects for MVP.
const DELTA_EPSILON = 1e-9;

function normalizeDelta(delta: number): number {
  return Math.abs(delta) < DELTA_EPSILON ? 0 : delta;
}

/**
 * Builds a Run Report entirely from SessionRun's own historical snapshots and
 * intervals - it never reads the current authored Session/Step, so a later
 * edit to that Session can never rewrite a completed run's report. Rejects an
 * incomplete run since "planned vs actual" only makes sense once every Step's
 * interval is closed, and rejects a discarded/restarted run outright - an
 * abandoned attempt is never eligible for a normal completed Run Report (see
 * docs/architecture.md -> Run Lifecycle).
 */
export function buildRunReport(run: SessionRun): RunReport {
  if (run.termination) {
    throw new SessionEngineError(`Cannot build a Run Report for a ${run.termination.kind} run`);
  }
  if (!run.completedAt) {
    throw new SessionEngineError("Cannot build a Run Report for an incomplete run");
  }
  const completedAt = run.completedAt;

  const notesByStep = new Map<string, InstructorNote[]>();
  for (const note of run.notes) {
    const existing = notesByStep.get(note.stepId);
    if (existing) {
      existing.push(note);
    } else {
      notesByStep.set(note.stepId, [note]);
    }
  }
  for (const notes of notesByStep.values()) {
    notes.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }

  const sortedStepRuns = [...run.stepRuns].sort((a, b) => a.stepOrderSnapshot - b.stepOrderSnapshot);

  let doneCount = 0;
  let skippedCount = 0;
  let notReachedCount = 0;

  const steps: RunReportStep[] = sortedStepRuns.map((stepRun) => {
    const plannedMinutes = stepRun.plannedDurationMinutesSnapshot;
    const actualMinutes = stepActualDurationMinutes(stepRun, completedAt);
    const deltaMinutes = normalizeDelta(actualMinutes - plannedMinutes);

    let status: RunReportStepStatus;
    if (stepRun.status === "skipped") {
      status = "skipped";
      skippedCount += 1;
    } else if (stepRun.status === "pending") {
      status = "not_reached";
      notReachedCount += 1;
    } else {
      // "done" - a completed SessionRun can never contain an "active" StepRun
      // (validateSessionRunSemantics enforces this), so this is always final.
      doneCount += 1;
      if (deltaMinutes > 0) {
        status = "over";
      } else if (deltaMinutes < 0) {
        status = "under";
      } else {
        status = "on_time";
      }
    }

    return {
      stepId: stepRun.stepId,
      order: stepRun.stepOrderSnapshot,
      title: stepRun.stepTitleSnapshot,
      type: stepRun.stepTypeSnapshot,
      plannedMinutes,
      actualMinutes,
      deltaMinutes,
      status,
      notes: notesByStep.get(stepRun.stepId) ?? []
    };
  });

  const stepPlannedSum = totalPlannedDurationMinutes(run);
  const actualMinutes = sessionActiveElapsedMinutes(run, completedAt);
  const buffer = plannedBufferMinutes(run);
  const bufferUsed = normalizeDelta(Math.max(0, Math.min(actualMinutes - stepPlannedSum, buffer)));

  return {
    runId: run.id,
    sessionId: run.sessionId,
    sessionTitle: run.sessionTitleSnapshot,
    startedAt: run.startedAt,
    completedAt,
    plannedMinutes: stepPlannedSum,
    actualMinutes,
    pausedMinutes: totalPausedMinutes(run, completedAt),
    deltaMinutes: normalizeDelta(completedRunScheduleDeltaMinutes(run)),
    plannedBufferMinutes: buffer,
    bufferUsedMinutes: bufferUsed,
    steps,
    doneCount,
    skippedCount,
    notReachedCount
  };
}
