# Model catalog

Pinned file: `catalog/models.json` (pin `2026.09-localbot-3`). Loaded at runtime by `src/lib/catalog.ts` — one list. Every downloadable row carries a sha256 (Stage 6); `verifyGgufFile` refuses to activate a downloadable row without one.

Gemma 4 E2B / Qwen 3.5 Hub rows 404 or gated. This pass uses ungated **Qwen 2.5 Instruct Q4_K_M**.

## Downloadable Small

Exact URL used:

```
https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

- Size: 491400032 bytes (469 MB)
- SHA-256: `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`
- License: Apache-2.0, not gated
- Fits a 4 GB class machine. Tool calling works on this Q4 (verified `write_file`).

## Other downloadable rows

| id | file | bytes | sha256 | how it was checked |
|---|---|---|---|---|
| `qwen25-15b-q4` | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` `qwen2.5-1.5b-instruct-q4_k_m.gguf` | 1117320736 | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` | downloaded and hashed on 2026-09-04; equals the Hub LFS etag |
| `qwen25-3b-q4` | `Qwen/Qwen2.5-3B-Instruct-GGUF` `qwen2.5-3b-instruct-q4_k_m.gguf` | 2104932768 | `626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d` | downloaded and hashed on 2026-09-04 (Stage 10, darwin-arm64); confirmed by download, equals the Hub LFS etag |
| `qwen25-7b-q4` | `bartowski/Qwen2.5-7B-Instruct-GGUF` `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4683074240 | `65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423` | downloaded and hashed on 2026-09-04 (Stage 10, darwin-arm64); confirmed by download, equals the Hub LFS etag |

All HEAD as 200 / 302-to-CDN. They stay in the catalog and grey out when server RAM is too low. A download whose bytes do not hash to the pinned value is refused and never activated.

## llama.cpp runtimes

`catalog/llama-assets.json`, release **b10749**, one row per (target, runtime); every URL answered 200 on the release page on 2026-09-04:

| target | runtime | archive | GPU |
|---|---|---|---|
| `linux-x64` | `cpu` | `llama-b10749-bin-ubuntu-x64.tar.gz` | no |
| `linux-x64` | `vulkan` | `llama-b10749-bin-ubuntu-vulkan-x64.tar.gz` | yes |
| `win32-x64` | `cpu` | `llama-b10749-bin-win-cpu-x64.zip` | no |
| `win32-x64` | `cuda-12.4` | `llama-b10749-bin-win-cuda-12.4-x64.zip` + `cudart-llama-bin-win-cuda-12.4-x64.zip` | yes |
| `win32-x64` | `vulkan` | `llama-b10749-bin-win-vulkan-x64.zip` | yes |
| `darwin-arm64` | `metal` | `llama-b10749-bin-macos-arm64.tar.gz` | yes (Metal) |
| `darwin-x64` | `cpu` | `llama-b10749-bin-macos-x64.tar.gz` | no — GPU NOT BUILT (no asset) |

Runtimes unpack to `bin/{target}/{runtime}/`. Execution on a GPU host is UNVERIFIED in this repo.

On-disk path: `{cwd}/data/LocalBot/models/{filename}`.

## whisper.cpp (Stage 9 hold-to-talk STT)

`catalog/whisper-assets.json`, release **v1.9.2** (2026-08-04; v1.9.3 is a pre-release). Every sha256 below was computed from a real download on 2026-09-04 — nothing is etag-only:

| row | file | bytes | sha256 |
|---|---|---|---|
| `linux-x64` | `whisper-bin-ubuntu-x64.tar.gz` → `whisper-cli` | 9,497,583 | `46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1` |
| `win32-x64` | `whisper-bin-x64.zip` → `Release/whisper-cli.exe` | 8,194,445 | `49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a` (UNVERIFIED — never run here) |
| `darwin-arm64` (`kind: "built"`, Stage 10) | `whisper-cli` compiled from tag `v1.9.2` @ `306c88f4` by `npm run build:whisper-mac` | 3,275,928 | `fbd2a54cf4835af4ee45b26515a21fa97add9599601d0f6ca7acddfe2cd21f6e` (this host's build; static, Metal embedded) |
| model `base.en` (default) | `ggml-base.en.bin` | 147,964,211 | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
| model `tiny.en` (low RAM; pinned, not in the UI) | `ggml-tiny.en.bin` | 77,704,715 | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` |
| fixture | `samples/jfk.wav` @ v1.9.2 | 352,078 | `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e` |

No darwin *download*: v1.9.2 ships `whisper-v1.9.2-xcframework.zip`, a library, not a CLI, and no URL is invented. Stage 10 adds `darwin-arm64` as `kind: "built"`: `scripts/build-whisper-mac.mjs` clones the pinned tag, runs cmake with the flags recorded in the row (`BUILD_SHARED_LIBS=OFF`, `GGML_METAL=ON`, `GGML_METAL_EMBED_LIBRARY=ON`, no SDL2/server/tests), installs `whisper-cli` into `bin/darwin-arm64/whisper/` and writes `whisper-build.json` beside it (release, commit, cmake flags, sha256, host). `stt.ts` verifies a built row against that manifest (size + sha256 + release) instead of an archive; if the binary is missing, `sttStatus` says **NOT BUILT** with the build command. `darwin-x64` has no row — CPU-only Mac whisper is **NOT BUILT** (the same script would build it, untested). No GPU / cuBLAS / BLAS rows; `whisper-server` is in the archives but is deleted on unpack and never run. The runtime unpacks flat into `bin/{target}/whisper/` (its own folder — whisper and llama.cpp each ship a `libggml`); the model goes to `models/whisper/` and is gated by size + ggml magic (`lmgg`) + sha256, never by `verifyGgufFile`. The catalog feeds `src/lib/runtime/stt.ts`; `npm run prove:stt` downloads, verifies and transcribes the fixture.
