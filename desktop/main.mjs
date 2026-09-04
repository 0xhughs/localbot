import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEV_UI_URL,
  MISSING_UI_MESSAGE,
  SIDECAR_HOST,
  SIDECAR_PORT,
  SIDECAR_URL,
  isPackagedMode,
  packagedHarnessEnv,
  resolveUiLoad,
  sidecarScriptPath,
  sidecarServerEntry,
  unpackAsarPath,
} from "./packaged.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

app.setName("LocalBot");

let uiChild = null;
let sidecarChild = null;
let startedUi = false;

function packaged() {
  return isPackagedMode({ packaged: app.isPackaged, env: process.env });
}

function applyPaths() {
  process.env.LOCALBOT_ELECTRON = "1";
  process.env.LOCALBOT_DATA_DIR = path.join(app.getPath("appData"), "LocalBot");
  process.env.LOCALBOT_DOCUMENTS_DIR = app.getPath("documents");
  if (packaged()) process.env.LOCALBOT_PACKAGED = "1";
  fs.mkdirSync(process.env.LOCALBOT_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(process.env.LOCALBOT_DATA_DIR, "models"), { recursive: true });
  fs.mkdirSync(path.join(process.env.LOCALBOT_DATA_DIR, "bin"), { recursive: true });
}

function isUnderDir(root, target) {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** The four scope folders from localbot-config.json (v2). Empty when unset. */
function configuredFolderRoots() {
  try {
    const file = path.join(process.env.LOCALBOT_DATA_DIR, "localbot-config.json");
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    const f = cfg && cfg.folders;
    if (!f || typeof f !== "object") return [];
    return ["employeeRoot", "employeeShared", "departmentShared", "companyShared"]
      .map((k) => f[k])
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => path.resolve(v));
  } catch {
    return [];
  }
}

function packagedServerDir() {
  if (process.env.LOCALBOT_SERVER_DIR) return process.env.LOCALBOT_SERVER_DIR;
  if (packaged()) return path.join(process.resourcesPath, "localbot-server");
  return path.join(root, ".output");
}

