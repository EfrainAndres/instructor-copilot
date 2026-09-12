import {
  clearActiveRunPointer,
  isRunPaused,
  loadActiveRunPointer,
  loadOrCreateAppSettings,
  loadSessionRun,
  loadTrainingBundle,
  SessionEngineError,
  validateSessionRunRecoveryCompatibility,
  type Session,
  type SessionRun,
  type TrainingBundle
} from "../session-engine";
import type { RecoveredRunResult } from "../shared/ipc";
import { getAppDataRoot } from "./appData";
import { setActiveRunAfterRecovery } from "./runController";
import { setActiveTrainingRootForRecovery } from "./trainingController";

export interface RecoveryEvaluation {
  run: SessionRun;
  session: Session;
  bundle: TrainingBundle;
  definitionRoot: string;
}

/**
 * All the recovery I/O and validation, with no Electron dependency and no
 * side effects on controller state - takes `appDataRoot` explicitly so it can
 * be unit-tested directly against a temporary directory, the same way
 * session-engine's own persistence functions are. Never scans `runs/`; the
 * pointer is the only recovery candidate source.
 */
export async function evaluateActiveRunRecovery(appDataRoot: string): Promise<RecoveryEvaluation | null> {
  const pointer = await loadActiveRunPointer(appDataRoot);
  if (!pointer) {
    return null;
  }

  const run = await loadSessionRun(appDataRoot, pointer.runId);

  if (run.completedAt) {
    // Stale pointer referencing an already-completed run: not an error, just
    // nothing to recover. Clean it up so future startups skip this check.
    await clearActiveRunPointer(appDataRoot).catch((error) => {
      console.error("Failed to clear a stale active-run pointer:", error);
    });
    return null;
  }

  if (!isRunPaused(run)) {
    throw new SessionEngineError(
      "The previous session was not suspended cleanly and cannot be automatically recovered without corrupting its timing."
    );
  }

  const settings = await loadOrCreateAppSettings(appDataRoot);
  const registration = settings.trainings.find((candidate) => candidate.trainingId === run.trainingId);
  if (!registration) {
    throw new SessionEngineError(`No Training registration exists for Training "${run.trainingId}"`);
  }

  const bundle = await loadTrainingBundle(registration.definitionRoot);
  if (bundle.training.id !== run.trainingId) {
    throw new SessionEngineError("The recovered run's Training id no longer matches its registered definition");
  }

  const session = bundle.sessions.find((candidate) => candidate.id === run.sessionId);
  if (!session) {
    throw new SessionEngineError(`Session "${run.sessionId}" does not exist in the recovered Training`);
  }

  validateSessionRunRecoveryCompatibility(run, session);

  return { run, session, bundle, definitionRoot: registration.definitionRoot };
}

/**
 * Invoked once by the renderer at startup. Thin wrapper: resolves the real
 * appDataRoot and, only once evaluation succeeds, applies recovery as main's
 * active-run/active-Training-root state.
 */
export async function restoreActiveRunOnStartup(): Promise<RecoveredRunResult | null> {
  const evaluation = await evaluateActiveRunRecovery(getAppDataRoot());
  if (!evaluation) {
    return null;
  }

  setActiveRunAfterRecovery(evaluation.run, evaluation.session);
  setActiveTrainingRootForRecovery(evaluation.definitionRoot);

  return { context: { run: evaluation.run, session: evaluation.session }, bundle: evaluation.bundle };
}
