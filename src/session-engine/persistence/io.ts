import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { SessionEngineError } from "../validation/errors";

export async function readTextFile(file: string): Promise<string> {
  try {
    return await readFile(file, "utf-8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SessionEngineError(`Failed to read file: ${reason}`, file);
  }
}

function toJsonText(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Writes JSON to `file` via a temp-file-then-rename so a crash mid-write can never
 * leave a partially-written/corrupt file at the final path.
 */
export async function writeJsonFileAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tempFile = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(tempFile, toJsonText(data), "utf-8");
    await rename(tempFile, file);
  } catch (error) {
    await unlink(tempFile).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new SessionEngineError(`Failed to write file: ${reason}`, file);
  }
}
