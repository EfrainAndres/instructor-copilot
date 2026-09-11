import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadSession,
  loadTraining,
  loadTrainingBundle,
  ResourceSchema,
  saveSession,
  saveTraining,
  SessionEngineError,
  trainingDefinitionExists,
  type Session,
  type Training
} from "../index";

const FIXTURE_ROOT = join(__dirname, "../../../fixtures/sample-training");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "instructor-copilot-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function validTraining(overrides: Partial<Training> = {}): Training {
  return {
    id: "temp-training",
    schemaVersion: 1,
    title: "Temp Training",
    sessionRefs: ["session-a"],
    ...overrides
  };
}

function validSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-a",
    schemaVersion: 1,
    trainingId: "temp-training",
    title: "Temp Session",
    plannedDurationMinutes: 10,
    steps: [
      {
        id: "step-1",
        type: "introduction",
        title: "Step One",
        plannedDurationMinutes: 10
      }
    ],
    ...overrides
  };
}

async function writeRawSession(root: string, sessionId: string, data: unknown): Promise<void> {
  await mkdir(join(root, "sessions"), { recursive: true });
  await writeFile(join(root, "sessions", `${sessionId}.json`), JSON.stringify(data, null, 2));
}

async function writeRawTraining(root: string, data: unknown): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "training.json"), JSON.stringify(data, null, 2));
}

describe("sample fixture bundle", () => {
  it("loads the valid sample Training bundle", async () => {
    const bundle = await loadTrainingBundle(FIXTURE_ROOT);
    expect(bundle.training.id).toBe("sample-training");
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.sessions[0]?.id).toBe("session-1");
  });

  it("preserves Training.sessionRefs order in the loaded sessions", async () => {
    const bundle = await loadTrainingBundle(FIXTURE_ROOT);
    const loadedIds = bundle.sessions.map((session) => session.id);
    expect(loadedIds).toEqual(bundle.training.sessionRefs);
  });

  it("loads current Training and Session schema versions", async () => {
    const training = await loadTraining(FIXTURE_ROOT);
    const session = await loadSession(FIXTURE_ROOT, "session-1");
    expect(training.schemaVersion).toBe(1);
    expect(session.schemaVersion).toBe(1);
  });
});

describe("training definition existence (create-Training overwrite protection)", () => {
  it("reports false for a directory with no training.json", async () => {
    await mkdir(tempDir, { recursive: true });
    expect(await trainingDefinitionExists(tempDir)).toBe(false);
  });

  it("reports true once a Training has been saved, so Create Training can refuse to overwrite it", async () => {
    await saveTraining(tempDir, validTraining());
    expect(await trainingDefinitionExists(tempDir)).toBe(true);

    // The actual guard (main/trainingController.createTraining) checks this before ever
    // calling saveTraining again for a freshly chosen directory; simulate that check here
    // and confirm the original file is left untouched when it fires.
    const before = await readFile(join(tempDir, "training.json"), "utf-8");
    if (await trainingDefinitionExists(tempDir)) {
      // guard fires: no write happens
    } else {
      await saveTraining(tempDir, validTraining({ title: "Should not be written" }));
    }
    const after = await readFile(join(tempDir, "training.json"), "utf-8");
    expect(after).toBe(before);
  });
});

describe("schema version enforcement", () => {
  it("rejects an unsupported future Training schema version", async () => {
    await writeRawTraining(tempDir, validTraining({ schemaVersion: 999 }));
    await expect(loadTraining(tempDir)).rejects.toThrow(SessionEngineError);
  });

  it("rejects an unsupported future Session schema version", async () => {
    await writeRawSession(tempDir, "session-a", validSession({ schemaVersion: 999 }));
    await expect(loadSession(tempDir, "session-a")).rejects.toThrow(SessionEngineError);
  });
});

describe("JSON and structural validation", () => {
  it("produces a useful failure for invalid JSON", async () => {
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, "training.json"), "{ not valid json");
    await expect(loadTraining(tempDir)).rejects.toThrow(/Invalid JSON/);
  });

  it("rejects a structurally invalid Training", async () => {
    await writeRawTraining(tempDir, { id: "temp-training", schemaVersion: 1 });
    await expect(loadTraining(tempDir)).rejects.toThrow(SessionEngineError);
  });

  it("rejects a structurally invalid Session", async () => {
    await writeRawSession(tempDir, "session-a", { id: "session-a", schemaVersion: 1 });
    await expect(loadSession(tempDir, "session-a")).rejects.toThrow(SessionEngineError);
  });
});

describe("id safety", () => {
  it("rejects a path-traversal session id", async () => {
    await mkdir(tempDir, { recursive: true });
    await expect(loadSession(tempDir, "../../etc/passwd")).rejects.toThrow(SessionEngineError);
  });

  it("rejects an unsafe Training.sessionRefs entry at schema validation", async () => {
    await writeRawTraining(tempDir, validTraining({ sessionRefs: ["../escape"] }));
    await expect(loadTraining(tempDir)).rejects.toThrow(SessionEngineError);
  });
});

