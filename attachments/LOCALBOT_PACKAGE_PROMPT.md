# LOCALBOT — PACKAGE PASS (no Node required to open the window)

Repo: https://github.com/0xhughs/localbot
HEAD when written: `1b9a82c`

Read first:
- `LOCALBOT_HANDOFF.md` (desktop pass section)
- `desktop/main.mjs`
- `desktop/launch.mjs`
- `desktop/llama.mjs`
- `package.json`
- `src/lib/runtime/local-engine.ts`

## Why this pass exists

`npm run desktop` still loads `http://127.0.0.1:8080` and may spawn `npm run dev`. An employee still needs Node and the git repo. That is not an app.

This pass packages LocalBot so a person can open a window **without Node on PATH**.

Keep: local GGUF default, disk folders, grants, mascots, hosted-demo switch **off**.
Do not add: NAS protocol, DeepSeek Harness, Arabic, streaming, store signing, Ollama-as-engine.

## Goal

1. `npm run build:desktop` produces an **unsigned** app for the current OS:
   - macOS: `dist/desktop/mac/LocalBot.app` (or arm64/x64 equivalent)
   - Windows: `dist/desktop/win-unpacked/LocalBot.exe`
   - Linux: `dist/desktop/linux-unpacked/LocalBot`
2. That binary starts a window. It does **not** run `npm run dev`.
3. Chat still uses llama.cpp on `127.0.0.1:18789` and a GGUF on disk.
4. Company files default to `{documents}/LocalBot/{CompanyName}`.
5. Models default to `{appData}/LocalBot/models/`.

## 1. Stop depending on Vite dev

Change `desktop/main.mjs`:

- If `LOCALBOT_UI_URL` is set, you may still load it (dev only).
- Default packaged path: load the **built** web UI from disk (`loadFile` on the Vite/Nitro client output, or a static export you generate).
- Packaged mode must **not** `spawn("npm", ["run", "dev"])`.
- If the UI files are missing, show a dialog “LocalBot UI is missing. Run npm run build:desktop.” and quit. Do not fall back to localhost:8080 in packaged mode.

You will need a real server for TanStack Start server functions (`runHarnessTurn`, `fsWrite`, model download). Options, pick the smallest that works:

**Preferred:** ship a small Node sidecar that is the already-built Nitro/Vite server, started by Electron on `127.0.0.1` only (a high port or 8080). Bundle **Node with the app** via electron-builder extraResources, or use Electron’s own Node to start `node server.mjs` from the packaged files. The employee does not install Node themselves.

**Forbidden:** requiring a global `npm` / `node` from the user’s machine in packaged mode.

Document in README which of those you shipped.

## 2. electron-builder

Add `electron-builder` (devDependency). Add `package.json` fields:

```
"build": {
  "appId": "com.localbot.app",
  "productName": "LocalBot",
  "directories": { "output": "dist/desktop" },
  "files": [ /* built UI, desktop/*.mjs, catalog/*.json, needed server files */ ],
  "asar": true,
  "mac": { "target": ["dir"], "identity": null },
  "win": { "target": ["dir"] },
  "linux": { "target": ["dir"] }
}
```

Scripts:

```
"desktop": "node desktop/launch.mjs"          # keep for dev
"build:desktop": "… vite/nitro build … && electron-builder --dir"
```

`--dir` only. No DMG/Squirrel/AppImage requirement. No Apple notarization. No code signing. If the builder warns about signing, ignore it.

`electron` is already a devDependency (`^36.3.1`).

## 3. llama.cpp in the packaged app

Keep `catalog/llama-assets.json` (darwin-arm64, darwin-x64, win32-x64, linux-x64).

On first run of the packaged app:

- Resolve the asset for `process.platform`-`process.arch`
- Download into `{appData}/LocalBot/bin/{platform-arch}/` if missing
- Spawn `llama-server` / `llama-server.exe` bound to `127.0.0.1:18789`
- Load the active GGUF from `{appData}/LocalBot/models/`

Do not assume Ubuntu-only. Do not require Ollama.

If this Linux preview cannot paint Electron (no GTK), still produce `linux-unpacked` and say so in the handoff. Do not fake a `.dmg`.

## 4. Data paths (packaged)

Same as the desktop pass, enforced:

| Thing | Path |
|---|---|
| Config | `{appData}/LocalBot/localbot-config.json` |
| Models | `{appData}/LocalBot/models/` |
| llama bin | `{appData}/LocalBot/bin/{platform-arch}/` |
| Company tree | `{documents}/LocalBot/{CompanyName}/` |

Web `npm run dev` may keep `{cwd}/data/...`. Packaged must not write company files into the asar / install folder.

## 5. Copy

README first-run for testers tomorrow:

```
# Dev (needs Node)
npm install
npm run desktop

# Packaged (this pass)
npm run build:desktop
# then open:
#   dist/desktop/mac/LocalBot.app
#   dist/desktop/win-unpacked/LocalBot.exe
#   dist/desktop/linux-unpacked/LocalBot
```

State clearly: unsigned, not notarized, not a store build.

Update the top of `LOCALBOT_HANDOFF.md`:

```
## Update after package pass
{date}
- Packaged binary path: {exact folder you produced}
- Packaged mode runs npm run dev? no
- Employee needs Node installed? no / yes (if yes you failed)
- llama.cpp targets still: darwin-arm64, darwin-x64, win32-x64, linux-x64
- signed dmg/exe: still NOT BUILT
```

## 6. Tests

- Packaged-mode flag / helper: `isPackaged` true ⇒ UI URL is not the dev-only localhost fallback unless a sidecar you started.
- Platform → llama asset map still has four targets.
- `executeTurn` default path still does not require `XAI_API_KEY`.
- Existing disk grant tests still pass.

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

## Out of scope

- Apple notarization, Windows EV cert, Linux .deb repo
- DeepSeek Harness
- NAS / P2P
- Streaming
- Arabic
- Making grok-4.5 default
- Redesigning mascots

## Done when

1. `npm run build:desktop` exits 0 on this OS and writes an unpacked app under `dist/desktop/`.
2. Opening that app does not spawn `npm run dev`.
3. Window title is LocalBot. No URL bar.
4. After onboarding (or with an existing GGUF), a chat turn can still write `hello.md` on disk via the local engine.
5. README and handoff match the binary path.
6. Hosted demo stays off.

If electron-builder cannot run in this preview, implement the full config + `build:desktop` script, produce as much of `dist/desktop` as you can, and write the exact command a laptop must run tomorrow. Do not silently leave packaged mode wired to Vite dev.

Stop there.
