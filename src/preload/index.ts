import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppInfo,
  type CreateSessionInput,
  type CreateTrainingInput,
  type IpcResult,
  type OpenOrCreateTrainingResult,
  type SaveTrainingMetadataInput,
  type Session,
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
      ipcRenderer.invoke(IPC_CHANNELS.trainingSaveMetadata, input)
  },
  session: {
    create: (input: CreateSessionInput): Promise<IpcResult<TrainingBundle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionCreate, input),
    save: (session: Session): Promise<IpcResult<TrainingBundle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionSave, session)
  }
};

contextBridge.exposeInMainWorld("instructorCopilot", instructorCopilotApi);

export type InstructorCopilotApi = typeof instructorCopilotApi;
