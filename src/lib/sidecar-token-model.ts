/**
 * Stage 17: browser-safe half of the sidecar token. No Node imports — this is
 * bundled into the renderer. The header name and meta name here must match
 * desktop/sidecar-token.mjs (locked by src/lib/sidecar-token.test.ts).
 */
export const SIDECAR_TOKEN_HEADER = "x-localbot-token";
export const SIDECAR_TOKEN_META = "localbot-sidecar-token";

export type SidecarAuthCode = "NO_TOKEN" | "BAD_TOKEN" | "SERVER_NO_TOKEN";

/**
 * Thrown by the global function middleware. The sidecar answers 401 for
 * NO_TOKEN / BAD_TOKEN and 503 for SERVER_NO_TOKEN (a server that was started
 * without a token refuses every function instead of serving them open).
 */
export class SidecarAuthError extends Error {
  readonly code: SidecarAuthCode;
  readonly status: 401 | 503;
  constructor(code: SidecarAuthCode, message?: string) {
    super(message ?? SIDECAR_AUTH_MESSAGES[code]);
    this.name = "SidecarAuthError";
    this.code = code;
    this.status = code === "SERVER_NO_TOKEN" ? 503 : 401;
  }
}

export const SIDECAR_AUTH_MESSAGES: Record<SidecarAuthCode, string> = {
  NO_TOKEN: "This request carries no sidecar token. Only the LocalBot window may call the sidecar.",
  BAD_TOKEN: "Wrong sidecar token. The token changes every time LocalBot starts.",
  SERVER_NO_TOKEN: "The sidecar was started without a per-launch token and refuses to serve functions.",
};

export function isSidecarAuthError(err: unknown): err is SidecarAuthError {
  return (
    err instanceof SidecarAuthError ||
    (err instanceof Error && (err as { code?: unknown }).code !== undefined && ["NO_TOKEN", "BAD_TOKEN", "SERVER_NO_TOKEN"].includes(String((err as { code?: unknown }).code)))
  );
}

type TokenWindow = {
  localbotDesktop?: { sidecarToken?: string | null };
  document?: { querySelector: (sel: string) => { getAttribute: (n: string) => string | null } | null };
};

/**
 * Where the renderer finds the token, in order:
 *   1. `window.localbotDesktop.sidecarToken` — Electron preload, set by the
 *      process that spawned the sidecar (packaged, and `npm run desktop` when
 *      main started the dev server).
 *   2. `<meta name="localbot-sidecar-token">` — the Vite dev server, for a
 *      loopback browser tab only. The packaged sidecar never writes this.
 * Empty string when neither is present (the server then answers NO_TOKEN).
 */
export function readBrowserSidecarToken(win: TokenWindow | undefined = typeof window === "undefined" ? undefined : (window as unknown as TokenWindow)): string {
  if (!win) return "";
  const fromBridge = win.localbotDesktop?.sidecarToken;
  if (typeof fromBridge === "string" && fromBridge) return fromBridge;
  const meta = win.document?.querySelector(`meta[name="${SIDECAR_TOKEN_META}"]`);
  const fromMeta = meta?.getAttribute("content");
  return typeof fromMeta === "string" ? fromMeta : "";
}
