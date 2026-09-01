# Model catalog

Pinned file: `catalog/models.json`. Documentation for planned local GGUF models.

This build does **not** download those files and does **not** run them. Chat is hosted grok-4.5. The onboarding picker stores `selectedCatalogId` only.

When a later pass wires llama.cpp, add entries here and in `src/lib/catalog.ts`, then implement a real downloader. Do not list gated Hub repos.
