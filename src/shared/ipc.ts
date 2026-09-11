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
  runNext: "run:next",
  runPrevious: "run:previous",
  runSkip: "run:skip",
  runPause: "run:pause",
  runResume: "run:resume",
  runSetChecklistItem: "run:set-checklist-item",
  runComplete: "run:complete"
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

/**
 * The one safe run representation the renderer ever sees: the authoritative
 * SessionRun plus the authored Session it belongs to. No filesystem roots, no
 * Training metadata - main owns those and never hands them across the boundary.
 */
export interface InstructorRunContext {
  run: SessionRun;
  session: Session;
}

export type { Session, SessionRun, TrainingBundle };
