import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_RUN_POINTER_SCHEMA_VERSION,
  completeRun,
  createSessionRun,
  pauseRun,
  saveActiveRunPointer,
  saveAppSettings,
  saveSession,
  saveSessionRun,
  saveTraining,
  terminateRun,
  upsertTrainingRegistration,
  type AppSettings,
  type Session,
  type SessionRun,
  type Training
} from "../../session-engine";
import { evaluateActiveRunRecovery } from "../recoveryController";

const T0 = "2026-09-11T10:00:00.000Z";
const TRAINING_ID = "training-1";
const SESSION_ID = "session-1";
const RUN_ID = "run-1";

function training(): Training {
  return {
    id: TRAINING_ID,
    schemaVersion: 1,
    title: "Recovery Training",
    sessionRefs: [SESSION_ID]
  };
}

function session(): Session {
  return {
    id: SESSION_ID,
    schemaVersion: 1,
    trainingId: TRAINING_ID,
    title: "Recovery Session",
    plannedDurationMinutes: 10,
    steps: [{ id: "a", type: "introduction", title: "Step A", plannedDurationMinutes: 10 }]
  };
}

function newRun(s: Session): SessionRun {
  return createSessionRun({ id: RUN_ID, trainingId: TRAINING_ID, session: s, startedAt: T0 });
}

describe("evaluateActiveRunRecovery", () => {
  let appDataRoot: string;
  let trainingRoot: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), "instructor-copilot-recovery-test-"));
    appDataRoot = join(base, "appdata");
    trainingRoot = join(base, "training");
  });

  afterEach(async () => {
    await rm(join(appDataRoot, ".."), { recursive: true, force: true });
  });

  async function setUpTrainingAndRegistration(): Promise<void> {
    await saveTraining(trainingRoot, training());
    await saveSession(trainingRoot, session());
    const settings: AppSettings = upsertTrainingRegistration(
      { schemaVersion: 1, trainings: [] },
      TRAINING_ID,
      trainingRoot
    );
    await saveAppSettings(appDataRoot, settings);
  }

  it("returns null when no pointer exists", async () => {
    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result).toBeNull();
  });

  it("recovers the exact pointed run when it is paused and everything is consistent", async () => {
    await setUpTrainingAndRegistration();
    const run = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, run);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result).not.toBeNull();
    expect(result!.run.id).toBe(RUN_ID);
    expect(result!.session.id).toBe(SESSION_ID);
    expect(result!.definitionRoot).toBe(trainingRoot);
  });

  it("uses exactly the pointed run even when other incomplete run files exist (no fallback scan)", async () => {
    await setUpTrainingAndRegistration();

    const pointedRun = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, pointedRun);

    // A second, different, also-incomplete-but-unpaused run file exists on disk.
    // If recovery ever scanned instead of trusting the pointer, this run being
    // unpaused would cause a rejection even though the pointed run is fine.
    const otherRun: SessionRun = { ...newRun(session()), id: "run-2" };
    await saveSessionRun(appDataRoot, otherRun);

    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result!.run.id).toBe(RUN_ID);
  });

  it("clears a stale pointer to an already-completed run and returns null", async () => {
    await setUpTrainingAndRegistration();
    const completed: SessionRun = completeRun(newRun(session()), "2026-09-11T11:00:00.000Z");
    await saveSessionRun(appDataRoot, completed);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result).toBeNull();

    // A second call proves the pointer was actually cleared, not merely ignored.
    const secondResult = await evaluateActiveRunRecovery(appDataRoot);
    expect(secondResult).toBeNull();
  });

  it("clears a stale pointer to a discarded run and returns null (Phase 9B-B)", async () => {
    await setUpTrainingAndRegistration();
    const discarded: SessionRun = terminateRun(newRun(session()), "discarded", "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, discarded);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result).toBeNull();

    const secondResult = await evaluateActiveRunRecovery(appDataRoot);
    expect(secondResult).toBeNull();
  });

  it("clears a stale pointer to a restarted (abandoned) run even while it is still paused (Phase 9B-B)", async () => {
    await setUpTrainingAndRegistration();
    const paused = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    const restarted: SessionRun = terminateRun(paused, "restarted", "2026-09-11T10:06:00.000Z");
    await saveSessionRun(appDataRoot, restarted);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    const result = await evaluateActiveRunRecovery(appDataRoot);
    expect(result).toBeNull();
  });

  it("rejects an incomplete run that is not paused", async () => {
    await setUpTrainingAndRegistration();
    const run = newRun(session()); // active, not paused
    await saveSessionRun(appDataRoot, run);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    await expect(evaluateActiveRunRecovery(appDataRoot)).rejects.toThrow(/not suspended cleanly/);
  });

  it("fails clearly when no TrainingRegistration exists for the run's trainingId", async () => {
    // No settings file at all, and no registration.
    const run = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, run);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    await expect(evaluateActiveRunRecovery(appDataRoot)).rejects.toThrow(/No Training registration/);
  });

  it("fails clearly when the registered Training definition is missing/moved", async () => {
    const settings: AppSettings = upsertTrainingRegistration(
      { schemaVersion: 1, trainings: [] },
      TRAINING_ID,
      join(trainingRoot, "does-not-exist")
    );
    await saveAppSettings(appDataRoot, settings);

    const run = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, run);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    await expect(evaluateActiveRunRecovery(appDataRoot)).rejects.toThrow();
  });

  it("fails clearly when the Session no longer exists in the recovered Training", async () => {
    await saveTraining(trainingRoot, { ...training(), sessionRefs: [] });
    const settings: AppSettings = upsertTrainingRegistration(
      { schemaVersion: 1, trainings: [] },
      TRAINING_ID,
      trainingRoot
    );
    await saveAppSettings(appDataRoot, settings);

    const run = pauseRun(newRun(session()), "2026-09-11T10:05:00.000Z");
    await saveSessionRun(appDataRoot, run);
    await saveActiveRunPointer(appDataRoot, { schemaVersion: ACTIVE_RUN_POINTER_SCHEMA_VERSION, runId: RUN_ID });

    await expect(evaluateActiveRunRecovery(appDataRoot)).rejects.toThrow(/does not exist in the recovered Training/);
  });
});
