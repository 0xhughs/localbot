import { contextBridge, ipcRenderer } from "electron";

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
});
