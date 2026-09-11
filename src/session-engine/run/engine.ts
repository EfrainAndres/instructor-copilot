import type { Session } from "../model/schema";
import { SessionEngineError } from "../validation/errors";
import { validateSessionRunSemantics, type SessionRun, type StepRun, type TimeInterval } from "./schema";
import { SESSION_RUN_SCHEMA_VERSION } from "./schema";

function assertValidTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new SessionEngineError(`${label} is not a valid ISO timestamp: "${value}"`);
  }
}

function latestKnownInstant(run: SessionRun): number {
  const timestamps: string[] = [run.startedAt];
  if (run.completedAt) timestamps.push(run.completedAt);
  for (const interval of run.pauseIntervals) {
    timestamps.push(interval.startedAt);
    if (interval.endedAt) timestamps.push(interval.endedAt);
  }
  for (const stepRun of run.stepRuns) {
    for (const interval of stepRun.activeIntervals) {
      timestamps.push(interval.startedAt);
      if (interval.endedAt) timestamps.push(interval.endedAt);
    }
  }
  return Math.max(...timestamps.map((timestamp) => Date.parse(timestamp)));
}

function assertTimeNotBackwards(run: SessionRun, now: string): void {
  assertValidTimestamp(now, "now");
  if (Date.parse(now) < latestKnownInstant(run)) {
    throw new SessionEngineError("Time cannot move backwards");
  }
}

function assertNotCompleted(run: SessionRun): void {
  if (run.completedAt) {
    throw new SessionEngineError("Run is already completed");
  }
}

function getOpenPauseInterval(run: SessionRun): TimeInterval | undefined {
  return run.pauseIntervals.find((interval) => interval.endedAt === undefined);
}

export function isRunPaused(run: SessionRun): boolean {
  return getOpenPauseInterval(run) !== undefined;
}

function assertNotPaused(run: SessionRun, action: string): void {
  if (isRunPaused(run)) {
    throw new SessionEngineError(`Cannot ${action} while paused`);
  }
}

export function getActiveStepRun(run: SessionRun): StepRun | undefined {
  return run.stepRuns.find((stepRun) => stepRun.status === "active");
}

export function getActiveStepId(run: SessionRun): string | undefined {
  return getActiveStepRun(run)?.stepId;
}

function requireStepRun(run: SessionRun, stepId: string): StepRun {
  const stepRun = run.stepRuns.find((candidate) => candidate.stepId === stepId);
  if (!stepRun) {
    throw new SessionEngineError(`Step "${stepId}" does not exist in this run`);
  }
  return stepRun;
}

/** Closes a StepRun's open interval (if any) and sets its final status. */
function closeStepRun(stepRun: StepRun, now: string, status: "done" | "skipped"): StepRun {
  const activeIntervals = stepRun.activeIntervals.map((interval, index) =>
    index === stepRun.activeIntervals.length - 1 && interval.endedAt === undefined
      ? { ...interval, endedAt: now }
      : interval
  );
  return { ...stepRun, status, activeIntervals };
}

/** Closes a StepRun's open interval but keeps its current status (used by pause). */
function closeStepRunIntervalOnly(stepRun: StepRun, now: string): StepRun {
  const activeIntervals = stepRun.activeIntervals.map((interval, index) =>
    index === stepRun.activeIntervals.length - 1 && interval.endedAt === undefined
      ? { ...interval, endedAt: now }
      : interval
  );
  return { ...stepRun, activeIntervals };
}

/** Opens a new interval on a StepRun and marks it active (used for first activation and revisits). */
function openStepRun(stepRun: StepRun, now: string): StepRun {
  return { ...stepRun, status: "active", activeIntervals: [...stepRun.activeIntervals, { startedAt: now }] };
}

function finalizeAndValidate(run: SessionRun): SessionRun {
  validateSessionRunSemantics(run);
  return run;
}

export interface CreateSessionRunInput {
  id: string;
  trainingId: string;
  session: Session;
  startedAt: string;
}

