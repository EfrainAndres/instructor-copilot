import { randomUUID } from "node:crypto";
import {
  activateStep,
  completeRun,
  createSessionRun,
  getActiveStepId,
  loadTrainingBundle,
  pauseRun,
  releaseEvidenceStage,
  resolveNextStepId,
  resolvePreviousStepId,
  resumeRun,
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
  if (mutationInFlight) {
    throw new SessionEngineError("Another run update is already in progress");
  }
  mutationInFlight = true;
  try {
    return await operation();
  } finally {
    mutationInFlight = false;
  }
}

/**
 * Runs one transition against the active run, persists the result, and only then
 * commits it as the new active state - if persistence fails, the prior in-memory
 * run is left untouched rather than pretending the transition succeeded.
 */
async function mutate(
  transition: (run: SessionRun, session: Session, now: string) => SessionRun
): Promise<InstructorRunContext> {
  return withMutationGuard(async () => {
    const current = requireActive();
    const now = new Date().toISOString();
    const nextRun = transition(current.run, current.session, now);
    await saveSessionRun(getAppDataRoot(), nextRun);
    active = { ...current, run: nextRun };
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

    await saveSessionRun(getAppDataRoot(), run);
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
  return mutate((run, _session, now) => completeRun(run, now));
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
