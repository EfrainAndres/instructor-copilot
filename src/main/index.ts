import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";

interface AppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
}

function getAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  };
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

  // Deny arbitrary new-window creation; open unexpected external targets in the OS browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Block navigation away from the app's own renderer bundle/dev server.
  window.webContents.on("will-navigate", (event, url) => {
    const isDev = !!process.env["ELECTRON_RENDERER_URL"];
    const allowedOrigin = isDev ? process.env["ELECTRON_RENDERER_URL"] : "file://";
    if (!allowedOrigin || !url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

void app.whenReady().then(() => {
  ipcMain.handle("app:get-info", () => getAppInfo());

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
