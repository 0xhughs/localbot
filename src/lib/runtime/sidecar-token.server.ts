/**
 * Stage 17: server half of the sidecar token. Server only — imports Node
 * crypto through desktop/sidecar-token.mjs and the request helpers.
 *
 * The token is taken from LOCALBOT_SIDECAR_TOKEN exactly once (then removed
 * from this process's env so spawned children never see it) and kept in
 * memory for the life of the process. There is no setting, file or flag
 * that turns the check off.
 */
import { getRequestHeader, setResponseStatus } from "@tanstack/react-start/server";
import { SIDECAR_TOKEN_HEADER, takeSidecarToken, verifySidecarToken } from "../../../desktop/sidecar-token.mjs";
import { SidecarAuthError } from "../sidecar-token-model.ts";

/** True when this process holds a per-launch token (env or already in memory). */
export function sidecarTokenLoaded(): boolean {
  return takeSidecarToken() !== null;
}

/**
 * Called by the global function middleware before every server function.
 * Throws SidecarAuthError with the HTTP status already set on the response:
 *   503 SERVER_NO_TOKEN — the server was started without a token
 *   401 NO_TOKEN        — no / empty `x-localbot-token` header
 *   401 BAD_TOKEN       — header present but not byte-equal (constant time)
 */
export function assertSidecarRequest(presented: string | undefined = getRequestHeader(SIDECAR_TOKEN_HEADER as never)): void {
  const expected = takeSidecarToken();
  if (!expected) {
    fail(new SidecarAuthError("SERVER_NO_TOKEN"));
  }
  const r = verifySidecarToken(expected, presented);
  if (!r.ok) fail(new SidecarAuthError(r.code));
}

// Start serializes the thrown error (with `code`, via the adapter in
// src/start.ts) and takes the status from the request's response state.
function fail(err: SidecarAuthError): never {
  setResponseStatus(err.status, err.status === 401 ? "Unauthorized" : "Service Unavailable");
  throw err;
}
