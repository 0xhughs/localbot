## Stage 1 — Clean foundation

Date: 2026-09-02
Branch: `cursor/stage-1-clean-foundation-dad0`

### Built

- **Package renamed** `app-builder-workspace` → `localbot` (`package.json`, `package-lock.json`). Version stays `0.1.0` (already real semver).
- **Green checks.** `npm run lint`, `npm run typecheck`, and `npm test` all exit 0.
  - Lint: fixed the one error (empty `catch {}` in `src/lib/app-data/client.server.ts`) and cleared every warning (unused imports/vars/directive + one dead export). eslint now reports **0 problems**.
  - Typecheck: added JSDoc `@param {string}` to `sidecarServerEntry` and `unpackAsarPath` in `desktop/packaged.mjs` (were implicit `any`, TS7006).
  - Tests: **248 pass, 0 fail** (195 `scripts/**/*.test.mjs` + 53 `src/lib/**` TS tests). Previously 10 failed.
- **Build output no longer committed.** Added `.output/` and `.vercel/` to `.gitignore` and untracked the **109** already-committed files (62 `.output/`, 47 `.vercel/`). `npm run build` still regenerates them.
- **Dead template code removed** (import-checked): `src/lib/multiplayer/` (`p2p.ts` + `index.ts`) — referenced only by skill docs, never imported by `src/`. Also removed the unused `isDesktopShell()` export and a write-only `loadedPath` variable in the local engine.
- **App behavior unchanged.** Dev server still serves the existing UI (HTTP 200), auth invariant still agrees (sign-in off), production build succeeds.

### Not built (deliberately deferred — these are later stages, not this one)

- **Hosted-demo removal.** `src/lib/runtime/hosted-turn.ts` and the `allowHostedDemo` branch in `execute-turn.ts` remain. Default chat is still local GGUF; hosted stays off behind the Settings switch, per `AGENTS.md` ("Hosted Grok stays off unless the Safety switch is on"). The plan wants it gone from the production product — left for a later stage because it conflicts with the standing "safety switch" behavior; flag me if you want it removed now.
- **auth / db / PWA template code.** `src/lib/auth/`, `src/lib/db.ts` + `migrations/`, and the `grok-pwa` plugin are **still imported by the running app** (`src/routes/__root.tsx` imports `AuthProvider`; `auth/server.ts` imports `db`; the PWA plugin is wired into `vite.config.ts`). They are NOT dead by import check, so removal is out of scope for a safe Stage 1.
- **Brand/OG/PWA authoring tooling** (`scripts/brand-check.mjs`, `scripts/browser-smoke.mjs`, the `og` skill) is template-only and never run by the app/build, but `browser-smoke` imports `brand-check`, so it stays this pass. Its two AGENTS.md-coupled tests were re-scoped to the `og` skill doc (LocalBot's `AGENTS.md` is product standing rules, not the template authoring loop).
- **Per-launch sidecar token + narrow preload/IPC bridge** (plan Stage 1 completion-gate item): NOT BUILT. `desktop/preload.mjs` still exposes only window controls.
- **Durable config off `localStorage`** (plan Stage 1 item, overlaps Stage 7): NOT BUILT. `src/lib/store.ts` still persists to `localStorage["localbot-state-v3"]`.

### Files changed

- `package.json`, `package-lock.json` — package name → `localbot`.
- `.gitignore` — ignore `.output/`, `.vercel/`.
- Untracked (deleted from index only): all `.output/**` and `.vercel/**` (109 files).
- Removed: `src/lib/multiplayer/p2p.ts`, `src/lib/multiplayer/index.ts`.
- `src/lib/app-data/client.server.ts` — comment in empty `catch` (lint error fix).
- `desktop/packaged.mjs` — JSDoc param types (typecheck fix).
- `src/components/localbot/avatar.tsx`, `src/lib/fs/vfs.ts`, `src/lib/localbot.test.ts` — drop unused imports.
- `src/lib/runtime/local-engine.ts` — remove dead `loadedPath` variable.
- `src/lib/auth/use-current-user.ts` — replace unused `eslint-disable` directive with a plain rationale comment.
- `src/components/localbot/desktop-titlebar.tsx` — remove unused `isDesktopShell()` export.
- `scripts/grok-pwa-plugin.test.mjs` — make 8 unit tests hermetic (pass explicit `site: {}` / isolated `cwd`) so they no longer read the repo's real `src/lib/og/site.json` and `public/og.jpg`.
- `scripts/brand-check.test.mjs` — scope 2 doc-invariant tests to the `og` skill doc (LocalBot's `AGENTS.md` intentionally lacks the template brand-asset loop).

### Prove it

Command:

```
npm run lint && npm run typecheck && npm test && \
  test "$(node -e "process.stdout.write(require('./package.json').name)")" = localbot && \
  test "$(git ls-files | grep -cE '^\.(output|vercel)/')" = 0 && \
  test "$(git ls-files | grep -c '^src/lib/multiplayer/')" = 0 && \
  echo STAGE1_PASS
```

Pass looks like: the command ends with

```
# tests 53
# pass 53
# fail 0
...
STAGE1_PASS
```

(and the `scripts/**` run just before it reports `# fail 0` as well). It exits non-zero — no `STAGE1_PASS` — if the package was not renamed, any check regresses, or build junk / `multiplayer` is still tracked.

Second command (optional) — confirm the app still runs:

```
npm run dev   # then, in another shell:
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/   # -> 200
```

### How I test in the app

1. `npm run dev`, open `http://localhost:8080/`.
2. Walk onboarding: welcome → hardware scan (real RAM/CPU/disk) → model picker (fit cards from `catalog/models.json`) → create an agent → land in chat.
3. Confirm the header shows `Local {model}` (never `Hosted grok-4.5`) and Settings → Safety still has **Allow hosted demo (breaks policy)** off by default.

### Ready for

Stage 2 (four folder scopes + native pickers + sidecar path resolution) only after you say GO.
