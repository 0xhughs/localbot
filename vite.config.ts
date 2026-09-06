import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { sidecarTokenPlugin } from "./scripts/sidecar-token-plugin.mjs";

// `0.0.0.0:8080` is the dev-server contract (`desktop/launch.mjs` and the
// proofs point Electron at it) — don't change host/port.
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    // Stage 17: dev server mints the per-launch sidecar token and puts it in
    // the loopback document only. Before tanstackStart so it wraps the response.
    sidecarTokenPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            // Desktop package uses a Node sidecar. Vercel deploy stays vercel.
            preset: process.env.LOCALBOT_DESKTOP_BUILD === "1" ? "node-server" : "vercel",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
