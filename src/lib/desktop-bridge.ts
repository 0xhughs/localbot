/**
 * The narrow preload bridge exposed by desktop/preload.mjs. Only window
 * controls, the native folder picker, and reveal-in-file-manager — no Node,
 * no fs, no shell.
 */
export type LocalBotDesktopBridge = {
  platform: string;
  setTitle: (title: string) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onSettings: (fn: () => void) => () => void;
  pickFolder?: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
  revealPath?: (hostPath: string) => Promise<{ ok: boolean; error?: string }>;
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

/** True when Reveal in Finder/Explorer is available (Electron with the Stage 3 preload). */
export function canRevealPath(): boolean {
  return typeof desktopBridge()?.revealPath === "function";
}

/** Platform label for the reveal action. */
export function revealLabel(): string {
  const p = desktopBridge()?.platform;
  if (p === "darwin") return "Reveal in Finder";
  if (p === "win32") return "Reveal in Explorer";
  return "Reveal in file manager";
}

export async function revealPath(hostPath: string): Promise<{ ok: boolean; error?: string }> {
  const bridge = desktopBridge();
  if (!bridge?.revealPath) return { ok: false, error: "Not available in the browser preview." };
  try {
    return await bridge.revealPath(hostPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