function resolveSidecarScript() {
  if (packaged()) {
    const extra = sidecarScriptPath({
      packaged: true,
      resourcesPath: process.resourcesPath,
    });
    if (fs.existsSync(extra)) return extra;
    const unpacked = unpackAsarPath(path.join(here, "sidecar.mjs"));
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return path.join(here, "sidecar.mjs");
}

async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok || res.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function failMissingUi(message = MISSING_UI_MESSAGE) {
  dialog.showErrorBox("LocalBot", message);
  app.quit();
}

async function startSidecar() {
  const serverDir = packagedServerDir();
  const entry = sidecarServerEntry(serverDir);
  const script = resolveSidecarScript();
  if (!entry || !fs.existsSync(entry) || !fs.existsSync(script)) {
    failMissingUi();
    return false;
  }
  if (await up(SIDECAR_URL, 800)) return true;

  // Stage 8: the Harness runs from the app's own resources — bundled Node
  // (Electron 36's Node 22.14 cannot load dsh), the dsh/ overlay, and the
  // @deepseek-ai/dsh tree. The sidecar's findHarnessNode never looks at PATH
  // or ~/.nvm in packaged mode; if a piece is missing it refuses and says so.
  const harness = packagedHarnessEnv({
    resourcesPath: process.resourcesPath,
    exists: (p) => fs.existsSync(p),
  });
  for (const k of ["LOCALBOT_DSH_NODE", "LOCALBOT_DSH_DIR", "LOCALBOT_DSH_MODULES"]) {
    if (!harness[k]) console.error(`[desktop] packaged Harness resource missing: ${k} (dsh will refuse to start)`);
  }

  const env = {
    ...process.env,
    ...harness,
    ELECTRON_RUN_AS_NODE: "1",
    LOCALBOT_SERVER_DIR: serverDir,
    LOCALBOT_ELECTRON: "1",
    LOCALBOT_PACKAGED: "1",
    LOCALBOT_DATA_DIR: process.env.LOCALBOT_DATA_DIR,
    LOCALBOT_DOCUMENTS_DIR: process.env.LOCALBOT_DOCUMENTS_DIR,
    NITRO_HOST: SIDECAR_HOST,
    HOST: SIDECAR_HOST,
    NITRO_PORT: String(SIDECAR_PORT),
    PORT: String(SIDECAR_PORT),
  };
  sidecarChild = spawn(process.execPath, [script], {
    cwd: serverDir,
    stdio: "pipe",
    windowsHide: true,
    env,
  });
  sidecarChild.stderr?.on("data", (buf) => {
    const t = String(buf);
    if (t.trim()) console.error("[sidecar]", t.trim());
  });
  sidecarChild.on("exit", () => {
    sidecarChild = null;
  });
  const ok = await up(SIDECAR_URL, 45000);
  if (!ok) {
    sidecarChild?.kill();
    sidecarChild = null;
    failMissingUi("LocalBot UI server failed to start.");
    return false;
  }
  return true;
}

async function ensureDevUi() {
  const decided = resolveUiLoad({
    packaged: false,
    uiUrlEnv: process.env.LOCALBOT_UI_URL || "",
    sidecarReady: false,
  });
  const url = decided.url || DEV_UI_URL;
  if (await up(url, 1200)) return url;
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
  const ok = await up(url, 60000);
  if (!ok) {
    throw new Error("LocalBot UI did not start. Try npm run dev, then npm run desktop.");
  }
  return url;
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

async function createWindow(uiUrl) {
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
  ipcMain.removeHandler("localbot:pickFolder");
  ipcMain.removeHandler("localbot:revealPath");

  // Reveal in Finder / Explorer. The renderer gets the host path from the
  // sidecar (browseHostPath) and hands it here; main re-checks that it sits
  // inside one of the configured scope folders before showing it.
  ipcMain.handle("localbot:revealPath", async (_e, hostPath) => {
    if (typeof hostPath !== "string" || !hostPath.trim()) {
      return { ok: false, error: "No path." };
    }
    const target = path.resolve(hostPath);
    const roots = configuredFolderRoots();
    if (!roots.some((r) => isUnderDir(r, target))) {
      return { ok: false, error: "Path is outside the configured folders." };
    }
    if (!fs.existsSync(target)) {
      return { ok: false, error: "That file or folder is not on disk (disconnected or deleted)." };
    }
    shell.showItemInFolder(target);
    return { ok: true };
  });

  // Native folder dialog. Returns one absolute path or null. The renderer
  // still sends the result through the sidecar's folder validation before it
  // becomes a configured scope.
  ipcMain.handle("localbot:pickFolder", async (_e, opts) => {
    const title = opts && typeof opts.title === "string" ? opts.title : "Choose a folder";
    const defaultPath =
      opts && typeof opts.defaultPath === "string" && opts.defaultPath ? opts.defaultPath : undefined;
    const result = await dialog.showOpenDialog(win, {
      title,
      defaultPath,
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

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
  await win.loadURL(uiUrl);
}

// Stage 6: the sidecar owns the one llama-server (runtime pick, GPU layers,
// restart onto the selected agent's GGUF). Electron main starts none of its
// own, so there is never a second server the sidecar could not restart; the
// sidecar kills its llama-server child when it exits.
function stopChildren() {
  if (sidecarChild) {
    sidecarChild.kill();
    sidecarChild = null;
  }
  if (startedUi && uiChild) {
    uiChild.kill();
    uiChild = null;
  }
}

app.whenReady().then(async () => {
  applyPaths();
  const isPkg = packaged();
  if (isPkg) {
    const ready = await startSidecar();
    if (!ready) return;
    const load = resolveUiLoad({ packaged: true, sidecarReady: true });
    await createWindow(load.url);
  } else {
    const url = await ensureDevUi();
    await createWindow(url);
  }
});

app.on("window-all-closed", () => {
  stopChildren();
  app.quit();
});

app.on("before-quit", () => {
  stopChildren();
});
