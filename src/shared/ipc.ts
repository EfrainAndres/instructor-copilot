import type { Session, SessionRun, TrainingBundle } from "../session-engine";

/**
 * Channel names shared by main (ipcMain.handle) and preload (ipcRenderer.invoke) so
 * the two sides can never drift. The renderer never sees these directly — it only
 * calls the typed methods preload exposes on window.instructorCopilot.
 */
export const IPC_CHANNELS = {
  appGetInfo: "app:get-info",
  trainingOpen: "training:open",
  trainingCreate: "training:create",
  trainingGetCurrent: "training:get-current",
  trainingSaveMetadata: "training:save-metadata",
  sessionCreate: "session:create",
  sessionSave: "session:save",
  runStart: "run:start",
  runRestore: "run:restore",
  runNext: "run:next",
  runPrevious: "run:previous",
  runSkip: "run:skip",
  runPause: "run:pause",
  runResume: "run:resume",
  runSetChecklistItem: "run:set-checklist-item",
  runReleaseEvidenceStage: "run:release-evidence-stage",
  runAddNote: "run:add-note",
  runComplete: "run:complete",
  trainingGetContentRootStatus: "training:get-content-root-status",
  trainingConfigureContentRoot: "training:configure-content-root",
  trainingClearContentRoot: "training:clear-content-root",
  resourceOpenPresentation: "resource:open-presentation",
  resourceOpenCurrentStep: "resource:open-current-step-resource",
  commandRunCurrentStep: "command:run-current-step",
  commandStarted: "command:started",
  commandOutput: "command:output",
  commandCompleted: "command:completed"
} as const;

/**
 * Every mutating/loading IPC call returns this instead of letting a thrown error
 * cross the IPC boundary as a rejected promise — main catches domain errors and
 * reduces them to a short message, so the renderer never has to parse or display
 * a raw stack trace.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

export interface OpenOrCreateTrainingResult {
  canceled: boolean;
  bundle?: TrainingBundle;
}

export interface CreateTrainingInput {
  id: string;
  title: string;
  description?: string;
}

export interface SaveTrainingMetadataInput {
  title: string;
  description?: string;
}

export interface CreateSessionInput {
  id: string;
  title: string;
  plannedDurationMinutes: number;
}

export interface StartRunInput {
  sessionId: string;
}

export interface SetChecklistItemInput {
  stepId: string;
  itemId: string;
  value: boolean;
}

export interface ReleaseEvidenceStageInput {
  evidenceStageId: string;
}

/**
 * The renderer sends only the note text - main generates the note id,
 * timestamp, and resolves the current active Step itself.
 */
export interface AddInstructorNoteInput {
  text: string;
}

/**
 * The one safe run representation the renderer ever sees: the authoritative
 * SessionRun plus the authored Session it belongs to. No filesystem roots, no
 * Training metadata - main owns those and never hands them across the boundary.
 */
export interface InstructorRunContext {
  run: SessionRun;
  session: Session;
}

/**
 * Returned by run.restore() when a cleanly-suspended run was recovered: both the
 * run context (for Instructor Mode) and the Training bundle (so "Back to
 * Training" after completion works exactly as it would for a freshly opened
 * Training). No definitionRoot/appDataRoot/content-root paths are ever included.
 */
export interface RecoveredRunResult {
  context: InstructorRunContext;
  bundle: TrainingBundle;
}

/**
 * The renderer only ever learns whether a logical content root is configured for
 * the current Training - never the absolute machine path behind it.
 */
export interface ContentRootStatus {
  id: string;
  configured: boolean;
}

export interface ConfigureContentRootInput {
  rootId: string;
}

export interface ClearContentRootInput {
  rootId: string;
}

export interface ConfigureContentRootResult {
  canceled: boolean;
  status?: ContentRootStatus[];
}

export interface OpenCurrentStepResourceInput {
  resourceId: string;
}

export interface RunCurrentStepCommandInput {
  commandId: string;
}

/**
 * executionId is main-generated, correlating streamed output/completion events
 * with one execution - it never enters SessionRun.
 */
export interface CommandStartResult {
  canceled: boolean;
  executionId?: string;
  commandId?: string;
  label?: string;
}

/**
 * Sent to the initiating renderer BEFORE spawning, establishing execution
 * identity ahead of any stdout/stderr/completion event - so a very fast command
 * can never emit output the renderer would otherwise discard for not yet
 * knowing its executionId (which the runCurrentStep() invoke response also
 * carries, but may resolve after this event in principle).
 */
export interface CommandStartedEvent {
  executionId: string;
  commandId: string;
  label: string;
}

export interface CommandOutputEvent {
  executionId: string;
  stream: "stdout" | "stderr";
  text: string;
}

export interface CommandCompletedEvent {
  executionId: string;
  exitCode: number | null;
  signal: string | null;
  error?: string;
}

export type { Session, SessionRun, TrainingBundle };
