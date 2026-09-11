import { dialog, type BrowserWindow } from "electron";
import {
  loadTraining,
  loadTrainingBundle,
  saveSession,
  saveTraining,
  SESSION_SCHEMA_VERSION,
  SessionEngineError,
  TRAINING_SCHEMA_VERSION,
  trainingDefinitionExists,
  type Session,
  type Training,
  type TrainingBundle
} from "../session-engine";
import type { CreateSessionInput, CreateTrainingInput, OpenOrCreateTrainingResult, SaveTrainingMetadataInput } from "../shared/ipc";

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

export async function openTraining(window: BrowserWindow | null): Promise<OpenOrCreateTrainingResult> {
  const directory = await pickDirectory(window, ["openDirectory"]);
  if (!directory) {
    return { canceled: true };
  }
  const bundle = await loadTrainingBundle(directory);
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
