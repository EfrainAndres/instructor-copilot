import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearContentRoot,
  findContentRootPath,
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

describe("absolute machine-local path invariant", () => {
  it("accepts an absolute definitionRoot", async () => {
    const settings = upsertTrainingRegistration(emptySettings(), "training-1", resolve("training-def-root"));
    await expect(saveAppSettings(tempDir, settings)).resolves.toBeUndefined();
  });

  it("rejects a relative definitionRoot", async () => {
    const settings = upsertTrainingRegistration(emptySettings(), "training-1", join("relative", "training"));
    await expect(saveAppSettings(tempDir, settings)).rejects.toThrow(/definitionRoot/);
  });

  it("accepts an absolute content root", async () => {
    let settings = upsertTrainingRegistration(emptySettings(), "training-1", resolve("training-def-root"));
    settings = setContentRoot(settings, "training-1", "content", resolve("content-root"));
    await expect(saveAppSettings(tempDir, settings)).resolves.toBeUndefined();
  });

  it("rejects a relative content root", async () => {
    let settings = upsertTrainingRegistration(emptySettings(), "training-1", resolve("training-def-root"));
    settings = setContentRoot(settings, "training-1", "content", join("relative", "content"));
    await expect(saveAppSettings(tempDir, settings)).rejects.toThrow(/content root/);
  });

  it("loadAppSettings refuses a hand-written settings file with a relative definitionRoot", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "settings.json"),
      JSON.stringify(
        { schemaVersion: 1, trainings: [{ trainingId: "t1", definitionRoot: "relative/path", contentRoots: {} }] },
        null,
        2
      )
    );
    await expect(loadAppSettings(tempDir)).rejects.toThrow(SessionEngineError);
  });

  it("loadAppSettings refuses a hand-written settings file with a relative content root", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "settings.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          trainings: [
            { trainingId: "t1", definitionRoot: resolve("training-def-root"), contentRoots: { content: "relative/content" } }
          ]
        },
        null,
        2
      )
    );
    await expect(loadAppSettings(tempDir)).rejects.toThrow(SessionEngineError);
  });
});

describe("findContentRootPath (Resource-to-Training binding)", () => {
  it("resolves a root using the explicitly given trainingId, never a different registered Training", () => {
    let settings = upsertTrainingRegistration(emptySettings(), "training-a", resolve("training-a-def"));
    settings = upsertTrainingRegistration(settings, "training-b", resolve("training-b-def"));
    settings = setContentRoot(settings, "training-a", "content", resolve("training-a-content"));
    settings = setContentRoot(settings, "training-b", "content", resolve("training-b-content"));

    // Both Trainings register a root named "content"; looking it up for training-a
    // must never return training-b's path, even though training-b might be the one
    // currently open elsewhere in the app.
    expect(findContentRootPath(settings, "training-a", "content")).toBe(resolve("training-a-content"));
    expect(findContentRootPath(settings, "training-b", "content")).toBe(resolve("training-b-content"));
  });

  it("fails clearly when the trainingId has no registration at all", () => {
    const settings = upsertTrainingRegistration(emptySettings(), "training-a", resolve("training-a-def"));
    expect(() => findContentRootPath(settings, "training-b", "content")).toThrow(SessionEngineError);
  });

  it("fails clearly when the root is not configured for that Training", () => {
    const settings = upsertTrainingRegistration(emptySettings(), "training-a", resolve("training-a-def"));
    expect(() => findContentRootPath(settings, "training-a", "content")).toThrow(/not configured for this Training/);
  });
});
