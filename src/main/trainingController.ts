import { dialog, type BrowserWindow } from "electron";
import {
  clearContentRoot,
  collectRequiredContentRootIds,
  loadOrCreateAppSettings,
  loadTraining,
  loadTrainingBundle,
  saveAppSettings,
  saveSession,
  saveTraining,
  SESSION_SCHEMA_VERSION,
  SessionEngineError,
  setContentRoot,
  TRAINING_SCHEMA_VERSION,
  trainingDefinitionExists,
  upsertTrainingRegistration,
  type Session,
  type Training,
  type TrainingBundle
} from "../session-engine";
import type {
  ContentRootStatus,
  ConfigureContentRootResult,
  CreateSessionInput,
  CreateTrainingInput,
  OpenOrCreateTrainingResult,
  SaveTrainingMetadataInput
} from "../shared/ipc";
import { getAppDataRoot } from "./appData";

/**
 * Phase 3A keeps a single active Training root owned by main. The renderer never
 * sees or submits this path directly - it only ever refers to the current Training
 * by its domain data, obtained through training:get-current.
 */
let activeTrainingRoot: string | null = null;

async function pickDirectory(
  window: BrowserWindow | null,
  properties: Array<"openDirectory" | "createDirectory">
): Promise<string | null> {
  const result = window
    ? await dialog.showOpenDialog(window, { properties })
    : await dialog.showOpenDialog({ properties });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

export function requireActiveTrainingRoot(): string {
  if (!activeTrainingRoot) {
    throw new SessionEngineError("No Training is currently open");
  }
  return activeTrainingRoot;
}

/**
 * Registers (or refreshes) this Training's machine-local definitionRoot in
 * AppSettings. Only called after the Training itself has been successfully
 * opened/created; refreshing preserves any content roots already configured.
 */
async function registerActiveTraining(trainingId: string, definitionRoot: string): Promise<void> {
  const appDataRoot = getAppDataRoot();
  const settings = await loadOrCreateAppSettings(appDataRoot);
  const updated = upsertTrainingRegistration(settings, trainingId, definitionRoot);
  await saveAppSettings(appDataRoot, updated);
}

export async function openTraining(window: BrowserWindow | null): Promise<OpenOrCreateTrainingResult> {
  const directory = await pickDirectory(window, ["openDirectory"]);
  if (!directory) {
    return { canceled: true };
  }
  const bundle = await loadTrainingBundle(directory);
  await registerActiveTraining(bundle.training.id, directory);
  activeTrainingRoot = directory;
  return { canceled: false, bundle };
}

export async function createTraining(
  window: BrowserWindow | null,
  input: CreateTrainingInput
): Promise<OpenOrCreateTrainingResult> {
  const directory = await pickDirectory(window, ["openDirectory", "createDirectory"]);
  if (!directory) {
    return { canceled: true };
  }

  if (await trainingDefinitionExists(directory)) {
    throw new SessionEngineError("This folder already contains a Training definition. Use Open Training instead.");
  }

  const training: Training = {
    id: input.id,
    schemaVersion: TRAINING_SCHEMA_VERSION,
    title: input.title,
    description: input.description,
    sessionRefs: []
  };

  await saveTraining(directory, training);
  await registerActiveTraining(training.id, directory);
  activeTrainingRoot = directory;
  return { canceled: false, bundle: { training, sessions: [] } };
}

export async function getCurrentTraining(): Promise<TrainingBundle | null> {
  if (!activeTrainingRoot) {
    return null;
  }
  return loadTrainingBundle(activeTrainingRoot);
}

export async function saveTrainingMetadata(input: SaveTrainingMetadataInput): Promise<TrainingBundle> {
  const root = requireActiveTrainingRoot();
  const current = await loadTraining(root);
  const updated: Training = { ...current, title: input.title, description: input.description };
  await saveTraining(root, updated);
  return loadTrainingBundle(root);
}

/**
 * Writes the new session file before updating Training.sessionRefs, so the only
 * possible partial-failure outcome is a harmless orphaned session file - never a
 * Training that references a session file that doesn't exist (which would make
 * the whole Training fail to load).
 */
export async function createSession(input: CreateSessionInput): Promise<TrainingBundle> {
  const root = requireActiveTrainingRoot();
  const training = await loadTraining(root);

  if (training.sessionRefs.includes(input.id)) {
    throw new SessionEngineError(`A session with id "${input.id}" already exists in this Training`);
  }

  const session: Session = {
    id: input.id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    trainingId: training.id,
    title: input.title,
    plannedDurationMinutes: input.plannedDurationMinutes,
    steps: []
  };

  await saveSession(root, session);

  const updatedTraining: Training = { ...training, sessionRefs: [...training.sessionRefs, input.id] };
  await saveTraining(root, updatedTraining);

  return loadTrainingBundle(root);
}

export async function saveSessionData(session: Session): Promise<TrainingBundle> {
  const root = requireActiveTrainingRoot();
  await saveSession(root, session);
  return loadTrainingBundle(root);
}

export async function getContentRootStatus(): Promise<ContentRootStatus[]> {
  const root = requireActiveTrainingRoot();
  const bundle = await loadTrainingBundle(root);
  const requiredIds = collectRequiredContentRootIds(bundle.sessions);

  const settings = await loadOrCreateAppSettings(getAppDataRoot());
  const registration = settings.trainings.find((candidate) => candidate.trainingId === bundle.training.id);
  const configuredIds = new Set(registration ? Object.keys(registration.contentRoots) : []);

  return requiredIds.map((id) => ({ id, configured: configuredIds.has(id) }));
}

export async function configureContentRoot(
  window: BrowserWindow | null,
  rootId: string
): Promise<ConfigureContentRootResult> {
  const root = requireActiveTrainingRoot();
  const training = await loadTraining(root);

  const directory = await pickDirectory(window, ["openDirectory", "createDirectory"]);
  if (!directory) {
    return { canceled: true };
  }

  const appDataRoot = getAppDataRoot();
  const settings = await loadOrCreateAppSettings(appDataRoot);
  const updated = setContentRoot(settings, training.id, rootId, directory);
  await saveAppSettings(appDataRoot, updated);

  return { canceled: false, status: await getContentRootStatus() };
}

export async function clearContentRootForActiveTraining(rootId: string): Promise<ContentRootStatus[]> {
  const root = requireActiveTrainingRoot();
  const training = await loadTraining(root);

  const appDataRoot = getAppDataRoot();
  const settings = await loadOrCreateAppSettings(appDataRoot);
  const updated = clearContentRoot(settings, training.id, rootId);
  await saveAppSettings(appDataRoot, updated);

  return getContentRootStatus();
}

/**
 * Resolves a logical content-root id to its configured absolute path for the
 * currently active Training. Used only by resourceController - the absolute
 * path itself never leaves main.
 */
export async function resolveContentRootPath(rootId: string): Promise<string> {
  const root = requireActiveTrainingRoot();
  const training = await loadTraining(root);

  const settings = await loadOrCreateAppSettings(getAppDataRoot());
  const registration = settings.trainings.find((candidate) => candidate.trainingId === training.id);
  const absolutePath = registration?.contentRoots[rootId];

  if (!absolutePath) {
    throw new SessionEngineError(
      `Content root "${rootId}" is not configured for this Training. Configure it from Training Detail.`
    );
  }

  return absolutePath;
}
