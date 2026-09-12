import type { Session } from "../model/schema";
import { SessionEngineError } from "../validation/errors";
import type { SessionRun } from "./schema";

function idSet(ids: string[]): Set<string> {
  return new Set(ids);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Rejects resuming an incomplete SessionRun against a materially different
 * authored Session. Concurrent Session editing during an active run is outside
 * MVP scope - rather than silently rebuilding/migrating StepRuns to fit current
 * authoring, recovery simply refuses when the structural shape has drifted.
 * Unsnapshotted fields (facilitator text, resources, etc.) are fine to read from
 * current authoring - only the fields below must match exactly.
 */
export function validateSessionRunRecoveryCompatibility(run: SessionRun, session: Session): void {
  if (run.trainingId !== session.trainingId) {
    throw new SessionEngineError(
      `Recovered run belongs to Training "${run.trainingId}", not "${session.trainingId}"`
    );
  }
  if (run.sessionId !== session.id) {
    throw new SessionEngineError(`Recovered run belongs to Session "${run.sessionId}", not "${session.id}"`);
  }
  if (run.sessionTitleSnapshot !== session.title) {
    throw new SessionEngineError("Recovered run's Session title no longer matches the authored Session");
  }
  if (run.plannedDurationMinutesSnapshot !== session.plannedDurationMinutes) {
    throw new SessionEngineError(
      "Recovered run's Session planned duration no longer matches the authored Session"
    );
  }
  if (run.stepRuns.length !== session.steps.length) {
    throw new SessionEngineError(
      `Recovered run has ${run.stepRuns.length} Steps but the authored Session now has ${session.steps.length}`
    );
  }

  for (let index = 0; index < run.stepRuns.length; index++) {
    const stepRun = run.stepRuns[index]!;
    const step = session.steps[index]!;

    if (stepRun.stepOrderSnapshot !== index) {
      throw new SessionEngineError(`Step "${stepRun.stepId}" no longer occupies its snapshotted position`);
    }
    if (stepRun.stepId !== step.id) {
      throw new SessionEngineError(
        `Recovered run expects Step "${stepRun.stepId}" at position ${index}, but the authored Session has "${step.id}"`
      );
    }
    if (stepRun.stepTitleSnapshot !== step.title) {
      throw new SessionEngineError(`Step "${step.id}" title no longer matches the recovered run's snapshot`);
    }
    if (stepRun.stepTypeSnapshot !== step.type) {
      throw new SessionEngineError(`Step "${step.id}" type no longer matches the recovered run's snapshot`);
    }
    if (stepRun.plannedDurationMinutesSnapshot !== step.plannedDurationMinutes) {
      throw new SessionEngineError(
        `Step "${step.id}" planned duration no longer matches the recovered run's snapshot`
      );
    }

    const checklistIds = idSet((step.checklist ?? []).map((item) => item.id));
    const stepRunChecklistIds = idSet(Object.keys(stepRun.checklistState));
    if (!setsEqual(checklistIds, stepRunChecklistIds)) {
      throw new SessionEngineError(`Step "${step.id}" checklist items no longer match the recovered run`);
    }

    const evidenceIds = idSet((step.evidenceStages ?? []).map((stage) => stage.id));
    const stepRunEvidenceIds = idSet(Object.keys(stepRun.evidenceState));
    if (!setsEqual(evidenceIds, stepRunEvidenceIds)) {
      throw new SessionEngineError(`Step "${step.id}" evidence stages no longer match the recovered run`);
    }
  }
}
