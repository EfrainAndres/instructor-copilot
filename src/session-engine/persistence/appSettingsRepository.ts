import {
  APP_SETTINGS_SCHEMA_VERSION,
  AppSettingsSchema,
  type AppSettings,
  type TrainingRegistration
} from "../model/schema";
import { SessionEngineError } from "../validation/errors";
import { validateAppSettingsSemantics } from "../validation/semantic";
import { fileExists, readTextFile, writeJsonFileAtomic } from "./io";
import { appSettingsFilePath } from "./paths";
import { assertCurrentSchemaVersion, parseJson, parseWithSchema } from "./parse";

export async function loadAppSettings(appDataRoot: string): Promise<AppSettings> {
  const file = appSettingsFilePath(appDataRoot);
  const raw = await readTextFile(file);
  const json = parseJson(raw, file);
  assertCurrentSchemaVersion(json, APP_SETTINGS_SCHEMA_VERSION, "AppSettings", file);
  const settings = parseWithSchema(AppSettingsSchema, json, "AppSettings", file);
  validateAppSettingsSemantics(settings, file);
  return settings;
}

/**
 * Settings absence is a normal first-run state, not an error: returns a valid
 * empty AppSettings without writing anything to disk. A genuinely malformed
 * existing file still fails loudly via loadAppSettings - it is never silently
 * replaced.
 */
export async function loadOrCreateAppSettings(appDataRoot: string): Promise<AppSettings> {
  const file = appSettingsFilePath(appDataRoot);
  if (!(await fileExists(file))) {
    return { schemaVersion: APP_SETTINGS_SCHEMA_VERSION, trainings: [] };
  }
  return loadAppSettings(appDataRoot);
}

export async function saveAppSettings(appDataRoot: string, settings: AppSettings): Promise<void> {
  const file = appSettingsFilePath(appDataRoot);
  assertCurrentSchemaVersion(settings, APP_SETTINGS_SCHEMA_VERSION, "AppSettings", file);
  const validated = parseWithSchema(AppSettingsSchema, settings, "AppSettings", file);
  validateAppSettingsSemantics(validated, file);
  await writeJsonFileAtomic(file, validated);
}

/**
 * Registers (or refreshes) a Training's machine-local definitionRoot. Refreshing
 * an existing registration preserves its contentRoots - only Open/Create Training
 * update definitionRoot, never the content-root configuration.
 */
export function upsertTrainingRegistration(
  settings: AppSettings,
  trainingId: string,
  definitionRoot: string
): AppSettings {
  const existingIndex = settings.trainings.findIndex((registration) => registration.trainingId === trainingId);
  if (existingIndex === -1) {
    const registration: TrainingRegistration = { trainingId, definitionRoot, contentRoots: {} };
    return { ...settings, trainings: [...settings.trainings, registration] };
  }
  const trainings = settings.trainings.map((registration, index) =>
    index === existingIndex ? { ...registration, definitionRoot } : registration
  );
  return { ...settings, trainings };
}

function requireRegistration(settings: AppSettings, trainingId: string): TrainingRegistration {
  const registration = settings.trainings.find((candidate) => candidate.trainingId === trainingId);
  if (!registration) {
    throw new SessionEngineError(`No registration exists for Training "${trainingId}"`);
  }
  return registration;
}

export function setContentRoot(
  settings: AppSettings,
  trainingId: string,
  rootId: string,
  absolutePath: string
): AppSettings {
  requireRegistration(settings, trainingId);
  const trainings = settings.trainings.map((registration) =>
    registration.trainingId === trainingId
      ? { ...registration, contentRoots: { ...registration.contentRoots, [rootId]: absolutePath } }
      : registration
  );
  return { ...settings, trainings };
}

export function clearContentRoot(settings: AppSettings, trainingId: string, rootId: string): AppSettings {
  requireRegistration(settings, trainingId);
  const trainings = settings.trainings.map((registration) => {
    if (registration.trainingId !== trainingId) {
      return registration;
    }
    const { [rootId]: _removed, ...remainingContentRoots } = registration.contentRoots;
    return { ...registration, contentRoots: remainingContentRoots };
  });
  return { ...settings, trainings };
}
