import { z } from "zod";
import { IdSchema, StepTypeSchema } from "../model/schema";
import { SessionEngineError } from "../validation/errors";

/**
 * Runtime/run-history schemas (see docs/data-model.md -> Runtime / run-history state).
 * Independent from the authored Training/Session/Step schemas and versioned on its
 * own timeline, exactly like Training/Session/AppSettings.
 */
export const SESSION_RUN_SCHEMA_VERSION = 1;

export const TimeIntervalSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional()
});

export const StepRunStatusSchema = z.enum(["pending", "active", "done", "skipped"]);

export const StepRunSchema = z.object({
  stepId: IdSchema,
  status: StepRunStatusSchema,
  activeIntervals: z.array(TimeIntervalSchema),
  checklistState: z.record(IdSchema, z.boolean()),
  evidenceState: z.record(IdSchema, z.enum(["locked", "released"])),
  // Authoring snapshot captured once at run creation; historical reporting reads these,
  // never the live Step, so later authoring edits never rewrite completed-run history.
  stepTitleSnapshot: z.string().min(1),
  stepTypeSnapshot: StepTypeSchema,
  plannedDurationMinutesSnapshot: z.number().finite().positive(),
  stepOrderSnapshot: z.number().int().nonnegative()
});

export const InstructorNoteSchema = z.object({
  id: IdSchema,
  runId: IdSchema,
  sessionId: IdSchema,
  stepId: IdSchema,
  timestamp: z.string().datetime(),
  text: z.string().min(1)
});

export const SessionRunSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int(),
  sessionId: IdSchema,
  trainingId: IdSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  pauseIntervals: z.array(TimeIntervalSchema),
  stepRuns: z.array(StepRunSchema),
  notes: z.array(InstructorNoteSchema),
  // Minimal Session snapshot; see StepRun snapshot fields above for the same rationale.
  sessionTitleSnapshot: z.string().min(1),
  plannedDurationMinutesSnapshot: z.number().finite().positive()
});

export type TimeInterval = z.infer<typeof TimeIntervalSchema>;
export type StepRunStatus = z.infer<typeof StepRunStatusSchema>;
export type StepRun = z.infer<typeof StepRunSchema>;
export type InstructorNote = z.infer<typeof InstructorNoteSchema>;
export type SessionRun = z.infer<typeof SessionRunSchema>;

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function isOpen(interval: TimeInterval): boolean {
  return interval.endedAt === undefined;
}

function intervalIsBackwards(interval: TimeInterval): boolean {
  return interval.endedAt !== undefined && Date.parse(interval.endedAt) < Date.parse(interval.startedAt);
}

/**
 * Rejects persisted/engine-produced SessionRun state that should be structurally
 * impossible under the interval model - see docs/architecture.md -> Timing and
 * Navigation Semantics. Applied both after every engine transition and on
 * load/save, so a bug in the engine can never silently produce a corrupt run file.
 */
export function validateSessionRunSemantics(run: SessionRun, file?: string): void {
  const duplicateStepId = findDuplicate(run.stepRuns.map((stepRun) => stepRun.stepId));
  if (duplicateStepId) {
    throw new SessionEngineError(`SessionRun has duplicate StepRun.stepId "${duplicateStepId}"`, file);
  }

  const activeStepRuns = run.stepRuns.filter((stepRun) => stepRun.status === "active");
  if (activeStepRuns.length > 1) {
    throw new SessionEngineError("SessionRun has more than one active StepRun", file);
  }

  const openPauseIntervals = run.pauseIntervals.filter(isOpen);
  if (openPauseIntervals.length > 1) {
    throw new SessionEngineError("SessionRun has more than one open pause interval", file);
  }
  const isPaused = openPauseIntervals.length === 1;

  for (const pauseInterval of run.pauseIntervals) {
    if (intervalIsBackwards(pauseInterval)) {
      throw new SessionEngineError("SessionRun has a pause interval ending before it starts", file);
    }
  }

  for (const stepRun of run.stepRuns) {
    for (const interval of stepRun.activeIntervals) {
      if (intervalIsBackwards(interval)) {
        throw new SessionEngineError(`Step "${stepRun.stepId}" has an interval ending before it starts`, file);
      }
    }
    if (isPaused && stepRun.activeIntervals.some(isOpen)) {
      throw new SessionEngineError(
        `Step "${stepRun.stepId}" has an open active interval while the run is paused`,
        file
      );
    }
  }

  if (run.completedAt !== undefined) {
    if (Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
      throw new SessionEngineError("SessionRun.completedAt is earlier than startedAt", file);
    }
    if (run.stepRuns.some((stepRun) => stepRun.activeIntervals.some(isOpen))) {
      throw new SessionEngineError("Completed SessionRun has an open Step active interval", file);
    }
    if (isPaused) {
      throw new SessionEngineError("Completed SessionRun has an open pause interval", file);
    }
    if (activeStepRuns.length > 0) {
      throw new SessionEngineError("Completed SessionRun has an active StepRun", file);
    }
  }
}