/**
 * Creates a SessionRun from an authored Session. The first authored Step (if any)
 * becomes active immediately, with its first interval starting at `startedAt`. A
 * Session with zero Steps produces a run with no active Step, which can still be
 * completed directly.
 */
export function createSessionRun(input: CreateSessionRunInput): SessionRun {
  assertValidTimestamp(input.startedAt, "startedAt");

  const stepRuns: StepRun[] = input.session.steps.map((step, index) => {
    const isFirst = index === 0;
    return {
      stepId: step.id,
      status: isFirst ? "active" : "pending",
      activeIntervals: isFirst ? [{ startedAt: input.startedAt }] : [],
      checklistState: Object.fromEntries((step.checklist ?? []).map((item) => [item.id, false])),
      evidenceState: Object.fromEntries((step.evidenceStages ?? []).map((stage) => [stage.id, "locked" as const])),
      stepTitleSnapshot: step.title,
      stepTypeSnapshot: step.type,
      plannedDurationMinutesSnapshot: step.plannedDurationMinutes,
      stepOrderSnapshot: index
    };
  });

  const run: SessionRun = {
    id: input.id,
    schemaVersion: SESSION_RUN_SCHEMA_VERSION,
    sessionId: input.session.id,
    trainingId: input.trainingId,
    startedAt: input.startedAt,
    pauseIntervals: [],
    stepRuns,
    notes: [],
    sessionTitleSnapshot: input.session.title,
    plannedDurationMinutesSnapshot: input.session.plannedDurationMinutes
  };

  return finalizeAndValidate(run);
}

/**
 * Moves the active Step to `targetStepId` (Next, Previous, or a manual jump): closes
 * the current Step's interval and marks it done, then opens a fresh interval on the
 * target - even if the target was previously done/skipped (a deliberate revisit).
 * A no-op if the target is already the active Step.
 */
export function activateStep(run: SessionRun, targetStepId: string, now: string): SessionRun {
  assertNotCompleted(run);
  assertNotPaused(run, "navigate");
  assertTimeNotBackwards(run, now);
  requireStepRun(run, targetStepId);

  const current = getActiveStepRun(run);
  if (current?.stepId === targetStepId) {
    return run;
  }

  const stepRuns = run.stepRuns.map((stepRun) => {
    if (current && stepRun.stepId === current.stepId) {
      return closeStepRun(stepRun, now, "done");
    }
    if (stepRun.stepId === targetStepId) {
      return openStepRun(stepRun, now);
    }
    return stepRun;
  });

  return finalizeAndValidate({ ...run, stepRuns });
}

/**
 * Marks the current active Step as skipped and, if `targetStepId` is given, activates
 * it. Skipping is not permanent - the target Step (or a later revisit) can still
 * become active and finish normally.
 */
export function skipCurrentStep(run: SessionRun, now: string, targetStepId?: string): SessionRun {
  assertNotCompleted(run);
  assertNotPaused(run, "skip");
  assertTimeNotBackwards(run, now);

  const current = getActiveStepRun(run);
  if (!current) {
    throw new SessionEngineError("No active Step to skip");
  }
  if (targetStepId) {
    requireStepRun(run, targetStepId);
  }

  const stepRuns = run.stepRuns.map((stepRun) => {
    if (stepRun.stepId === current.stepId) {
      return closeStepRun(stepRun, now, "skipped");
    }
    if (targetStepId && stepRun.stepId === targetStepId) {
      return openStepRun(stepRun, now);
    }
    return stepRun;
  });

  return finalizeAndValidate({ ...run, stepRuns });
}

/** Closes the active Step's open interval (keeping it logically active) and opens a session-level pause interval. */
export function pauseRun(run: SessionRun, now: string): SessionRun {
  assertNotCompleted(run);
  if (isRunPaused(run)) {
    throw new SessionEngineError("Run is already paused");
  }
  assertTimeNotBackwards(run, now);

  const current = getActiveStepRun(run);
  const stepRuns = current
    ? run.stepRuns.map((stepRun) => (stepRun.stepId === current.stepId ? closeStepRunIntervalOnly(stepRun, now) : stepRun))
    : run.stepRuns;

  const pauseIntervals: TimeInterval[] = [...run.pauseIntervals, { startedAt: now }];

  return finalizeAndValidate({ ...run, stepRuns, pauseIntervals });
}

