import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_RUN_POINTER_SCHEMA_VERSION,
  clearActiveRunPointer,
  loadActiveRunPointer,
  saveActiveRunPointer
} from "../activeRunPointer";
import { SessionEngineError } from "../../validation/errors";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-pointer-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("active-run pointer", () => {
  it("returns null when no pointer file exists", async () => {
    expect(await loadActiveRunPointer(tempDir)).toBeNull();
  });

  it("round-trips a pointer through save and load", async () => {
    const pointer = { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: "run-abc123" };
    await saveActiveRunPointer(tempDir, pointer);
    expect(await loadActiveRunPointer(tempDir)).toEqual(pointer);
  });

  it("rejects an unsafe run id", async () => {
    await expect(
      saveActiveRunPointer(tempDir, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: "../escape" })
    ).rejects.toThrow(SessionEngineError);
  });

  it("rejects an unsupported pointer schema version", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "active-run.json"),
      JSON.stringify({ schemaVersion: 999, runId: "run-abc123" }, null, 2)
    );
    await expect(loadActiveRunPointer(tempDir)).rejects.toThrow(SessionEngineError);
  });

  it("fails clearly on a malformed existing pointer file rather than silently replacing it", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, "active-run.json"), "{ not valid json");
    await expect(loadActiveRunPointer(tempDir)).rejects.toThrow(SessionEngineError);
  });

  it("clear is idempotent - clearing an already-absent pointer does not throw", async () => {
    await expect(clearActiveRunPointer(tempDir)).resolves.toBeUndefined();
    await expect(clearActiveRunPointer(tempDir)).resolves.toBeUndefined();
  });

  it("clear actually removes an existing pointer", async () => {
    const pointer = { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: "run-abc123" };
    await saveActiveRunPointer(tempDir, pointer);
    await clearActiveRunPointer(tempDir);
    expect(await loadActiveRunPointer(tempDir)).toBeNull();
  });
});
