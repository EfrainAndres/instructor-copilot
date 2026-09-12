import { randomUUID } from "node:crypto";
import {
  ACTIVE_RUN_POINTER_SCHEMA_VERSION,
  activateStep,
  clearActiveRunPointer,
  completeRun,
  createSessionRun,
  getActiveStepId,
  loadTrainingBundle,
  pauseRun,
  prepareRunForShutdown,
  releaseEvidenceStage,
  resolveNextStepId,
  resolvePreviousStepId,
  resumeRun,
  saveActiveRunPointer,
  saveSessionRun,
  SessionEngineError,
  setChecklistItem,
  skipCurrentStep,
  type Session,
  type SessionRun
} from "../session-engine";
import type { InstructorRunContext } from "../shared/ipc";
import { getAppDataRoot } from "./appData";
import { requireActiveTrainingRoot } from "./trainingController";

interface ActiveRunContext {
  run: SessionRun;
  session: Session;
}

/**
 * Phase 4B keeps the single active run in memory on main, exactly like
 * trainingController keeps the active Training root: the renderer only ever
 * refers to it through capability calls, never by holding authoritative state.
 */
let active: ActiveRunContext | null = null;

// Serializes run mutations so two rapid clicks (e.g. a double-click) can never
// race two concurrent writes to the same run file.
let mutationInFlight = false;

// Tracks whatever mutation is currently running so shutdown suspension can wait
// for it to settle rather than racing it with a second concurrent SessionRun
// write - it never itself rejects a concurrent call the way mutationInFlight does.
let currentMutationSettled: Promise<unknown> = Promise.resolve();

// Set synchronously the moment shutdown preparation begins (before any await),
// so a mutation that starts after this point is rejected outright rather than
// possibly racing the shutdown save. A mutation already in flight when this
// flips is unaffected - it is allowed to finish, and shutdown waits for it via
// currentMutationSettled.
let shutdownRequested = false;

function toPublicContext(context: ActiveRunContext): InstructorRunContext {
  return { run: context.run, session: context.session };
}

function requireActive(): ActiveRunContext {
  if (!active) {
    throw new SessionEngineError("No session run is active");
  }
  return active;
}

async function withMutationGuard<T>(operation: () => Promise<T>): Promise<T> {
  if (shutdownRequested) {
    throw new SessionEngineError("The application is preparing to quit.");
  }
  if (mutationInFlight) {
    throw new SessionEngineError("Another run update is already in progress");
  }
  mutationInFlight = true;
  const settlement = operation().finally(() => {
    mutationInFlight = false;
  });
  currentMutationSettled = settlement.catch(() => undefined);
  return settlement;
}

/**
 * Runs one transition against the active run, persists the result, and only then
 * commits it as the new active state - if persistence fails, the prior in-memory
 * run is left untouched rather than pretending the transition succeeded.
 * `afterCommit` runs after the commit but its failure never rolls the commit back
 * (used for pointer cleanup on completion, which must not undo a successful
 * completion merely because the cleanup step failed).
 */
async function mutate(
  transition: (run: SessionRun, session: Session, now: string) => SessionRun,
  afterCommit?: (nextRun: SessionRun) => Promise<void>
): Promise<InstructorRunContext> {
  return withMutationGuard(async () => {
    const current = requireActive();
    const now = new Date().toISOString();
    const nextRun = transition(current.run, current.session, now);
    await saveSessionRun(getAppDataRoot(), nextRun);
    active = { ...current, run: nextRun };
    if (afterCommit) {
      try {
        await afterCommit(nextRun);
      } catch (error) {
        console.error("Post-commit run hook failed:", error);
      }
    }
    return toPublicContext(active);
  });
}

export async function startRun(sessionId: string): Promise<InstructorRunContext> {
  return withMutationGuard(async () => {
    if (active && !active.run.completedAt) {
      throw new SessionEngineError("A session run is already active.");
    }

    const trainingRoot = requireActiveTrainingRoot();
    const bundle = await loadTrainingBundle(trainingRoot);
    const session = bundle.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new SessionEngineError(`Session "${sessionId}" does not exist in this Training`);
    }

    const now = new Date().toISOString();
    const run = createSessionRun({
      id: `run-${randomUUID()}`,
      trainingId: bundle.training.id,
      session,
      startedAt: now
    });

    const appDataRoot = getAppDataRoot();
    await saveSessionRun(appDataRoot, run);
    // The pointer must exist before this run becomes recoverable/active in memory;
    // if saving it fails, the run is never established as active (an orphaned run
    // file in that rare case is acceptable, unscanned history).
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: run.id });

    active = { run, session };
    return toPublicContext(active);
  });
}

export async function nextStep(): Promise<InstructorRunContext> {
  return mutate((run, session, now) => {
    const currentStepId = getActiveStepId(run);
    if (!currentStepId) {
      throw new SessionEngineError("No active Step to advance from");
    }
    const target = resolveNextStepId(session, currentStepId);
    if (!target) {
      throw new SessionEngineError("There is no next Step; complete the session instead");
    }
    return activateStep(run, target, now);
  });
}

