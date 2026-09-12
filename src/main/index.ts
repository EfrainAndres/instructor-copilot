import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  IPC_CHANNELS,
  type AddInstructorNoteInput,
  type AppInfo,
  type ClearContentRootInput,
  type ConfigureContentRootInput,
  type CreateSessionInput,
  type CreateTrainingInput,
  type IpcResult,
  type OpenCurrentStepResourceInput,
  type ReleaseEvidenceStageInput,
  type RunCurrentStepCommandInput,
  type SaveTrainingMetadataInput,
  type SetChecklistItemInput,
  type StartRunInput
} from "../shared/ipc";
import type { Session } from "../session-engine";
import {
  clearContentRootForActiveTraining,
  configureContentRoot,
  createSession,
  createTraining,
  getContentRootStatus,
  getCurrentTraining,
  openTraining,
  saveSessionData,
  saveTrainingMetadata
} from "./trainingController";
import {
  addCurrentStepNote,
  complete,
  nextStep,
  pause,
  prepareActiveRunForShutdown,
  previousStep,
  releaseCurrentEvidenceStage,
  resume,
  setRunChecklistItem,
  skipStep,
  startRun
} from "./runController";
import { openCurrentStepResource, openPresentation } from "./resourceController";
import { runCurrentStepCommand } from "./commandController";
import { restoreActiveRunOnStartup } from "./recoveryController";
import { createQuitCoordinator } from "./quitCoordinator";

function getAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  };
}

/**
 * Reduces a thrown domain error to a short message instead of letting it cross
 * the IPC boundary as a rejected promise carrying a raw stack trace.
 */
async function toResult<T>(operation: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const rendererEntryUrl = process.env["ELECTRON_RENDERER_URL"];
const packagedRendererFileUrl = pathToFileURL(join(__dirname, "../renderer/index.html")).href;

function isTrustedNavigationTarget(url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  if (rendererEntryUrl) {
    let trusted: URL;
    try {
      trusted = new URL(rendererEntryUrl);
    } catch {
      return false;
    }
    return target.origin === trusted.origin;
  }

  return target.href === packagedRendererFileUrl;
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "Instructor Copilot",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Phase 1 has no external-link launching yet; deny every renderer-created window outright.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Block top-level navigation away from the app's own renderer entry (dev server origin or packaged file).
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigationTarget(url)) {
      event.preventDefault();
    }
  });

  if (rendererEntryUrl) {
    void window.loadURL(rendererEntryUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

void app.whenReady().then(() => {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, () => getAppInfo());

  ipcMain.handle(IPC_CHANNELS.trainingOpen, (event) =>
    toResult(() => openTraining(BrowserWindow.fromWebContents(event.sender)))
  );

  ipcMain.handle(IPC_CHANNELS.trainingCreate, (event, input: CreateTrainingInput) =>
    toResult(() => createTraining(BrowserWindow.fromWebContents(event.sender), input))
  );

  ipcMain.handle(IPC_CHANNELS.trainingGetCurrent, () => toResult(() => getCurrentTraining()));

  ipcMain.handle(IPC_CHANNELS.trainingSaveMetadata, (_event, input: SaveTrainingMetadataInput) =>
    toResult(() => saveTrainingMetadata(input))
  );

  ipcMain.handle(IPC_CHANNELS.sessionCreate, (_event, input: CreateSessionInput) =>
    toResult(() => createSession(input))
  );

  ipcMain.handle(IPC_CHANNELS.sessionSave, (_event, session: Session) => toResult(() => saveSessionData(session)));

  ipcMain.handle(IPC_CHANNELS.runStart, (_event, input: StartRunInput) => toResult(() => startRun(input.sessionId)));
  ipcMain.handle(IPC_CHANNELS.runRestore, () => toResult(() => restoreActiveRunOnStartup()));
  ipcMain.handle(IPC_CHANNELS.runNext, () => toResult(() => nextStep()));
  ipcMain.handle(IPC_CHANNELS.runPrevious, () => toResult(() => previousStep()));
  ipcMain.handle(IPC_CHANNELS.runSkip, () => toResult(() => skipStep()));
  ipcMain.handle(IPC_CHANNELS.runPause, () => toResult(() => pause()));
  ipcMain.handle(IPC_CHANNELS.runResume, () => toResult(() => resume()));
  ipcMain.handle(IPC_CHANNELS.runSetChecklistItem, (_event, input: SetChecklistItemInput) =>
    toResult(() => setRunChecklistItem(input.stepId, input.itemId, input.value))
  );
  ipcMain.handle(IPC_CHANNELS.runReleaseEvidenceStage, (_event, input: ReleaseEvidenceStageInput) =>
    toResult(() => releaseCurrentEvidenceStage(input.evidenceStageId))
  );
  ipcMain.handle(IPC_CHANNELS.runAddNote, (_event, input: AddInstructorNoteInput) =>
    toResult(() => addCurrentStepNote(input.text))
  );
  ipcMain.handle(IPC_CHANNELS.runComplete, () => toResult(() => complete()));

  ipcMain.handle(IPC_CHANNELS.trainingGetContentRootStatus, () => toResult(() => getContentRootStatus()));
  ipcMain.handle(IPC_CHANNELS.trainingConfigureContentRoot, (event, input: ConfigureContentRootInput) =>
    toResult(() => configureContentRoot(BrowserWindow.fromWebContents(event.sender), input.rootId))
  );
  ipcMain.handle(IPC_CHANNELS.trainingClearContentRoot, (_event, input: ClearContentRootInput) =>
    toResult(() => clearContentRootForActiveTraining(input.rootId))
  );

  ipcMain.handle(IPC_CHANNELS.resourceOpenPresentation, () => toResult(() => openPresentation()));
  ipcMain.handle(IPC_CHANNELS.resourceOpenCurrentStep, (_event, input: OpenCurrentStepResourceInput) =>
    toResult(() => openCurrentStepResource(input.resourceId))
  );

  ipcMain.handle(IPC_CHANNELS.commandRunCurrentStep, (event, input: RunCurrentStepCommandInput) =>
    toResult(() =>
      runCurrentStepCommand(BrowserWindow.fromWebContents(event.sender), event.sender, input.commandId)
    )
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Electron's "before-quit" fires synchronously, but suspending the active run
// is async, and it can fire more than once while that preparation is still
// pending. The coordinator owns exactly one preparation attempt: every event
// while it's running stays prevented and joins that same attempt; only once
// it settles does it call app.quit(), and the following before-quit then
// passes through normally.
const handleBeforeQuit = createQuitCoordinator(prepareActiveRunForShutdown, () => app.quit());

app.on("before-quit", (event) => {
  handleBeforeQuit(event);
});
