var models_default = {
	pin: "2026.09-localbot-2",
	updated: "2026-09-01",
	notes: "Verified ungated Hugging Face GGUFs. Gemma 4 E2B and Qwen 3.5 rows 404 or gated — replaced with Qwen 2.5 Instruct Q4_K_M. Small 0.5B is the downloadable default for 4 GB machines.",
	models: [
		{
			"id": "qwen25-05b-q4",
			"tier": "small",
			"name": "Qwen 2.5 0.5B Instruct Q4",
			"family": "Qwen 2.5",
			"repo": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
			"filename": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
			"sizeBytes": 491400032,
			"sizeLabel": "469 MB",
			"license": "Apache-2.0",
			"gated": false,
			"downloadable": true,
			"minRamGb": 4,
			"contextK": 4,
			"paramsLabel": "0.5B",
			"notes": "Smallest ungated Q4 instruct GGUF that fits a 4 GB class machine. Tool calling is limited.",
			"sha256": "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db"
		},
		{
			"id": "qwen25-15b-q4",
			"tier": "small",
			"name": "Qwen 2.5 1.5B Instruct Q4",
			"family": "Qwen 2.5",
			"repo": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
			"filename": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
			"sizeBytes": 1117320736,
			"sizeLabel": "1.0 GB",
			"license": "Apache-2.0",
			"gated": false,
			"downloadable": true,
			"minRamGb": 8,
			"contextK": 8,
			"paramsLabel": "1.5B",
			"notes": "Preferred Small when RAM allows. Better tool calling than 0.5B.",
			"sha256": ""
		},
		{
			"id": "qwen25-3b-q4",
			"tier": "recommended",
			"name": "Qwen 2.5 3B Instruct Q4",
			"family": "Qwen 2.5",
			"repo": "Qwen/Qwen2.5-3B-Instruct-GGUF",
			"filename": "qwen2.5-3b-instruct-q4_k_m.gguf",
			"sizeBytes": 2104932768,
			"sizeLabel": "2.0 GB",
			"license": "Apache-2.0",
			"gated": false,
			"downloadable": true,
			"minRamGb": 16,
			"contextK": 8,
			"paramsLabel": "3B",
			"notes": "Recommended when the machine has ~16 GB RAM.",
			"sha256": ""
		},
		{
			"id": "qwen25-7b-q4",
			"tier": "large",
			"name": "Qwen 2.5 7B Instruct Q4",
			"family": "Qwen 2.5",
			"repo": "bartowski/Qwen2.5-7B-Instruct-GGUF",
			"filename": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
			"sizeBytes": 4683074240,
			"sizeLabel": "4.4 GB",
			"license": "Apache-2.0",
			"gated": false,
			"downloadable": true,
			"minRamGb": 24,
			"contextK": 8,
			"paramsLabel": "7B",
			"notes": "Large card. Official Qwen 7B Q4_K_M is split; this is the single-file bartowski build.",
			"sha256": ""
		}
	]
};
//#endregion
//#region src/lib/catalog.ts
var CATALOG_PIN = models_default.pin;
var CATALOG = models_default.models.filter((m) => !m.gated);
function hubUrl(model) {
	return `https://huggingface.co/${model.repo}/resolve/main/${model.filename}`;
}
function getCatalogModel(id) {
	return CATALOG.find((m) => m.id === id);
}
/**
* requiredMemory ≈ modelFileGB + 1.0GB process headroom + 0.5GB per 8k context.
* 1.0 GB headroom is enough for a 4 GB class machine to load Small (0.5B Q4).
*/
function requiredMemoryGb(model) {
	const fileGb = model.sizeBytes / 1024 ** 3;
	const osHeadroom = 1;
	const contextHeadroom = .5 * (model.contextK / 8);
	return fileGb + osHeadroom + contextHeadroom;
}
function fitModel(model, hardware) {
	const requiredGb = requiredMemoryGb(model);
	let availableGb = hardware.availableRamGb;
	if (hardware.vramGb && hardware.vramGb > 0 && !hardware.appleSilicon) availableGb = hardware.vramGb;
	if (hardware.appleSilicon) availableGb = hardware.availableRamGb;
	const ramClassGb = Math.round(hardware.totalRamGb);
	const classOk = ramClassGb + 1e-6 >= model.minRamGb;
	const fits = classOk && requiredGb <= availableGb + 1e-6;
	const reason = !classOk ? `Needs about ${model.minRamGb} GB RAM class. This machine reports ${ramClassGb} GB total.` : fits ? `Needs about ${requiredGb.toFixed(1)} GB. This machine has ${availableGb.toFixed(1)} GB available.` : `Needs about ${requiredGb.toFixed(1)} GB free memory. This machine has ${availableGb.toFixed(1)} GB available.`;
	return {
		modelId: model.id,
		requiredGb,
		availableGb,
		fits,
		reason,
		recommended: false
	};
}
function recommendModels(hardware) {
	const fits = {};
	for (const m of CATALOG) fits[m.id] = fitModel(m, hardware);
	const pickBest = (tier) => {
		const candidates = CATALOG.filter((m) => m.tier === tier && fits[m.id]?.fits);
		if (candidates.length === 0) return null;
		candidates.sort((a, b) => (fits[a.id]?.requiredGb ?? 99) - (fits[b.id]?.requiredGb ?? 99));
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
	return {
		small,
		recommended,
		large,
		fits
	};
}
/** Cards always show a model per tier. Grey-out is `fits[id].fits`, never force-enabled. */
function onboardingCards(hardware) {
	const rec = recommendModels(hardware);
	const byTier = (tier) => {
		const listed = CATALOG.filter((m) => m.tier === tier);
		listed.sort((a, b) => a.sizeBytes - b.sizeBytes);
		return listed[0] ?? null;
	};
	return {
		small: byTier("small"),
		recommended: byTier("recommended"),
		large: byTier("large"),
		fits: rec.fits
	};
}
//#endregion
export { onboardingCards as a, hubUrl as i, CATALOG_PIN as n, requiredMemoryGb as o, getCatalogModel as r, CATALOG as t };
