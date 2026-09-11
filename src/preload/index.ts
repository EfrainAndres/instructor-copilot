import { contextBridge, ipcRenderer } from "electron";

interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

const instructorCopilotApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("app:get-info")
};

contextBridge.exposeInMainWorld("instructorCopilot", instructorCopilotApi);

export type InstructorCopilotApi = typeof instructorCopilotApi;
