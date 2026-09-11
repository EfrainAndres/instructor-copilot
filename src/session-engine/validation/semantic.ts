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
}

export function validateAppSettingsSemantics(settings: AppSettings, file?: string): void {
  const duplicate = findDuplicate(settings.trainings.map((registration) => registration.trainingId));
  if (duplicate) {
    throw new SessionEngineError(`AppSettings has duplicate TrainingRegistration.trainingId "${duplicate}"`, file);
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
