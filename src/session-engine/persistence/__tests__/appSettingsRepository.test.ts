import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearContentRoot,
  loadAppSettings,
  loadOrCreateAppSettings,
  saveAppSettings,
  setContentRoot,
  upsertTrainingRegistration,
  SessionEngineError,
  type AppSettings
} from "../../index";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-settings-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function emptySettings(): AppSettings {
  return { schemaVersion: 1, trainings: [] };
}

describe("loadOrCreateAppSettings", () => {
  it("returns a valid empty AppSettings when no file exists, without writing one", async () => {
    const settings = await loadOrCreateAppSettings(tempDir);
    expect(settings).toEqual(emptySettings());
    await expect(loadAppSettings(tempDir)).rejects.toThrow(SessionEngineError);
  });
});

describe("save + load round trip", () => {
  it("round-trips AppSettings through save and load", async () => {
    const settings = upsertTrainingRegistration(emptySettings(), "training-1", "/abs/path/to/training");
    await saveAppSettings(tempDir, settings);
    const reloaded = await loadAppSettings(tempDir);
    expect(reloaded).toEqual(settings);
  });

  it("rejects loading an unsupported AppSettings schema version", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "settings.json"),
      JSON.stringify({ schemaVersion: 999, trainings: [] }, null, 2)
    );
    await expect(loadAppSettings(tempDir)).rejects.toThrow(SessionEngineError);
  });
});

describe("registration semantics", () => {
  it("rejects a duplicate TrainingRegistration.trainingId on save", async () => {
    const settings: AppSettings = {
      schemaVersion: 1,
      trainings: [
        { trainingId: "dup", definitionRoot: "/a", contentRoots: {} },
        { trainingId: "dup", definitionRoot: "/b", contentRoots: {} }
      ]
    };
    await expect(saveAppSettings(tempDir, settings)).rejects.toThrow(/duplicate/);
  });

  it("upsert preserves an existing registration's contentRoots while refreshing definitionRoot", () => {
    let settings = upsertTrainingRegistration(emptySettings(), "training-1", "/old/root");
    settings = setContentRoot(settings, "training-1", "content", "/abs/content");
    settings = upsertTrainingRegistration(settings, "training-1", "/new/root");

    const registration = settings.trainings.find((r) => r.trainingId === "training-1")!;
    expect(registration.definitionRoot).toBe("/new/root");
    expect(registration.contentRoots).toEqual({ content: "/abs/content" });
    expect(settings.trainings).toHaveLength(1);
  });

  it("clearContentRoot removes only the targeted root", () => {
    let settings = upsertTrainingRegistration(emptySettings(), "training-1", "/root");
    settings = setContentRoot(settings, "training-1", "content", "/abs/content");
    settings = setContentRoot(settings, "training-1", "examples", "/abs/examples");

    settings = clearContentRoot(settings, "training-1", "content");

    const registration = settings.trainings.find((r) => r.trainingId === "training-1")!;
    expect(registration.contentRoots).toEqual({ examples: "/abs/examples" });
  });
});
