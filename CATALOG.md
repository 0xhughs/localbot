# Model catalog

Pinned file: `catalog/models.json` (pin `2026.09-localbot-2`). Loaded at runtime by `src/lib/catalog.ts` — one list.

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

Alternate Small (1.5B) and Recommended/Large (3B / 7B) HEAD as 200. They stay in the catalog and grey out when server RAM is too low.

On-disk path: `{cwd}/data/LocalBot/models/{filename}`.