describe("semantic validation", () => {
  it("rejects duplicate Step ids", async () => {
    const session = validSession({
      steps: [
        { id: "dup", type: "introduction", title: "A", plannedDurationMinutes: 5 },
        { id: "dup", type: "discussion", title: "B", plannedDurationMinutes: 5 }
      ]
    });
    await writeRawSession(tempDir, "session-a", session);
    await expect(loadSession(tempDir, "session-a")).rejects.toThrow(/duplicate step id/);
  });

  it("rejects an invalid nextStepId", async () => {
    const session = validSession({
      steps: [
        {
          id: "step-1",
          type: "introduction",
          title: "Step One",
          plannedDurationMinutes: 5,
          nextStepId: "does-not-exist"
        }
      ]
    });
    await writeRawSession(tempDir, "session-a", session);
    await expect(loadSession(tempDir, "session-a")).rejects.toThrow(/nextStepId/);
  });

  it("rejects a Session.trainingId mismatch when loading a bundle", async () => {
    await writeRawTraining(tempDir, validTraining());
    await writeRawSession(tempDir, "session-a", validSession({ trainingId: "other-training" }));
    await expect(loadTrainingBundle(tempDir)).rejects.toThrow(/trainingId/);
  });

  it("rejects a Session.id/sessionRef mismatch when loading a bundle", async () => {
    await writeRawTraining(tempDir, validTraining());
    await writeRawSession(tempDir, "session-a", validSession({ id: "different-id" }));
    await expect(loadTrainingBundle(tempDir)).rejects.toThrow(/declares id/);
  });
});

describe("save + reload", () => {
  it("round-trips Training and Session data through save and reload", async () => {
    const training = validTraining({ description: "Round trip check" });
    const session = validSession();

    await saveTraining(tempDir, training);
    await saveSession(tempDir, session);

    const bundle = await loadTrainingBundle(tempDir);
    expect(bundle.training).toEqual(training);
    expect(bundle.sessions[0]).toEqual(session);

    const rawTrainingText = await readFile(join(tempDir, "training.json"), "utf-8");
    expect(rawTrainingText.endsWith("\n")).toBe(true);
  });

  it("refuses to save structurally invalid Training data", async () => {
    const invalid = { ...validTraining(), title: "" } as unknown as Training;
    await expect(saveTraining(tempDir, invalid)).rejects.toThrow(SessionEngineError);
  });

  it("refuses to save structurally invalid Session data", async () => {
    const invalid = { ...validSession(), title: "" } as unknown as Session;
    await expect(saveSession(tempDir, invalid)).rejects.toThrow(SessionEngineError);
  });

  it("rejects saving a Training with an unsupported schemaVersion", async () => {
    const invalid = validTraining({ schemaVersion: 999 });
    await expect(saveTraining(tempDir, invalid)).rejects.toThrow(SessionEngineError);
  });

  it("rejects saving a Session with an unsupported schemaVersion", async () => {
    const invalid = validSession({ schemaVersion: 999 });
    await expect(saveSession(tempDir, invalid)).rejects.toThrow(SessionEngineError);
  });

  it("refuses to save a Session whose trainingId does not match the Training at trainingRoot", async () => {
    await saveTraining(tempDir, validTraining());
    const mismatched = validSession({ trainingId: "some-other-training" });
    await expect(saveSession(tempDir, mismatched)).rejects.toThrow(/trainingId/);
  });

  it("saves and reloads a Training with zero sessionRefs", async () => {
    const training = validTraining({ sessionRefs: [] });
    await saveTraining(tempDir, training);
    const reloaded = await loadTraining(tempDir);
    expect(reloaded.sessionRefs).toEqual([]);
  });

  it("saves and reloads a Session with zero steps", async () => {
    await saveTraining(tempDir, validTraining());
    const session = validSession({ steps: [] });
    await saveSession(tempDir, session);
    const reloaded = await loadSession(tempDir, "session-a");
    expect(reloaded.steps).toEqual([]);
  });

  it("does not mutate the checked-in sample fixture", async () => {
    const before = await readFile(join(FIXTURE_ROOT, "training.json"), "utf-8");
    await loadTrainingBundle(FIXTURE_ROOT);
    const after = await readFile(join(FIXTURE_ROOT, "training.json"), "utf-8");
    expect(after).toBe(before);
  });
});

describe("Resource root invariant", () => {
  it("rejects a file Resource without a root", () => {
    const result = ResourceSchema.safeParse({
      id: "sample-worksheet",
      kind: "file",
      label: "Open worksheet",
      path: "worksheets/sample.pdf"
    });
    expect(result.success).toBe(false);
  });

  it("accepts an application Resource without a root", () => {
    const result = ResourceSchema.safeParse({
      id: "open-postman",
      kind: "application",
      label: "Open Postman",
      path: "Postman"
    });
    expect(result.success).toBe(true);
  });

  it("rejects an application Resource with a root", () => {
    const result = ResourceSchema.safeParse({
      id: "open-postman",
      kind: "application",
      label: "Open Postman",
      root: "content",
      path: "Postman"
    });
    expect(result.success).toBe(false);
  });
});
