import type { z } from "zod";
import { SessionEngineError } from "../validation/errors";

/**
 * Pre-check schema to read `schemaVersion` before running the full structural schema,
 * so an unsupported version produces a clear "unsupported version" error instead of a
 * generic structural-validation failure.
 */
const VersionedSchema = {
  safeParse(json: unknown) {
    if (typeof json === "object" && json !== null && "schemaVersion" in json) {
      const version = (json as { schemaVersion: unknown }).schemaVersion;
      if (typeof version === "number" && Number.isInteger(version)) {
        return version;
      }
    }
    return undefined;
  }
};

export function parseJson(raw: string, file?: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SessionEngineError(`Invalid JSON: ${reason}`, file);
  }
}

/**
 * Checks the declared schemaVersion against the currently supported version before
 * running full structural validation. There is only one supported version today
 * (no historical migrations exist yet); this function is the seam where a future
 * migration chain (v1 -> v2 -> ... -> current) would be inserted without otherwise
 * changing the load/save flow.
 */
export function assertCurrentSchemaVersion(
  json: unknown,
  currentVersion: number,
  entityLabel: string,
  file?: string
): void {
  const declaredVersion = VersionedSchema.safeParse(json);
  if (declaredVersion === undefined) {
    throw new SessionEngineError(`${entityLabel} is missing a valid numeric schemaVersion`, file);
  }
  if (declaredVersion !== currentVersion) {
    throw new SessionEngineError(
      `${entityLabel} schema version ${declaredVersion} is not supported (expected ${currentVersion})`,
      file
    );
  }
}

export function parseWithSchema<Schema extends z.ZodTypeAny>(
  schema: Schema,
  json: unknown,
  entityLabel: string,
  file?: string
): z.infer<Schema> {
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new SessionEngineError(`${entityLabel} failed validation: ${issues}`, file);
  }
  return result.data;
}
