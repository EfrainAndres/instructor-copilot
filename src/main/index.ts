import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
