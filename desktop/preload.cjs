// Stage 11: this file is CommonJS on purpose. The window runs with
// `sandbox: true`, and a sandboxed preload is executed as a plain script —
// an ESM `import` never loads there (verified: `window.localbotDesktop` was
// undefined with preload.mjs, so the title strip never rendered and the
// sidebar header sat under the macOS traffic lights). Only `electron` is
// required; nothing from Node reaches the renderer.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sandboxed preload must be CJS
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localbotDesktop", {
  platform: process.platform,
  setTitle: (title) => ipcRenderer.send("localbot:title", title),
  minimize: () => ipcRenderer.send("localbot:minimize"),
  maximize: () => ipcRenderer.send("localbot:maximize"),
  close: () => ipcRenderer.send("localbot:close"),
  onSettings: (fn) => {
    const wrap = () => fn();
    ipcRenderer.on("localbot:settings", wrap);
    return () => ipcRenderer.removeListener("localbot:settings", wrap);
  },
  /**
   * Open the OS folder dialog. Resolves to an absolute path or null.
   * @param {{ title?: string; defaultPath?: string }} [opts]
   * @returns {Promise<string | null>}
   */
  pickFolder: (opts) => ipcRenderer.invoke("localbot:pickFolder", opts ?? {}),
  /**
   * Show a file or folder in Finder / Explorer. `hostPath` comes from the
   * sidecar's browseHostPath; main re-checks it against the configured folders.
   * @param {string} hostPath
   * @returns {Promise<{ ok: boolean; error?: string }>}
   */
  revealPath: (hostPath) => ipcRenderer.invoke("localbot:revealPath", hostPath),
});
