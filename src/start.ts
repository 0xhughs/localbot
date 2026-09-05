/**
 * TanStack Start instance. Stage 17: every server function runs behind the
 * per-launch sidecar token (functionMiddleware). Defining a start instance
 * replaces Start's implicit CSRF middleware, so it is re-added here
 * explicitly for server functions — a spoofed Origin alone never got past
 * the token, but the same-origin check costs nothing and stays.
 */
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { createSerializationAdapter } from "@tanstack/react-router";
import { sidecarTokenMiddleware } from "@/lib/runtime/sidecar-token-middleware";
import { SidecarAuthError, type SidecarAuthCode } from "@/lib/sidecar-token-model";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Start's default Error adapter keeps only `message`; this one keeps `code`
// so the 401 body reads `{ code: "NO_TOKEN" | "BAD_TOKEN" }` on the wire and
// the renderer gets a real SidecarAuthError back.
const sidecarAuthErrorAdapter = createSerializationAdapter({
  key: "SidecarAuthError",
  test: (v: unknown): v is SidecarAuthError => v instanceof SidecarAuthError,
  toSerializable: (e) => ({ code: e.code as SidecarAuthCode, message: e.message }),
  fromSerializable: (d) => new SidecarAuthError(d.code, d.message),
});

export const startInstance = createStart(() => ({
  serializationAdapters: [sidecarAuthErrorAdapter],
  requestMiddleware: [csrfMiddleware],
  functionMiddleware: [sidecarTokenMiddleware],
}));
