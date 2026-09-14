import { isAbsolute } from "node:path";
import type { AppSettings, Session, Step, Training } from "../model/schema";
import { SessionEngineError } from "./errors";

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

export function validateTrainingSemantics(training: Training, file?: string): void {
  const duplicate = findDuplicate(training.sessionRefs);
  if (duplicate) {
    throw new SessionEngineError(`Training.sessionRefs contains duplicate id "${duplicate}"`, file);
  }
}

function validateStepLocalIds(step: Step, file?: string): void {
  const checklistIds = (step.checklist ?? []).map((item) => item.id);
  const duplicateChecklist = findDuplicate(checklistIds);
  if (duplicateChecklist) {
    throw new SessionEngineError(
      `Step "${step.id}" has duplicate checklist item id "${duplicateChecklist}"`,
      file
    );
  }

  const resourceIds = (step.resources ?? []).map((resource) => resource.id);
  const duplicateResource = findDuplicate(resourceIds);
  if (duplicateResource) {
    throw new SessionEngineError(`Step "${step.id}" has duplicate resource id "${duplicateResource}"`, file);
  }

  const evidenceIds = (step.evidenceStages ?? []).map((stage) => stage.id);
  const duplicateEvidence = findDuplicate(evidenceIds);
  if (duplicateEvidence) {
    throw new SessionEngineError(
      `Step "${step.id}" has duplicate evidence stage id "${duplicateEvidence}"`,
      file
    );
  }
}

// Floating-point minute sums (e.g. 1+4+2+3+2+7+4+5+5+5+4+12+8+6+5+7+5) can leave
// a residual like 84.99999999999999 - this tolerance absorbs that noise without
// masking a genuine authoring mismatch (which would be off by whole seconds/minutes).
const DURATION_SUM_TOLERANCE_MINUTES = 1e-6;

export function validateSessionSemantics(session: Session, file?: string): void {
  const stepIds = session.steps.map((step) => step.id);
  const duplicateStep = findDuplicate(stepIds);
  if (duplicateStep) {
    throw new SessionEngineError(`Session "${session.id}" has duplicate step id "${duplicateStep}"`, file);
  }

  const stepIdSet = new Set(stepIds);
  for (const step of session.steps) {
    validateStepLocalIds(step, file);

    if (step.nextStepId && !stepIdSet.has(step.nextStepId)) {
      throw new SessionEngineError(
        `Step "${step.id}" has nextStepId "${step.nextStepId}" which does not exist in session "${session.id}"`,
        file
      );
    }
  }

  // Only enforced when a Session explicitly declares a facilitation buffer -
  // Sessions authored before Phase 9B-B (no such field) keep their existing
  // behavior exactly: their Step-duration sum is never checked against
  // plannedDurationMinutes here.
  if (session.facilitationBufferMinutes !== undefined) {
    const stepDurationSum = session.steps.reduce((sum, step) => sum + step.plannedDurationMinutes, 0);
    const expectedTotal = stepDurationSum + session.facilitationBufferMinutes;
    if (Math.abs(expectedTotal - session.plannedDurationMinutes) > DURATION_SUM_TOLERANCE_MINUTES) {
      throw new SessionEngineError(
        `Session "${session.id}" Step durations (${stepDurationSum}) + facilitationBufferMinutes (${session.facilitationBufferMinutes}) must equal plannedDurationMinutes (${session.plannedDurationMinutes})`,
        file
      );
    }
  }
}

/**
 * TrainingRegistration.definitionRoot and every contentRoots[rootId] are
 * machine-local absolute filesystem paths (see docs/data-model.md). This checks
 * only that shape - it never checks the path actually exists on disk, since a
 * moved/missing configured directory is a runtime configuration problem, not a
 * schema-corruption problem.
 */
export function validateAppSettingsSemantics(settings: AppSettings, file?: string): void {
  const duplicate = findDuplicate(settings.trainings.map((registration) => registration.trainingId));
  if (duplicate) {
    throw new SessionEngineError(`AppSettings has duplicate TrainingRegistration.trainingId "${duplicate}"`, file);
  }

  for (const registration of settings.trainings) {
    if (!isAbsolute(registration.definitionRoot)) {
      throw new SessionEngineError(
        `TrainingRegistration "${registration.trainingId}" has a non-absolute definitionRoot "${registration.definitionRoot}"`,
        file
      );
    }
    for (const [rootId, absolutePath] of Object.entries(registration.contentRoots)) {
      if (!isAbsolute(absolutePath)) {
        throw new SessionEngineError(
          `TrainingRegistration "${registration.trainingId}" has a non-absolute content root "${rootId}" -> "${absolutePath}"`,
          file
        );
      }
    }
  }
}

export function validateSessionMatchesTraining(
  session: Session,
  expectedTrainingId: string,
  expectedSessionId: string,
  file?: string
): void {
  if (session.trainingId !== expectedTrainingId) {
    throw new SessionEngineError(
      `Session "${session.id}" has trainingId "${session.trainingId}" but was loaded under training "${expectedTrainingId}"`,
      file
    );
  }

  if (session.id !== expectedSessionId) {
    throw new SessionEngineError(
      `Session file for sessionRef "${expectedSessionId}" declares id "${session.id}"`,
      file
    );
  }
}
