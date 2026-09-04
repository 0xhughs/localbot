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
| `qwen25-3b-q4` | `Qwen/Qwen2.5-3B-Instruct-GGUF` `qwen2.5-3b-instruct-q4_k_m.gguf` | 2104932768 | `626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d` | Hub `x-linked-etag` (LFS sha256); **UNVERIFIED** against a local download |
| `qwen25-7b-q4` | `bartowski/Qwen2.5-7B-Instruct-GGUF` `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4683074240 | `65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423` | Hub `x-linked-etag` (LFS sha256); **UNVERIFIED** against a local download |

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
