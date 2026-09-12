export * from "./model/schema";
export { SessionEngineError } from "./validation/errors";
export { isSafeId } from "./validation/ids";
export type { TrainingBundle } from "./persistence/trainingRepository";
export {
  loadTraining,
  loadSession,
  loadTrainingBundle,
  saveTraining,
  saveSession,
  trainingDefinitionExists
} from "./persistence/trainingRepository";

export * from "./run/schema";
export * from "./run/engine";
export * from "./run/timing";
export { loadSessionRun, saveSessionRun } from "./run/persistence";
export * from "./run/activeRunPointer";
export { validateSessionRunRecoveryCompatibility } from "./run/recoveryCompatibility";

export { collectRequiredContentRootIds } from "./model/contentRoots";
export { resolveWithinRoot } from "./resources/pathContainment";
export { buildCommandExecutionPlan, type CommandExecutionPlan } from "./resources/commandExecutionPlan";
export {
  loadAppSettings,
  loadOrCreateAppSettings,
  saveAppSettings,
  upsertTrainingRegistration,
  setContentRoot,
  clearContentRoot,
  findContentRootPath
} from "./persistence/appSettingsRepository";
