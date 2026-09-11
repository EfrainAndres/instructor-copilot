import { join } from "node:path";
import { isSafeId } from "../validation/ids";
import { SessionEngineError } from "../validation/errors";
import { readTextFile, writeJsonFileAtomic } from "../persistence/io";
import { assertCurrentSchemaVersion, parseJson, parseWithSchema } from "../persistence/parse";
import { SESSION_RUN_SCHEMA_VERSION, SessionRunSchema, validateSessionRunSemantics, type SessionRun } from "./schema";

/**
 * Pure session-engine code never hardcodes an application data directory - the
 * caller (Phase 4B/main) supplies `appDataRoot` (e.g. `~/.instructor-copilot`),
 * matching how Training persistence takes a trainingRoot argument.
 */
function runFilePath(appDataRoot: string, runId: string): string {
  if (!isSafeId(runId)) {
    throw new SessionEngineError(`Unsafe run id "${runId}" cannot be used to resolve a file path`);
  }
  return join(appDataRoot, "runs", `${runId}.json`);
}

export async function loadSessionRun(appDataRoot: string, runId: string): Promise<SessionRun> {
  const file = runFilePath(appDataRoot, runId);
  const raw = await readTextFile(file);
  const json = parseJson(raw, file);
  assertCurrentSchemaVersion(json, SESSION_RUN_SCHEMA_VERSION, "SessionRun", file);
  const run = parseWithSchema(SessionRunSchema, json, "SessionRun", file);
  validateSessionRunSemantics(run, file);
  return run;
}

export async function saveSessionRun(appDataRoot: string, run: SessionRun): Promise<void> {
  const file = runFilePath(appDataRoot, run.id);
  assertCurrentSchemaVersion(run, SESSION_RUN_SCHEMA_VERSION, "SessionRun", file);
  const validated = parseWithSchema(SessionRunSchema, run, "SessionRun", file);
  validateSessionRunSemantics(validated, file);
  await writeJsonFileAtomic(file, validated);
}
