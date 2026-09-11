import { join } from "node:path";
import { isSafeId } from "../validation/ids";
import { SessionEngineError } from "../validation/errors";

export function trainingFilePath(trainingRoot: string): string {
  return join(trainingRoot, "training.json");
}

/**
 * Resolves sessions/<sessionId>.json under trainingRoot. sessionId is re-validated
 * here (not just trusted from a prior schema check) because this is the one place
 * an authored id is turned into a filesystem path — the last line of defense against
 * path traversal regardless of caller.
 */
export function sessionFilePath(trainingRoot: string, sessionId: string): string {
  if (!isSafeId(sessionId)) {
    throw new SessionEngineError(`Unsafe session id "${sessionId}" cannot be used to resolve a file path`);
  }
  return join(trainingRoot, "sessions", `${sessionId}.json`);
}
