import {
  SESSION_SCHEMA_VERSION,
  SessionSchema,
  TRAINING_SCHEMA_VERSION,
  TrainingSchema,
  type Session,
  type Training
} from "../model/schema";
import {
  validateSessionMatchesTraining,
  validateSessionSemantics,
  validateTrainingSemantics
} from "../validation/semantic";
import { readTextFile, writeJsonFileAtomic } from "./io";
import { sessionFilePath, trainingFilePath } from "./paths";
import { assertCurrentSchemaVersion, parseJson, parseWithSchema } from "./parse";

export interface TrainingBundle {
  training: Training;
  sessions: Session[];
}

export async function loadTraining(trainingRoot: string): Promise<Training> {
  const file = trainingFilePath(trainingRoot);
  const raw = await readTextFile(file);
  const json = parseJson(raw, file);
  assertCurrentSchemaVersion(json, TRAINING_SCHEMA_VERSION, "Training", file);
  const training = parseWithSchema(TrainingSchema, json, "Training", file);
  validateTrainingSemantics(training, file);
  return training;
}

export async function loadSession(trainingRoot: string, sessionId: string): Promise<Session> {
  const file = sessionFilePath(trainingRoot, sessionId);
  const raw = await readTextFile(file);
  const json = parseJson(raw, file);
  assertCurrentSchemaVersion(json, SESSION_SCHEMA_VERSION, "Session", file);
  const session = parseWithSchema(SessionSchema, json, "Session", file);
  validateSessionSemantics(session, file);
  return session;
}

/**
 * Loads training.json plus every referenced sessions/<id>.json, in Training.sessionRefs
 * order, cross-checking that each Session's declared id/trainingId actually matches
 * the sessionRef/Training it was loaded under.
 */
export async function loadTrainingBundle(trainingRoot: string): Promise<TrainingBundle> {
  const training = await loadTraining(trainingRoot);

  const sessions: Session[] = [];
  for (const sessionRef of training.sessionRefs) {
    const session = await loadSession(trainingRoot, sessionRef);
    validateSessionMatchesTraining(
      session,
      training.id,
      sessionRef,
      sessionFilePath(trainingRoot, sessionRef)
    );
    sessions.push(session);
  }

  return { training, sessions };
}

export async function saveTraining(trainingRoot: string, training: Training): Promise<void> {
  const file = trainingFilePath(trainingRoot);
  const validated = parseWithSchema(TrainingSchema, training, "Training", file);
  validateTrainingSemantics(validated, file);
  await writeJsonFileAtomic(file, validated);
}

export async function saveSession(trainingRoot: string, session: Session): Promise<void> {
  const file = sessionFilePath(trainingRoot, session.id);
  const validated = parseWithSchema(SessionSchema, session, "Session", file);
  validateSessionSemantics(validated, file);
  await writeJsonFileAtomic(file, validated);
}
