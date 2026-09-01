import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readActiveModelPath, spawnLlamaServer, stopLlamaServer } from "./llama.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const UI = process.env.LOCALBOT_UI_URL || "http://127.0.0.1:8080/";

app.setName("LocalBot");

let uiChild = null;
let startedUi = false;

function applyPaths() {
  process.env.LOCALBOT_ELECTRON = "1";
  process.env.LOCALBOT_DATA_DIR = path.join(app.getPath("appData"), "LocalBot");
  process.env.LOCALBOT_DOCUMENTS_DIR = app.getPath("documents");
  fs.mkdirSync(process.env.LOCALBOT_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(process.env.LOCALBOT_DATA_DIR, "models"), { recursive: true });
  fs.mkdirSync(path.join(process.env.LOCALBOT_DATA_DIR, "bin"), { recursive: true });
}

async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function ensureUi() {
  if (await up(UI, 1200)) return;
  startedUi = true;
  uiChild = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      LOCALBOT_ELECTRON: "1",
      LOCALBOT_DATA_DIR: process.env.LOCALBOT_DATA_DIR,
      LOCALBOT_DOCUMENTS_DIR: process.env.LOCALBOT_DOCUMENTS_DIR,
    },
  });
  const ok = await up(UI, 60000);
  if (!ok) {
    throw new Error("LocalBot UI did not start. Try npm run dev, then npm run desktop.");
  }
}

function buildMenu(win) {
  const template = [
    {
      label: "LocalBot",
      submenu: [
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => win.webContents.send("localbot:settings"),
        },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0a0b0d",
    title: "LocalBot",
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      preload: path.join(here, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  buildMenu(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  ipcMain.removeAllListeners("localbot:title");
  ipcMain.removeAllListeners("localbot:minimize");
  ipcMain.removeAllListeners("localbot:maximize");
  ipcMain.removeAllListeners("localbot:close");

  ipcMain.on("localbot:title", (_e, title) => {
    if (typeof title === "string" && title.trim()) win.setTitle(title.trim());
  });
  ipcMain.on("localbot:minimize", () => win.minimize());
  ipcMain.on("localbot:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("localbot:close", () => win.close());

  win.once("ready-to-show", () => win.show());
  await win.loadURL(UI);
}

async function maybeStartLlama() {
  const dataDir = process.env.LOCALBOT_DATA_DIR;
  const modelPath = readActiveModelPath(dataDir);
  if (!modelPath) return;
  try {
    await spawnLlamaServer({ dataDir, modelPath });
  } catch {
    /* UI server will retry on first chat */
  }
}

app.whenReady().then(async () => {
  applyPaths();
  await ensureUi();
  await createWindow();
  void maybeStartLlama();
});

app.on("window-all-closed", () => {
  stopLlamaServer();
  if (startedUi && uiChild) {
    uiChild.kill();
    uiChild = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  stopLlamaServer();
});
