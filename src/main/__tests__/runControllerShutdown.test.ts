import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveAppSettings,
  saveSession,
  saveTraining,
  upsertTrainingRegistration,
  type AppSettings,
  type Session,
  type Training
} from "../../session-engine";

const TRAINING_ID = "training-shutdown-1";
const SESSION_ID = "session-shutdown-1";

function training(): Training {
  return { id: TRAINING_ID, schemaVersion: 1, title: "Shutdown Race Training", sessionRefs: [SESSION_ID] };
}

function session(): Session {
  return {
    id: SESSION_ID,
    schemaVersion: 1,
    trainingId: TRAINING_ID,
    title: "Shutdown Race Session",
    plannedDurationMinutes: 10,
    steps: [
      { id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 5 },
      { id: "b", type: "discussion", title: "Step B", plannedDurationMinutes: 5 }
    ]
  };
}

/**
 * Exercises the exact exported runController functions (startRun,
 * prepareActiveRunForShutdown, nextStep, etc.) against a temp HOME so
 * getAppDataRoot()'s hardcoded path never touches the real user directory -
 * the same technique used for the Phase 6B recoveryController tests.
 */
describe("runController shutdown/mutation race", () => {
  let tempHome: string;
  let trainingRoot: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "instructor-copilot-shutdown-race-"));
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

  it("joins the same in-flight preparation Promise across repeated calls instead of resolving one early", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);

    const first = runController.prepareActiveRunForShutdown();
    const second = runController.prepareActiveRunForShutdown();
    const third = runController.prepareActiveRunForShutdown();

    expect(second).toBe(first);
    expect(third).toBe(first);

    await expect(first).resolves.toBeUndefined();
  });

  it("lets a mutation already in flight finish, then shutdown suspends the resulting latest state", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);

    // Start (but do not await) a mutation that changes the active Step, then
    // immediately request shutdown - shutdown must wait for it rather than
    // suspending the pre-mutation state.
    const nextStepPromise = runController.nextStep();
    const shutdownPromise = runController.prepareActiveRunForShutdown();

    const nextStepResult = await nextStepPromise;
    expect(nextStepResult.run.stepRuns.find((sr) => sr.stepId === "b")?.status).toBe("active");

    await shutdownPromise;

    const afterShutdown = runController.getActiveRunSnapshot();
    expect(afterShutdown?.stepRuns.find((sr) => sr.stepId === "b")?.status).toBe("active");
    expect(afterShutdown?.pauseIntervals).toHaveLength(1);
    expect(afterShutdown?.pauseIntervals[0]?.endedAt).toBeUndefined();
  });

  it("rejects a new mutation attempted after shutdown preparation has started", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);

    const shutdownPromise = runController.prepareActiveRunForShutdown();

    // Attempted strictly after shutdown was requested (shutdownRequested is
    // set synchronously before prepareActiveRunForShutdown's first await), so
    // this must never reach the disk.
    await expect(runController.nextStep()).rejects.toThrow(/preparing to quit/);

    await shutdownPromise;
  });

  it("allows normal mutations before any shutdown has been requested", async () => {
    const trainingController = await import("../trainingController");
    const runController = await import("../runController");

    trainingController.setActiveTrainingRootForRecovery(trainingRoot);
    await runController.startRun(SESSION_ID);

    const context = await runController.nextStep();
    expect(context.run.stepRuns.find((sr) => sr.stepId === "b")?.status).toBe("active");
  });
});
