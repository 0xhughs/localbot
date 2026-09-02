/**
 * The narrow preload bridge exposed by desktop/preload.mjs. Only window
 * controls and the native folder picker — no Node, no fs, no shell.
 */
export type LocalBotDesktopBridge = {
  platform: string;
  setTitle: (title: string) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onSettings: (fn: () => void) => () => void;
  pickFolder?: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
};

declare global {
  interface Window {
    localbotDesktop?: LocalBotDesktopBridge;
  }
}

export function desktopBridge(): LocalBotDesktopBridge | undefined {
  return typeof window !== "undefined" ? window.localbotDesktop : undefined;
}

/** True when the OS folder dialog is available (Electron with the Stage 2 preload). */
export function canPickFolder(): boolean {
  return typeof desktopBridge()?.pickFolder === "function";
}

export async function pickFolder(opts?: {
  title?: string;
  defaultPath?: string;
}): Promise<string | null> {
  const bridge = desktopBridge();
  if (!bridge?.pickFolder) return null;
  try {
    return await bridge.pickFolder(opts);
  } catch {
    return null;
  }
}
