/**
 * Stage 17 — dev-server half of the sidecar token (`npm run dev` only).
 *
 * The Vite dev server is the process that serves the server functions, so it
 * is the process that must hold the per-launch token:
 *
 *   - `npm run desktop` spawned us: LOCALBOT_SIDECAR_TOKEN is in our env and
 *     the Electron window gets the same value through its preload.
 *   - plain `npm run dev` in a terminal: nobody handed one down, so this
 *     plugin mints 32 random bytes when the config loads.
 *
 * A normal browser tab has no preload, so the dev server puts the token into
 * the served document as `<meta name="localbot-sidecar-token">` — only when
 * the request's Host is loopback (127.0.0.1 / localhost / ::1), only for HTML,
 * and only here (`apply: "serve"`, `configureServer`). The packaged sidecar
 * (Nitro build) never runs this plugin and never writes the meta tag.
 *
 * Honest limit: anyone who can GET http://127.0.0.1:8080/ can read the dev
 * token. Anyone who cannot reach the loopback document still gets 401.
 */
import {
  holdSidecarToken,
  injectSidecarTokenMeta,
  isLoopbackHost,
  mintSidecarToken,
  SIDECAR_TOKEN_ENV,
  takeSidecarToken,
} from "../desktop/sidecar-token.mjs";

/** @returns {import("vite").Plugin} */
export function sidecarTokenPlugin() {
  /** @type {string | null} */
  let token = null;
  return {
    name: "localbot:sidecar-token",
    apply: "serve",
    config(_config, env) {
      if (env.isPreview) return;
      token = takeSidecarToken() ?? mintSidecarToken();
      holdSidecarToken(token);
      // Left in the env until the SSR module takes it: the server module reads
      // once and deletes it before any child process is spawned.
      process.env[SIDECAR_TOKEN_ENV] = token;
    },
    configureServer(server) {
      const held = token;
      if (!held) return;
      // Registered now (not in a returned post-hook) so it wraps the response
      // before TanStack Start writes the document.
      server.middlewares.use(devTokenInjector(held));
    },
  };
}

/**
 * Connect middleware: for a loopback GET that receives text/html, insert the
 * meta tag after `<head>`. Everything else passes through untouched.
 *
 * @param {string} token
 * @returns {import("vite").Connect.NextHandleFunction}
 */
export function devTokenInjector(token) {
  return (req, res, next) => {
    if (!wantsDevToken(req)) {
      next();
      return;
    }
    let injected = false;
    const isHtml = () => String(res.getHeader("content-type") ?? "").toLowerCase().includes("text/html");
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    /** @param {unknown} chunk */
    const rewrite = (chunk) => {
      if (injected || chunk == null || !isHtml()) return chunk;
      const wasBuffer = Buffer.isBuffer(chunk) || chunk instanceof Uint8Array;
      const text = wasBuffer ? Buffer.from(/** @type {Uint8Array} */ (chunk)).toString("utf8") : String(chunk);
      const out = injectSidecarTokenMeta(text, token);
      if (out === text) return chunk;
      injected = true;
      // The document grew; a fixed length would truncate it.
      if (!res.headersSent) res.removeHeader("content-length");
      return wasBuffer ? Buffer.from(out, "utf8") : out;
    };
    // @ts-expect-error — wrapping Node's overloaded write(chunk, encoding?, cb?)
    res.write = (chunk, ...rest) => origWrite(rewrite(chunk), ...rest);
    // @ts-expect-error — wrapping Node's overloaded end(chunk?, encoding?, cb?)
    res.end = (chunk, ...rest) => (typeof chunk === "function" ? origEnd(chunk) : origEnd(rewrite(chunk), ...rest));
    next();
  };
}

/**
 * Only a loopback document request may carry the token: GET, Host is the
 * machine itself, and the client asked for HTML.
 *
 * @param {{ method?: string, headers: Record<string, string | string[] | undefined> }} req
 */
export function wantsDevToken(req) {
  if ((req.method ?? "GET").toUpperCase() !== "GET") return false;
  if (!isLoopbackHost(req.headers.host)) return false;
  const accept = req.headers.accept;
  const acc = Array.isArray(accept) ? accept.join(",") : String(accept ?? "");
  return acc.includes("text/html");
}
