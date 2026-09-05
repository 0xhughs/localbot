/**
 * Stage 17: the one gate every createServerFn passes through. Registered as
 * global `functionMiddleware` in src/start.ts, so a new server function is
 * covered without opting in and cannot opt out.
 *
 * Client: attach `x-localbot-token` from the preload bridge or the dev
 * server's meta tag. Server: constant-time check; missing or wrong → 401.
 *
 * Dual client/server file: only `*.server` modules may be imported on the
 * server branch, and only through a dynamic import (see auth/middleware.ts).
 */
import { createMiddleware } from "@tanstack/react-start";
import { readBrowserSidecarToken, SIDECAR_TOKEN_HEADER } from "../sidecar-token-model.ts";

export const sidecarTokenMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    return next({ headers: { [SIDECAR_TOKEN_HEADER]: readBrowserSidecarToken() } });
  })
  .server(async ({ next }) => {
    const { assertSidecarRequest } = await import("./sidecar-token.server.ts");
    assertSidecarRequest();
    return next();
  });
