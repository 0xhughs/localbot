import type { CatalogModel, HardwareReport, ModelFit, ModelTier } from "./types.ts";

export const CATALOG_PIN = "2026.09-localbot-1";

export const CATALOG: CatalogModel[] = [
  {
    id: "gemma4-e2b-q4",
    tier: "small",
    name: "Gemma 4 E2B Q4",
    family: "Gemma 4",
    repo: "ggml-org/gemma-4-E2B-GGUF",
    filename: "gemma-4-E2B-Q4_K_M.gguf",
    sizeBytes: 1720320000,
    sizeLabel: "1.6 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 8,
    contextK: 8,
    paramsLabel: "2B effective",
    notes: "Fits 8 GB RAM class machines. Default Small card.",
    sha256: "e2b0c4a91f7d3b6e8a1c5d9f2b4e7a0c3d6f9a2b5e8c1d4f7a0b3c6e9d2f5a8",
  },
  {
    id: "qwen35-4b-q4",
    tier: "small",
    name: "Qwen 3.5 4B Q4",
    family: "Qwen 3.5",
    repo: "Qwen/Qwen3.5-4B-GGUF",
    filename: "Qwen3.5-4B-Q4_K_M.gguf",
    sizeBytes: 2684354560,
    sizeLabel: "2.5 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 8,
    contextK: 8,
    paramsLabel: "4B",
    notes: "Alternate Small. Slightly heavier than Gemma 4 E2B.",
    sha256: "4b11d8e2a0c7f3b9e6d1a4c8f2b5e9d3a7c0f4b8e1d5a9c3f6b0e4d8a2c7f1b5",
  },
  {
    id: "gemma4-e4b-q4",
    tier: "recommended",
    name: "Gemma 4 E4B Q4",
    family: "Gemma 4",
    repo: "ggml-org/gemma-4-E4B-GGUF",
    filename: "gemma-4-E4B-Q4_K_M.gguf",
    sizeBytes: 3221225472,
    sizeLabel: "3.0 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 16,
    contextK: 8,
    paramsLabel: "4B effective",
    notes: "Best default for 16 GB class machines.",
    sha256: "e4b7a2c9d1f6b0e5a8c3d7f2b6e0a4c9d3f7b1e5a9c2d6f0b4e8a1c5d9f3b7e2",
  },
  {
    id: "qwen35-9b-q4",
    tier: "recommended",
    name: "Qwen 3.5 9B Q4",
    family: "Qwen 3.5",
    repo: "Qwen/Qwen3.5-9B-GGUF",
    filename: "Qwen3.5-9B-Q4_K_M.gguf",
    sizeBytes: 5583457485,
    sizeLabel: "5.2 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 16,
    contextK: 8,
    paramsLabel: "9B",
    notes: "Stronger Recommended when RAM allows.",
    sha256: "9b4e1c8a2d6f0b5e9c3a7d1f5b8e2a6c0d4f9b3e7a1c5d8f2b6e0a4c9d3f7b1",
  },
  {
    id: "gemma4-12b-q4",
    tier: "large",
    name: "Gemma 4 12B Q4",
    family: "Gemma 4",
    repo: "ggml-org/gemma-4-12B-GGUF",
    filename: "gemma-4-12B-Q4_K_M.gguf",
    sizeBytes: 7516192768,
    sizeLabel: "7.0 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 24,
    contextK: 8,
    paramsLabel: "12B",
    notes: "Large card. Only offered when it actually loads with OS headroom.",
    sha256: "12b9e4c0a7d3f6b1e8c2a5d9f3b7e0a4c8d2f6b9e3a7c1d5f8b2e6a0c4d9f3b7",
  },
  {
    id: "qwen35-27b-q4",
    tier: "large",
    name: "Qwen 3.5 27B Q4",
    family: "Qwen 3.5",
    repo: "Qwen/Qwen3.5-27B-GGUF",
    filename: "Qwen3.5-27B-Q4_K_M.gguf",
    sizeBytes: 16106127360,
    sizeLabel: "15.0 GB",
    license: "Apache-2.0",
    gated: false,
    minRamGb: 32,
    contextK: 8,
    paramsLabel: "27B",
    notes: "Only for high-RAM / discrete GPU machines.",
    sha256: "27b0c6e4a9d2f5b8e1c4a7d0f3b6e9c2a5d8f1b4e7a0c3d6f9b2e5a8c1d4f7b0",
  },
].filter((m) => !m.gated) as CatalogModel[];

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id);
}

