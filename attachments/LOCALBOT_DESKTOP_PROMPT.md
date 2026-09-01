# LOCALBOT — DESKTOP WINDOW PASS

Repo: https://github.com/0xhughs/localbot
Read first: `LOCALBOT_HANDOFF.md`, `README.md`, `src/lib/runtime/local-engine.ts`, `src/lib/runtime/execute-turn.ts`, `catalog/models.json`, `src/components/localbot/shell.tsx`, `src/components/localbot/sidebar.tsx`.

You already built a browser app with local GGUF chat and real folders. This pass wraps that app in a **desktop window** that feels like Grok Bot: dark, quiet, one conversation, cute agent mascots.

This is ONE pass. Do not implement the rest of the backlog in this prompt.

## In scope

1. Electron desktop window (double-click in dev via `npm run desktop`).
2. Grok Bot–like chrome: no URL bar, no browser tabs, frameless-ish dark window.
3. A mascot + color per agent in the sidebar and chat header.
4. llama.cpp binaries for **macOS (arm64 + x64), Windows x64, and Linux x64**. Pick the right tarball for `process.platform` / `process.arch`. Stop assuming Ubuntu-only `llama-b10749-bin-ubuntu-x64`.
5. On a 16 GB-class machine, Recommended (Qwen 2.5 3B) must be offered by the existing fit math. Do not hardcode 0.5B as the only model. 0.5B stays Small for 4 GB machines.
6. Keep default chat local. Hosted demo switch stays **off**. Do not make grok-4.5 the default again.

## Out of scope (do not touch)

- Signed `.dmg` / `.exe` / `.deb` store listings and Apple notarization
- NAS protocol / P2P sync
- DeepSeek Harness
- OpenMausBot rewrite
- Streaming tokens
- Arabic / RTL
- Wiring Ollama as the engine
- Removing the hosted-demo file (leave the switch off)

If you can emit an unsigned `electron-builder` directory for the current OS, do it. If signing is impossible here, `npm run desktop` that opens the window is the acceptance bar. Document that a signed installer is not this pass.

## Design (Grok Bot, not Slack)

- Dark background near `#0a0b0d`. Little chrome. No channel list. No workspace switcher.
- Left rail: agents only. Each row = mascot avatar + name + one-line job. Unread dot. New agent button at the bottom.
- Center: that agent’s thread. Composer at the bottom. Permission cards stay.
- Computer pane is a slide-over / right drawer, not a second IDE.
- Chat header: mascot, name, job, **Local {model}** badge, Stop.
- Window title: `LocalBot` or the active agent name. No `localhost:8080`.

### Mascots

Add a small local mascot set under `src/components/localbot/mascots/`.

Default three:

- Writer — teal, paper / pen creature
- Researcher — amber, magnifier creature
- Ops — slate, crate / gear creature

New agents pick a mascot + color. Store `bot.mascotId` next to `bot.color`. Simple SVG or PNG, friendly, not a photo of a person, not a Grok/xAI logo.

Do not spend the pass generating twenty characters.

## Desktop shell

- Add Electron. Main process owns the window and the llama.cpp child.
- Renderer is the existing TanStack UI (load the Vite dev URL in `desktop`, the built UI in production).
- `npm run desktop` starts the UI and opens the Electron window.
- Hide menu bar except a minimal LocalBot / Settings / Quit.
- Company files default to `{documents}/LocalBot/{CompanyName}` when running in Electron. Preview/web may keep `{cwd}/data/LocalBot/{CompanyName}`.
- Models dir: `{appData}/LocalBot/models/` in Electron, existing data dir in web preview.
- llama.cpp bin dir: `{appData}/LocalBot/bin/{platform-arch}/`.

## llama.cpp per OS

Replace the Ubuntu-only fetch.

On first chat / first download, `ensureLocalServer` must:

1. Detect `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`.
2. Download the official llama.cpp release tarball/zip for that target if missing.
3. Bind `127.0.0.1:18789` only.
4. Load the active GGUF from the models dir.

If this preview is Linux, still **commit the resolver** for Mac/Windows. Add a unit test that maps platform → asset name. Do not claim Windows works if you only shipped the Linux URL.

## Fit / catalog

Keep `catalog/models.json`. Server hardware scan already exists.

- 4 GB class → Small 0.5B only
- 8 GB → 0.5B + 1.5B
- 16 GB → Recommended 3B enabled
- 24 GB+ → 7B offered

Do not force-enable Large on a small machine. Do not hide 3B on a machine that has the RAM.

## Copy

README first-run becomes:

```
npm install
npm run desktop
```

Also keep `npm run dev` for the browser preview.

Say: this pass is an Electron window, not a signed store installer.

Update the top of `LOCALBOT_HANDOFF.md` with:

```
## Update after desktop pass
{date}
- Electron window: yes/no
- npm run desktop: the command that works
- llama.cpp targets implemented: {list}
- mascots: Writer / Researcher / Ops
- signed dmg/exe: NOT BUILT
```

## Tests

- Platform → llama asset map covers darwin-arm64, darwin-x64, win32-x64, linux-x64.
- `executeTurn` default path still does not require `XAI_API_KEY`.
- Existing disk grant tests still pass.
- A bot created with template Writer has `mascotId` set.

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

## Done when

1. `npm run desktop` opens a LocalBot window with no URL bar.
2. Sidebar agents show mascots.
3. Default chat is still the local GGUF. Header is not `Hosted grok-4.5`.
4. Code can fetch a llama.cpp binary for Mac and Windows, not only Linux.
5. On hardware that reports ≥16 GB RAM, the 3B card is enabled.
6. Handoff and README match the code.

Stop there. Do not start NAS, DeepSeek Harness, Arabic, or store signing.
