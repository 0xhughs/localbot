# Model catalog

Pinned file: `catalog/models.json`.

Do not list the whole Hub. Curate exact GGUF repos, filenames, sizes, licenses, and minimum RAM/VRAM. Reject gated models from the default catalog. Prefer Apache-2.0 or similarly permissive weights. Never block first run on a Hugging Face token.

## Adding a model

1. Confirm the GGUF is public (not gated).
2. Add an entry to `catalog/models.json` and the matching object in `src/lib/catalog.ts`:

```json
{
  "id": "family-size-quant",
  "tier": "small | recommended | large",
  "name": "Display name",
  "family": "Family",
  "repo": "org/repo-GGUF",
  "filename": "exact-file-Q4_K_M.gguf",
  "sizeBytes": 0,
  "sizeLabel": "3.0 GB",
  "license": "Apache-2.0",
  "gated": false,
  "minRamGb": 16,
  "contextK": 8,
  "paramsLabel": "4B",
  "notes": "Why it is in this tier",
  "sha256": "lowercase hex of the real file"
}
```

3. Bump `pin` (currently `2026.09-localbot-1`).
4. Run the hardware fit tests.

## Fit rule

```
requiredMemory ≈ modelFileGB + 2.5GB osHeadroom + 0.5GB per 8k context
```

If `requiredMemory > availableRAM`, do not recommend it. Grey the card and show why:

> Needs about 12 GB free memory. This machine has 7 GB available.

On Apple Silicon use unified memory. On NVIDIA use VRAM first; do not assume system RAM overflow unless the engine supports it.

## Default tiers

- **Small** — Gemma 4 E2B Q4 or Qwen 3.5 4B Q4. Target 8 GB RAM. Always offered if ≥ 8 GB RAM.
- **Recommended** — Gemma 4 E4B Q4 or Qwen 3.5 9B Q4. Target 16 GB.
- **Large** — Gemma 4 12B Q4 or Qwen 3.5 27B Q4, only when it will actually load with OS headroom.