export async function previousStep(): Promise<InstructorRunContext> {
  return mutate((run, session, now) => {
    const currentStepId = getActiveStepId(run);
    if (!currentStepId) {
      throw new SessionEngineError("No active Step to go back from");
    }
    const target = resolvePreviousStepId(session, currentStepId);
    if (!target) {
      throw new SessionEngineError("There is no previous Step");
    }
    return activateStep(run, target, now);
  });
}

export async function skipStep(): Promise<InstructorRunContext> {
  return mutate((run, session, now) => {
    const currentStepId = getActiveStepId(run);
    if (!currentStepId) {
      throw new SessionEngineError("No active Step to skip");
    }
    const target = resolveNextStepId(session, currentStepId);
    return skipCurrentStep(run, now, target);
  });
}

export async function pause(): Promise<InstructorRunContext> {
  return mutate((run, _session, now) => pauseRun(run, now));
}

export async function resume(): Promise<InstructorRunContext> {
  return mutate((run, _session, now) => resumeRun(run, now));
}

export async function complete(): Promise<InstructorRunContext> {
  return mutate(
    (run, _session, now) => completeRun(run, now),
    async () => {
      // The completed run file is authoritative regardless of whether this
      // cleanup succeeds; a stale pointer to a completed run is handled as a
      // non-fatal, ignorable case during future recovery.
      await clearActiveRunPointer(getAppDataRoot());
    }
  );
}

export async function setRunChecklistItem(stepId: string, itemId: string, value: boolean): Promise<InstructorRunContext> {
  return mutate((run, session) => setChecklistItem(run, session, stepId, itemId, value));
}

/**
 * Releases one EvidenceStage, restricted to the CURRENT active Step only - the
 * renderer sends just the evidenceStageId, never a stepId, so it can never
 * release evidence belonging to a different Step.
 */
export async function releaseCurrentEvidenceStage(evidenceStageId: string): Promise<InstructorRunContext> {
  return mutate((run, session) => {
    const currentStepId = getActiveStepId(run);
    if (!currentStepId) {
      throw new SessionEngineError("No active Step to release evidence for");
    }
    return releaseEvidenceStage(run, session, currentStepId, evidenceStageId);
  });
}

/** Main-internal accessors for resourceController - never exposed to the renderer. */
export function requireActiveSession(): Session {
  return requireActive().session;
}

export function getCurrentActiveStepId(): string | undefined {
  return active ? getActiveStepId(active.run) : undefined;
}

/**
 * The Training that owns the active run - resourceController must resolve
 * content roots through this trainingId, never through whichever Training
 * happens to be currently open/selected in trainingController, since those can
 * diverge if the instructor switches Trainings while a run is still incomplete.
 */
export function requireActiveRunTrainingId(): string {
  return requireActive().run.trainingId;
}

// Cached in-flight preparation Promise. Once set, every caller (repeated
// before-quit events included) joins this SAME Promise rather than each
// independently deciding "nothing to do" while the real save is still pending.
let shutdownPreparationPromise: Promise<void> | null = null;

async function performShutdownPreparation(): Promise<void> {
  // Let whatever mutation was already in flight when shutdown was requested
  // finish and persist normally; no NEW mutation can have started after this
  // point because shutdownRequested is already true (set synchronously by the
  // caller below, before this async body runs any await).
  await currentMutationSettled;

  if (!active) {
    return;
  }

  const now = new Date().toISOString();
  const suspended = prepareRunForShutdown(active.run, now);
  if (suspended === active.run) {
    // Already completed or already paused: existing persisted state is authoritative.
    return;
  }

  await saveSessionRun(getAppDataRoot(), suspended);
  active = { ...active, run: suspended };
}

/**
 * Suspends the active run before the app quits, so it can never be left with an
 * open, unpaused Step interval.
 *
 * - No active run, or the active run is already completed: no-op.
 * - The active run is already paused: no-op - its persisted state is already
 *   authoritative and correct.
 * - Otherwise: pauses it (opening a pause interval that intentionally spans the
 *   offline period) and persists that before updating in-memory state.
 *
 * Joinable: every call while preparation is still pending returns the SAME
 * Promise, never an early/independent "nothing to do" result. Blocks new run
 * mutations from starting the moment it's first called (see withMutationGuard)
 * so a renderer-triggered mutation can never race the shutdown save.
 */
export function prepareActiveRunForShutdown(): Promise<void> {
  if (shutdownPreparationPromise) {
    return shutdownPreparationPromise;
  }
  shutdownRequested = true;
  shutdownPreparationPromise = performShutdownPreparation();
  return shutdownPreparationPromise;
}

/**
 * Main-internal only - restores the in-memory active run context after a
 * successful recovery validation. Never called from an IPC handler directly;
 * only from the startup recovery sequence once every check has passed.
 */
export function setActiveRunAfterRecovery(run: SessionRun, session: Session): void {
  active = { run, session };
}

/** Main-internal only - a read-only snapshot of the active run, for tests. */
export function getActiveRunSnapshot(): SessionRun | undefined {
  return active?.run;
}
