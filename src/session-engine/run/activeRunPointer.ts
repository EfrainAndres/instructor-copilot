import { join } from "node:path";
import { z } from "zod";
import { IdSchema } from "../model/schema";
import { deleteFileIfPresent, fileExists, readTextFile, writeJsonFileAtomic } from "../persistence/io";
import { assertCurrentSchemaVersion, parseJson, parseWithSchema } from "../persistence/parse";

/**
 * The ONE explicit pointer to the recoverable SessionRun, independent of every
 * other schema version (Training/Session/SessionRun/AppSettings). Recovery must
 * never scan `runs/` for "the latest incomplete run" - only this pointer, when
 * present, identifies a recovery candidate. See docs/architecture.md.
 */
export const ACTIVE_RUN_POINTER_SCHEMA_VERSION = 1;

export const ActiveRunPointerSchema = z.object({
  schemaVersion: z.number().int(),
  runId: IdSchema
});

export type ActiveRunPointer = z.infer<typeof ActiveRunPointerSchema>;

function activeRunPointerFilePath(appDataRoot: string): string {
  return join(appDataRoot, "active-run.json");
}

/** Absence means there is no recovery candidate - this is the normal steady state, not an error. */
export async function loadActiveRunPointer(appDataRoot: string): Promise<ActiveRunPointer | null> {
  const file = activeRunPointerFilePath(appDataRoot);
  if (!(await fileExists(file))) {
    return null;
  }
  const raw = await readTextFile(file);
  const json = parseJson(raw, file);
  assertCurrentSchemaVersion(json, ACTIVE_RUN_POINTER_SCHEMA_VERSION, "ActiveRunPointer", file);
  return parseWithSchema(ActiveRunPointerSchema, json, "ActiveRunPointer", file);
}

export async function saveActiveRunPointer(appDataRoot: string, pointer: ActiveRunPointer): Promise<void> {
  const file = activeRunPointerFilePath(appDataRoot);
  assertCurrentSchemaVersion(pointer, ACTIVE_RUN_POINTER_SCHEMA_VERSION, "ActiveRunPointer", file);
  const validated = parseWithSchema(ActiveRunPointerSchema, pointer, "ActiveRunPointer", file);
  await writeJsonFileAtomic(file, validated);
}

/** Idempotent: clearing an already-absent pointer is not an error. */
export async function clearActiveRunPointer(appDataRoot: string): Promise<void> {
  await deleteFileIfPresent(activeRunPointerFilePath(appDataRoot));
}
