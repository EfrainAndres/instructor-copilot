import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC_CHANNELS,
  type AddInstructorNoteInput,
  type AppInfo,
  type ClearContentRootInput,
  type CommandCompletedEvent,
  type CommandOutputEvent,
  type CommandStartedEvent,
  type CommandStartResult,
  type ConfigureContentRootInput,
  type ConfigureContentRootResult,
  type ContentRootStatus,
  type CreateSessionInput,
  type CreateTrainingInput,
  type InstructorRunContext,
  type IpcResult,
  type OpenCurrentStepResourceInput,
  type OpenOrCreateTrainingResult,
  type RecoveredRunResult,
  type ReleaseEvidenceStageInput,
  type RunCurrentStepCommandInput,
  type SaveTrainingMetadataInput,
  type Session,
  type SetChecklistItemInput,
  type StartRunInput,
  type TrainingBundle
} from "../shared/ipc";

const instructorCopilotApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  training: {
    open: (): Promise<IpcResult<OpenOrCreateTrainingResult>> => ipcRenderer.invoke(IPC_CHANNELS.trainingOpen),
    create: (input: CreateTrainingInput): Promise<IpcResult<OpenOrCreateTrainingResult>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingCreate, input),
    getCurrent: (): Promise<IpcResult<TrainingBundle | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingGetCurrent),
    saveMetadata: (input: SaveTrainingMetadataInput): Promise<IpcResult<TrainingBundle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingSaveMetadata, input),
    getContentRootStatus: (): Promise<IpcResult<ContentRootStatus[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingGetContentRootStatus),
    configureContentRoot: (input: ConfigureContentRootInput): Promise<IpcResult<ConfigureContentRootResult>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingConfigureContentRoot, input),
    clearContentRoot: (input: ClearContentRootInput): Promise<IpcResult<ContentRootStatus[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.trainingClearContentRoot, input)
  },
  session: {
    create: (input: CreateSessionInput): Promise<IpcResult<TrainingBundle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionCreate, input),
    save: (session: Session): Promise<IpcResult<TrainingBundle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionSave, session)
  },
  run: {
    start: (input: StartRunInput): Promise<IpcResult<InstructorRunContext>> =>
      ipcRenderer.invoke(IPC_CHANNELS.runStart, input),
    restore: (): Promise<IpcResult<RecoveredRunResult | null>> => ipcRenderer.invoke(IPC_CHANNELS.runRestore),
    next: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runNext),
    previous: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runPrevious),
    skip: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runSkip),
    pause: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runPause),
    resume: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runResume),
    setChecklistItem: (input: SetChecklistItemInput): Promise<IpcResult<InstructorRunContext>> =>
      ipcRenderer.invoke(IPC_CHANNELS.runSetChecklistItem, input),
    releaseEvidenceStage: (input: ReleaseEvidenceStageInput): Promise<IpcResult<InstructorRunContext>> =>
      ipcRenderer.invoke(IPC_CHANNELS.runReleaseEvidenceStage, input),
    addNote: (input: AddInstructorNoteInput): Promise<IpcResult<InstructorRunContext>> =>
      ipcRenderer.invoke(IPC_CHANNELS.runAddNote, input),
    complete: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runComplete)
  },
  resource: {
    openPresentation: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC_CHANNELS.resourceOpenPresentation),
    openCurrentStepResource: (input: OpenCurrentStepResourceInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.resourceOpenCurrentStep, input)
  },
  command: {
    runCurrentStep: (input: RunCurrentStepCommandInput): Promise<IpcResult<CommandStartResult>> =>
      ipcRenderer.invoke(IPC_CHANNELS.commandRunCurrentStep, input),
    onStarted: (listener: (event: CommandStartedEvent) => void): (() => void) => {
      const handler = (_ipcEvent: IpcRendererEvent, payload: CommandStartedEvent): void => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.commandStarted, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.commandStarted, handler);
    },
    onOutput: (listener: (event: CommandOutputEvent) => void): (() => void) => {
      const handler = (_ipcEvent: IpcRendererEvent, payload: CommandOutputEvent): void => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.commandOutput, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.commandOutput, handler);
    },
    onCompleted: (listener: (event: CommandCompletedEvent) => void): (() => void) => {
      const handler = (_ipcEvent: IpcRendererEvent, payload: CommandCompletedEvent): void => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.commandCompleted, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.commandCompleted, handler);
    }
  }
};

contextBridge.exposeInMainWorld("instructorCopilot", instructorCopilotApi);

export type InstructorCopilotApi = typeof instructorCopilotApi;