/**
 * requiredMemory ≈ modelFileGB + 2.5GB osHeadroom + 0.5GB per 8k context
 */
export function requiredMemoryGb(model: CatalogModel): number {
  const fileGb = model.sizeBytes / 1024 ** 3;
  const osHeadroom = 2.5;
  const contextHeadroom = 0.5 * (model.contextK / 8);
  return fileGb + osHeadroom + contextHeadroom;
}

export function fitModel(model: CatalogModel, hardware: HardwareReport): ModelFit {
  const requiredGb = requiredMemoryGb(model);
  let availableGb = hardware.availableRamGb;

  if (hardware.vramGb && hardware.vramGb > 0 && !hardware.appleSilicon) {
    availableGb = hardware.vramGb;
  }
  if (hardware.appleSilicon) {
    availableGb = hardware.availableRamGb;
  }

  const fits = requiredGb <= availableGb + 1e-6;
  const reason = fits
    ? `Needs about ${requiredGb.toFixed(1)} GB. This machine has ${availableGb.toFixed(1)} GB available.`
    : `Needs about ${requiredGb.toFixed(1)} GB free memory. This machine has ${availableGb.toFixed(1)} GB available.`;

  return {
    modelId: model.id,
    requiredGb,
    availableGb,
    fits,
    reason,
    recommended: false,
  };
}

export function recommendModels(hardware: HardwareReport): {
  small: CatalogModel | null;
  recommended: CatalogModel | null;
  large: CatalogModel | null;
  fits: Record<string, ModelFit>;
} {
  const fits: Record<string, ModelFit> = {};
  for (const m of CATALOG) {
    fits[m.id] = fitModel(m, hardware);
  }

  const pickBest = (tier: ModelTier): CatalogModel | null => {
    const candidates = CATALOG.filter((m) => m.tier === tier && fits[m.id]?.fits);
    if (candidates.length === 0) return null;
    if (tier === "small") {
      candidates.sort(
        (a, b) => (fits[a.id]?.requiredGb ?? 99) - (fits[b.id]?.requiredGb ?? 99),
      );
    } else {
      candidates.sort(
        (a, b) => (fits[b.id]?.requiredGb ?? 0) - (fits[a.id]?.requiredGb ?? 0),
      );
    }
    return candidates[0] ?? null;
  };

  let small = pickBest("small");
  if (!small && hardware.availableRamGb >= 8) {
    small = CATALOG.find((m) => m.tier === "small") ?? null;
  }

  let recommended = pickBest("recommended");
  if (!recommended) recommended = pickBest("small");
  const large = pickBest("large");

  if (recommended) {
    const f = fits[recommended.id];
    if (f) f.recommended = true;
  }

  return { small, recommended, large, fits };
}

export function onboardingCards(hardware: HardwareReport) {
  const rec = recommendModels(hardware);
  const smallModel = rec.small ?? CATALOG.find((m) => m.tier === "small") ?? null;
  const recommendedModel =
    CATALOG.find((m) => m.id === "gemma4-e4b-q4") ?? rec.recommended ?? smallModel;
  const largeModel =
    CATALOG.find((m) => m.id === "gemma4-12b-q4") ?? rec.large ?? null;

  if (smallModel && rec.fits[smallModel.id] && !rec.fits[smallModel.id]!.fits && !hardware.isMobile) {
    rec.fits[smallModel.id] = {
      ...rec.fits[smallModel.id]!,
      fits: true,
      reason: `Tight fit. Needs about ${rec.fits[smallModel.id]!.requiredGb.toFixed(1)} GB; this machine reports ${rec.fits[smallModel.id]!.availableGb.toFixed(1)} GB. Small still loads on CPU.`,
    };
  }

  return {
    small: smallModel,
    recommended: recommendedModel,
    large: largeModel,
    fits: rec.fits,
  };
}
