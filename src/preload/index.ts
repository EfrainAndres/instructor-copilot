import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppInfo,
  type ClearContentRootInput,
  type ConfigureContentRootInput,
  type ConfigureContentRootResult,
  type ContentRootStatus,
  type CreateSessionInput,
  type CreateTrainingInput,
  type InstructorRunContext,
  type IpcResult,
  type OpenCurrentStepResourceInput,
  type OpenOrCreateTrainingResult,
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
    next: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runNext),
    previous: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runPrevious),
    skip: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runSkip),
    pause: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runPause),
    resume: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runResume),
    setChecklistItem: (input: SetChecklistItemInput): Promise<IpcResult<InstructorRunContext>> =>
      ipcRenderer.invoke(IPC_CHANNELS.runSetChecklistItem, input),
    complete: (): Promise<IpcResult<InstructorRunContext>> => ipcRenderer.invoke(IPC_CHANNELS.runComplete)
  },
  resource: {
    openPresentation: (): Promise<IpcResult<null>> => ipcRenderer.invoke(IPC_CHANNELS.resourceOpenPresentation),
    openCurrentStepResource: (input: OpenCurrentStepResourceInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.resourceOpenCurrentStep, input)
  }
};

contextBridge.exposeInMainWorld("instructorCopilot", instructorCopilotApi);

export type InstructorCopilotApi = typeof instructorCopilotApi;
