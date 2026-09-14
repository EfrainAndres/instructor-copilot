import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRunAbandoned,
  loadActiveRunPointer,
  loadSessionRun,
  saveAppSettings,
  saveSession,
  saveTraining,
  upsertTrainingRegistration,
  type AppSettings,
  type Session,
  type Training
} from "../../session-engine";
import { evaluateActiveRunRecovery } from "../recoveryController";

const TRAINING_ID = "training-lifecycle-1";
const SESSION_ID = "session-lifecycle-1";

function training(): Training {
  return { id: TRAINING_ID, schemaVersion: 1, title: "Lifecycle Training", sessionRefs: [SESSION_ID] };
}

function session(): Session {
  return {
    id: SESSION_ID,
    schemaVersion: 1,
    trainingId: TRAINING_ID,
    title: "Lifecycle Session",
    plannedDurationMinutes: 10,
    steps: [
      { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 5 },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

/**
 * Exercises the exact exported runController functions (startRun, restartRun,
 * discardRun, etc.) against a temp HOME so getAppDataRoot()'s hardcoded path
 * never touches the real user directory - the same technique used by the
 * existing Phase 6B/9 shutdown-race and recovery controller tests.
 */
describe("runController Restart/Discard (Phase 9B-B)", () => {
  let tempHome: string;
  let trainingRoot: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "instructor-copilot-lifecycle-"));
    trainingRoot = join(tempHome, "training-def");
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    await saveTraining(trainingRoot, training());
    await saveSession(trainingRoot, session());
    const settings: AppSettings = upsertTrainingRegistration(
      { schemaVersion: 1, trainings: [] },
      TRAINING_ID,
      trainingRoot
    );
    await saveAppSettings(join(tempHome, ".instructor-copilot"), settings);

    vi.resetModules();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.resetModules();
    await rm(tempHome, { recursive: true, force: true });
  });

  it("Discard: persists the terminal old run, clears the active-run pointer, and blocks further Start Session guard failure", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");
    const appDataRoot = join(tempHome, ".instructor-copilot");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    const started = await runController.startRun(SESSION_ID);
    const oldRunId = started.run.id;

    const discardResult = await runController.discardRun();
    expect(discardResult).toBeNull();

    const persisted = await loadSessionRun(appDataRoot, oldRunId);
    expect(isRunAbandoned(persisted)).toBe(true);
    expect(persisted.termination?.kind).toBe("discarded");
    expect(persisted.completedAt).toBeUndefined();

    const pointer = await loadActiveRunPointer(appDataRoot);
    expect(pointer).toBeNull();

    expect(runController.getActiveRunSnapshot()).toBeUndefined();
  });

  it("Discard: a stale pointer left pointing at the now-discarded run is ignored/cleared by recovery, never offered", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");
    const appDataRoot = join(tempHome, ".instructor-copilot");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.discardRun();
    // discardRun already clears the pointer on the happy path; recovery must
    // still behave safely even in the (documented) case where cleanup failed
    // and a stale pointer to the now-terminal run remained.
    const { saveActiveRunPointer, ACTIVE_RUN_POINTER_SCHEMA_VERSION } = await import("../../session-engine");
    const discardedRunId = (await import("node:fs/promises").then((fs) =>
      fs.readdir(join(appDataRoot, "runs"))
    ))[0]!.replace(/\.json$/, "");
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: discardedRunId });

    const evaluation = await evaluateActiveRunRecovery(appDataRoot);
    expect(evaluation).toBeNull();
    const pointerAfter = await loadActiveRunPointer(appDataRoot);
    expect(pointerAfter).toBeNull();
  });

  it("Restart: terminalizes the old run, creates a fresh run id, and points at the new run only", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");
    const appDataRoot = join(tempHome, ".instructor-copilot");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    const started = await runController.startRun(SESSION_ID);
    const oldRunId = started.run.id;
    await runController.nextStep(); // advance to Step B, so restart has real state to abandon

    const restarted = await runController.restartRun();

    expect(restarted.run.id).not.toBe(oldRunId);

    const oldPersisted = await loadSessionRun(appDataRoot, oldRunId);
    expect(isRunAbandoned(oldPersisted)).toBe(true);
    expect(oldPersisted.termination?.kind).toBe("restarted");

    const newPersisted = await loadSessionRun(appDataRoot, restarted.run.id);
    expect(newPersisted.termination).toBeUndefined();
    expect(newPersisted.completedAt).toBeUndefined();

    const pointer = await loadActiveRunPointer(appDataRoot);
    expect(pointer?.runId).toBe(restarted.run.id);
  });

  it("Restart: the new run starts at Step 1 with clean checklist/evidence/notes/timers", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.nextStep();
    await runController.addCurrentStepNote("a note on the old run");

    const restarted = await runController.restartRun();

    const stepA = restarted.run.stepRuns.find((sr) => sr.stepId === "a")!;
    expect(stepA.status).toBe("active");
    expect(stepA.activeIntervals).toHaveLength(1);
    expect(restarted.run.notes).toHaveLength(0);
    expect(restarted.run.pauseIntervals).toHaveLength(0);
  });

  it("startRun is allowed again after a Discard (terminal, not live)", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.discardRun();

    await expect(runController.startRun(SESSION_ID)).resolves.toMatchObject({
      run: { sessionId: SESSION_ID }
    });
  });

  it("startRun is allowed again after a Restart's resulting active run is itself later completed", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.restartRun();
    await runController.nextStep();
    await runController.complete();

    await expect(runController.startRun(SESSION_ID)).resolves.toMatchObject({
      run: { sessionId: SESSION_ID }
    });
  });

  it("startRun still rejects while a genuinely live (non-terminal) run exists", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);

    await expect(runController.startRun(SESSION_ID)).rejects.toThrow(/already active/);
  });

  it("Shutdown preparation is a no-op after Discard clears the active run", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.discardRun();

    await expect(runController.prepareActiveRunForShutdown()).resolves.toBeUndefined();
    expect(runController.getActiveRunSnapshot()).toBeUndefined();
  });

  it("Restart is rejected once the active run is already terminal", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);
    await runController.discardRun();

    await expect(runController.restartRun()).rejects.toThrow(/No session run is active/);
  });
});
