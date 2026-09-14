import type { Session, Step } from "../../../session-engine/model/schema";
import { getActiveStepId, isRunPaused, resolveNextStepId, resolvePreviousStepId } from "../../../session-engine/run/engine";
import type { SessionRun, StepRun } from "../../../session-engine/run/schema";
import {
  completedRunScheduleDeltaMinutes,
  deriveLiveScheduleStatus,
  scheduleDeltaMinutes,
  sessionActiveElapsedMinutes,
  stepActualDurationMinutes,
  type LiveScheduleStatus
} from "../../../session-engine/run/timing";

export interface InstructorModeDisplayState {
  paused: boolean;
  completed: boolean;
  currentStepId: string | undefined;
  currentStep: Step | undefined;
  currentStepRun: StepRun | undefined;
  stepNumber: number | undefined; // 1-based position for "Step X / Y"
  stepCount: number;
  sessionElapsedMinutes: number;
  stepElapsedMinutes: number | undefined;
  scheduleDeltaMinutesValue: number | undefined;
  /** Buffer-aware live status for the current Step (Phase 9B-B) - undefined once completed, since the live screen no longer renders a STATUS block by then. See deriveLiveScheduleStatus. */
  liveScheduleStatus: LiveScheduleStatus | undefined;
  /** The Session's own authored facilitation buffer in minutes - 0 when absent (Phase 9B-B). */
  facilitationBufferMinutes: number;
  /** Whether a next Step structurally exists, regardless of pause/completion - decides Next-vs-Complete labeling. */
  hasNextTarget: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  canSkip: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  /** Restart Session / Discard Run (Phase 9B-B) - available on any live, non-completed run regardless of pause state. */
  canRestart: boolean;
  canDiscard: boolean;
}

/**
 * Pure derivation of everything Instructor Mode needs to render/enable its
 * controls, from the authoritative Session + SessionRun + a display "now". Never
 * mutates run state - it only reads it, mirroring the run engine's own read-only
 * lookup helpers (resolveNextStepId/resolvePreviousStepId).
 */
export function deriveInstructorModeState(session: Session, run: SessionRun, now: string): InstructorModeDisplayState {
  const paused = isRunPaused(run);
  const completed = run.completedAt !== undefined;
  const currentStepId = getActiveStepId(run);
  const currentStep = currentStepId ? session.steps.find((step) => step.id === currentStepId) : undefined;
  const currentStepRun = currentStepId ? run.stepRuns.find((stepRun) => stepRun.stepId === currentStepId) : undefined;
  const stepNumber = currentStepId
    ? session.steps.findIndex((step) => step.id === currentStepId) + 1
    : undefined;

  const referenceNow = completed ? run.completedAt! : now;
  const sessionElapsedMinutes = sessionActiveElapsedMinutes(run, referenceNow);
  const stepElapsedMinutes = currentStepRun ? stepActualDurationMinutes(currentStepRun, referenceNow) : undefined;
  const scheduleDeltaMinutesValue = completed
    ? completedRunScheduleDeltaMinutes(run)
    : currentStepId
      ? scheduleDeltaMinutes(run, currentStepId, referenceNow)
      : undefined;

  const liveScheduleStatus =
    !completed && currentStepId !== undefined ? deriveLiveScheduleStatus(run, currentStepId, referenceNow) : undefined;

  const hasNextTarget = currentStepId !== undefined && resolveNextStepId(session, currentStepId) !== undefined;

  const canNavigate = !completed && !paused && currentStepId !== undefined;
  const canGoPrevious = canNavigate && resolvePreviousStepId(session, currentStepId!) !== undefined;
  const canGoNext = canNavigate && hasNextTarget;
  const canSkip = canNavigate;

  const canPause = !completed && !paused;
  const canResume = !completed && paused;
  const canComplete = !completed && !paused && !hasNextTarget;

  return {
    paused,
    completed,
    currentStepId,
    currentStep,
    currentStepRun,
    stepNumber,
    stepCount: session.steps.length,
    sessionElapsedMinutes,
    stepElapsedMinutes,
    scheduleDeltaMinutesValue,
    liveScheduleStatus,
    facilitationBufferMinutes: session.facilitationBufferMinutes ?? 0,
    hasNextTarget,
    canGoPrevious,
    canGoNext,
    canSkip,
    canPause,
    canResume,
    canComplete,
    canRestart: !completed,
    canDiscard: !completed
  };
}