/** Closes the open pause interval and opens a fresh interval on the (still) active Step. */
export function resumeRun(run: SessionRun, now: string): SessionRun {
  assertNotCompleted(run);
  const openPause = getOpenPauseInterval(run);
  if (!openPause) {
    throw new SessionEngineError("Run is not paused");
  }
  assertTimeNotBackwards(run, now);

  const pauseIntervals = run.pauseIntervals.map((interval) => (interval === openPause ? { ...interval, endedAt: now } : interval));

  const current = getActiveStepRun(run);
  const stepRuns = current
    ? run.stepRuns.map((stepRun) => (stepRun.stepId === current.stepId ? openStepRun(stepRun, now) : stepRun))
    : run.stepRuns;

  return finalizeAndValidate({ ...run, stepRuns, pauseIntervals });
}

/** Closes the active Step and sets completedAt. Rejects an already-completed or paused run. */
export function completeRun(run: SessionRun, now: string): SessionRun {
  assertNotCompleted(run);
  if (isRunPaused(run)) {
    throw new SessionEngineError("Cannot complete a run while paused; resume it first");
  }
  assertTimeNotBackwards(run, now);

  const current = getActiveStepRun(run);
  const stepRuns = current
    ? run.stepRuns.map((stepRun) => (stepRun.stepId === current.stepId ? closeStepRun(stepRun, now, "done") : stepRun))
    : run.stepRuns;

  return finalizeAndValidate({ ...run, stepRuns, completedAt: now });
}

/** Sets a single checklist item's completion state for one Step's run. Allowed anytime before completion, including while paused. */
export function setChecklistItem(run: SessionRun, session: Session, stepId: string, itemId: string, value: boolean): SessionRun {
  assertNotCompleted(run);

  const step = session.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new SessionEngineError(`Step "${stepId}" does not exist in this session`);
  }
  if (!(step.checklist ?? []).some((item) => item.id === itemId)) {
    throw new SessionEngineError(`Checklist item "${itemId}" does not exist on step "${stepId}"`);
  }
  requireStepRun(run, stepId);

  const stepRuns = run.stepRuns.map((stepRun) =>
    stepRun.stepId === stepId ? { ...stepRun, checklistState: { ...stepRun.checklistState, [itemId]: value } } : stepRun
  );

  return finalizeAndValidate({ ...run, stepRuns });
}

/**
 * Next-Step lookup for Phase 4B: prefers the authored Step's explicit `nextStepId`,
 * falling back to the following Step in authored `Session.steps` order. Returns
 * undefined when there is no next Step (Phase 4B can then offer/perform Complete).
 * Pure lookup - never mutates run state.
 */
export function resolveNextStepId(session: Session, currentStepId: string): string | undefined {
  const index = session.steps.findIndex((step) => step.id === currentStepId);
  if (index < 0) {
    throw new SessionEngineError(`Step "${currentStepId}" does not exist in this session`);
  }
  const step = session.steps[index]!;
  if (step.nextStepId) {
    return step.nextStepId;
  }
  return session.steps[index + 1]?.id;
}

/**
 * Previous-Step lookup for Phase 4B: the immediately preceding Step in authored
 * `Session.steps` order. No navigation-history subsystem in the MVP. Pure lookup -
 * never mutates run state.
 */
export function resolvePreviousStepId(session: Session, currentStepId: string): string | undefined {
  const index = session.steps.findIndex((step) => step.id === currentStepId);
  if (index < 0) {
    throw new SessionEngineError(`Step "${currentStepId}" does not exist in this session`);
  }
  return session.steps[index - 1]?.id;
}
