import catalogFile from "../../catalog/models.json" with { type: "json" };
import type { CatalogModel, HardwareReport, ModelFit, ModelTier } from "./types.ts";

export const CATALOG_PIN: string = catalogFile.pin;

export const CATALOG: CatalogModel[] = (catalogFile.models as CatalogModel[]).filter(
  (m) => !m.gated,
);

export function hubUrl(model: CatalogModel): string {
  return `https://huggingface.co/${model.repo}/resolve/main/${model.filename}`;
}

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id);
}

/**
 * requiredMemory ≈ modelFileGB + 1.0GB process headroom + 0.5GB per 8k context.
 * 1.0 GB headroom is enough for a 4 GB class machine to load Small (0.5B Q4).
 */
export function requiredMemoryGb(model: CatalogModel): number {
  const fileGb = model.sizeBytes / 1024 ** 3;
  const osHeadroom = 1.0;
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
    candidates.sort(
      (a, b) => (fits[a.id]?.requiredGb ?? 99) - (fits[b.id]?.requiredGb ?? 99),
    );
    return candidates[0] ?? null;
  };

  const small = pickBest("small");
  let recommended = pickBest("recommended");
  if (!recommended) recommended = pickBest("small");
  const large = pickBest("large");

  if (recommended) {
    const f = fits[recommended.id];
    if (f) f.recommended = true;
  }

  return { small, recommended, large, fits };
}

/** Cards always show a model per tier. Grey-out is `fits[id].fits`, never force-enabled. */
export function onboardingCards(hardware: HardwareReport) {
  const rec = recommendModels(hardware);
  const byTier = (tier: ModelTier) => {
    const listed = CATALOG.filter((m) => m.tier === tier);
    listed.sort((a, b) => a.sizeBytes - b.sizeBytes);
    return listed[0] ?? null;
  };
  return {
    small: byTier("small"),
    recommended: byTier("recommended"),
    large: byTier("large"),
    fits: rec.fits,
  };
}
