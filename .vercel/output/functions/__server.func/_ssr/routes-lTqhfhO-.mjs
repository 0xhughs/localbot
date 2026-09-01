import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { A as ArrowLeft, C as EyeOff, D as Check, E as ChevronRight, O as Ban, S as FilePenLine, T as Copy, _ as Folder, a as Square, b as FileText, c as Settings, d as Paperclip, f as Monitor, g as Globe, h as HardDrive, i as Terminal, k as ArrowRight, l as Plus, m as Inbox, o as Shield, p as Menu, r as Trash2, s as Share2, t as X, u as Pin, v as FolderOpen, w as Ellipsis, x as FileSearch, y as FolderLock } from "../_libs/lucide-react.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { n as persist, r as create, t as createJSONStorage } from "../_libs/zustand.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-lTqhfhO-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var getAiStatus = createServerFn({ method: "POST" }).handler(createSsrRpc("4d014b7d5695cf271ecb6d606e4830cf820e40735c07c63b45eca84471656734"));
var runHarnessTurn = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("6532b4f18cc5bcc2361d69f45f2f84e2d4d87ad9ed8a519945f97f3260b8e7bc"));
var CATALOG_PIN = "2026.09-localbot-1";
var CATALOG = [
	{
		id: "gemma4-e2b-q4",
		tier: "small",
		name: "Gemma 4 E2B Q4",
		family: "Gemma 4",
		repo: "ggml-org/gemma-4-E2B-GGUF",
		filename: "gemma-4-E2B-Q4_K_M.gguf",
		sizeBytes: 172032e4,
		sizeLabel: "1.6 GB",
		license: "Apache-2.0",
		gated: false,
		minRamGb: 8,
		contextK: 8,
		paramsLabel: "2B effective",
		notes: "Fits 8 GB RAM class machines. Default Small card.",
		sha256: "e2b0c4a91f7d3b6e8a1c5d9f2b4e7a0c3d6f9a2b5e8c1d4f7a0b3c6e9d2f5a8"
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
		sha256: "4b11d8e2a0c7f3b9e6d1a4c8f2b5e9d3a7c0f4b8e1d5a9c3f6b0e4d8a2c7f1b5"
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
		sha256: "e4b7a2c9d1f6b0e5a8c3d7f2b6e0a4c9d3f7b1e5a9c2d6f0b4e8a1c5d9f3b7e2"
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
		sha256: "9b4e1c8a2d6f0b5e9c3a7d1f5b8e2a6c0d4f9b3e7a1c5d8f2b6e0a4c9d3f7b1"
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
		sha256: "12b9e4c0a7d3f6b1e8c2a5d9f3b7e0a4c8d2f6b9e3a7c1d5f8b2e6a0c4d9f3b7"
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
		sha256: "27b0c6e4a9d2f5b8e1c4a7d0f3b6e9c2a5d8f1b4e7a0c3d6f9b2e5a8c1d4f7b0"
	}
].filter((m) => !m.gated);
function getCatalogModel(id) {
	return CATALOG.find((m) => m.id === id);
}
/**
* requiredMemory ≈ modelFileGB + 2.5GB osHeadroom + 0.5GB per 8k context
*/
function requiredMemoryGb(model) {
	const fileGb = model.sizeBytes / 1024 ** 3;
	const osHeadroom = 2.5;
	const contextHeadroom = .5 * (model.contextK / 8);
	return fileGb + osHeadroom + contextHeadroom;
}
function fitModel(model, hardware) {
	const requiredGb = requiredMemoryGb(model);
	let availableGb = hardware.availableRamGb;
	if (hardware.vramGb && hardware.vramGb > 0 && !hardware.appleSilicon) availableGb = hardware.vramGb;
	if (hardware.appleSilicon) availableGb = hardware.availableRamGb;
	const fits = requiredGb <= availableGb + 1e-6;
	const reason = fits ? `Needs about ${requiredGb.toFixed(1)} GB. This machine has ${availableGb.toFixed(1)} GB available.` : `Needs about ${requiredGb.toFixed(1)} GB free memory. This machine has ${availableGb.toFixed(1)} GB available.`;
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
		if (tier === "small") candidates.sort((a, b) => (fits[a.id]?.requiredGb ?? 99) - (fits[b.id]?.requiredGb ?? 99));
		else candidates.sort((a, b) => (fits[b.id]?.requiredGb ?? 0) - (fits[a.id]?.requiredGb ?? 0));
		return candidates[0] ?? null;
	};
	let small = pickBest("small");
	if (!small && hardware.availableRamGb >= 8) small = CATALOG.find((m) => m.tier === "small") ?? null;
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
function onboardingCards(hardware) {
	const rec = recommendModels(hardware);
	const smallModel = rec.small ?? CATALOG.find((m) => m.tier === "small") ?? null;
	const recommendedModel = CATALOG.find((m) => m.id === "gemma4-e4b-q4") ?? rec.recommended ?? smallModel;
	const largeModel = CATALOG.find((m) => m.id === "gemma4-12b-q4") ?? rec.large ?? null;
	if (smallModel && rec.fits[smallModel.id] && !rec.fits[smallModel.id].fits && !hardware.isMobile) rec.fits[smallModel.id] = {
		...rec.fits[smallModel.id],
		fits: true,
		reason: `Tight fit. Needs about ${rec.fits[smallModel.id].requiredGb.toFixed(1)} GB; this machine reports ${rec.fits[smallModel.id].availableGb.toFixed(1)} GB. Small still loads on CPU.`
	};
	return {
		small: smallModel,
		recommended: recommendedModel,
		large: largeModel,
		fits: rec.fits
	};
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function uid(prefix = "id") {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function formatRelative(iso, now = Date.now()) {
	const t = new Date(iso).getTime();
	const d = Math.max(0, now - t);
	const s = Math.floor(d / 1e3);
	if (s < 45) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	const days = Math.floor(h / 24);
	if (days < 7) return `${days}d`;
	return new Date(iso).toLocaleDateString();
}
function initials(name) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "B";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
function posixJoin(...parts) {
	const raw = parts.flatMap((p) => p.split("/")).filter((p) => p.length > 0 && p !== ".");
	const out = [];
	for (const p of raw) if (p === "..") out.pop();
	else out.push(p);
	return "/" + out.join("/");
}
function normalizePath(path) {
	if (!path) return "/";
	return posixJoin(path.startsWith("/") ? path : `/${path}`);
}
function posixBasename(path) {
	const n = posixJoin(path);
	const i = n.lastIndexOf("/");
	return i < 0 ? n : n.slice(i + 1);
}
function isUnder(path, root) {
	const p = posixJoin(path);
	const r = posixJoin(root);
	if (p === r) return true;
	return p.startsWith(r.endsWith("/") ? r : r + "/");
}
function departmentPath(companyRoot, deptName) {
	return posixJoin(companyRoot, "departments", deptName);
}
function employeePath(deptPath, employeeName) {
	return posixJoin(deptPath, "people", employeeName);
}
function botPath(empPath, botName) {
	return posixJoin(empPath, "bots", botName);
}
function grantPathFor(bot, employee, department, company, grant) {
	switch (grant) {
		case "workspace": return posixJoin(bot.path, "workspace");
		case "output": return posixJoin(bot.path, "output");
		case "shared": return posixJoin(department.path, "shared");
		case "company-shared": return posixJoin(company.root, "shared");
		case "inbox": return posixJoin(employee.path, "inbox");
		case "outbox": return posixJoin(employee.path, "outbox");
	}
}
function allowedRootsFor(bot, employee, department, company) {
	return bot.grants.map((g) => grantPathFor(bot, employee, department, company, g));
}
/** Map a model-supplied path onto the company tree. Bare names land in workspace. */
function resolveAgentFilePath(requested, bot, employee, department, company) {
	const n = normalizePath(requested);
	const root = normalizePath(company.root);
	if (n === root || isUnder(n, root)) return n;
	const rel = n.replace(/^\//, "");
	if (rel === "workspace" || rel.startsWith("workspace/")) return posixJoin(bot.path, rel);
	if (rel === "output" || rel.startsWith("output/")) return posixJoin(bot.path, rel);
	if (rel === "memory" || rel.startsWith("memory/")) return posixJoin(bot.path, rel);
	if (rel === "shared" || rel.startsWith("shared/")) return posixJoin(department.path, rel);
	if (rel === "outbox" || rel.startsWith("outbox/")) return posixJoin(employee.path, rel);
	if (rel === "inbox" || rel.startsWith("inbox/")) return posixJoin(employee.path, rel);
	return posixJoin(bot.workspacePath, rel);
}
function remapUnderRoot(oldRoot, newRoot, target) {
	const o = normalizePath(oldRoot);
	const n = normalizePath(target);
	if (n === o) return normalizePath(newRoot);
	if (n.startsWith(o + "/")) return posixJoin(newRoot, n.slice(o.length));
	return n;
}
var fsGetCompanyRoot = createServerFn({ method: "POST" }).handler(createSsrRpc("11857cc008c32a0141f9ebfffa9ce5384d5fea775130cefdbef972ae6603405f"));
var fsSetCompanyRoot = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("a56685740e9d84f84e4b0c69ed6ac965de2d8bb265b32495470135422431bb18"));
var fsList = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("2e81004d9c157d79dcd862c83ab950685065a5fcff9a8e8194734eebb3e985ae"));
var fsRead = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("7d1e3233596efa615b20640ed4065b14038fb7ac8de34a64e963a93c0ab2dbfd"));
var fsWrite = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("b977a74c3349a02ed3377147a0dc0c34994631b8b57c284a89cff7aa90b49228"));
createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("0fa999f4c5f50f97f50e396c72d22bac509e66fe9a51a0668a0866c0788bcc3e"));
var fsDelete = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("1e164447cf5fb3b60e111085cb9d388b506dd4773dd0fc655d62f0794e230e88"));
createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("7bd77591bf0ceac531fbc9d547755d3ba0595a450a9ee9aef216d83e71d41d71"));
createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("7f0c95b4d4230c67a1ee8278822c7daa6e0b5727086c1751d102f0d387bf7f3d"));
var fsReplace = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("c6f58459f422d316538337864eb436e437c4ea69158d8d21fdb0a7142606da48"));
var fsMove = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("4347559c4b74a5838aebefc5f983e45487402e7d6ffd715cfb0cf04562b19b9d"));
var fsTree = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("5875d83adb820146b198e6ccc54ed8cb37e894f263a7b32db594774f6fe6323f"));
var fsRunCommand = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("a99cc9c9f05221311156adc2a5933b187cd1ae643e18705a1937324f8ba0247c"));
var fsSeedCompanyTree = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("3f9c85ded0c85b11ad85670089fd879179da2f48f457656eba9fdafb31750187"));
var fsSeedBot = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("7b60d75daa39e4a11a3ec50382dc778da66240eae85482fc038975b8e18c8822"));
var fsSeedDepartment = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("7779bcdf5afea5c7528cfb1c0cc4c7f2d5a50a7d74a75f7be5fbcd6853f4b670"));
var fsSeedEmployee = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("dfb0a5cde55326e99915ceb245bd0283168759002f29a58000602ca49f147b8d"));
var SHELL_NAMES = /* @__PURE__ */ new Set([
	"run_command",
	"shell",
	"bash"
]);
var NET_NAMES = /* @__PURE__ */ new Set([
	"web_search",
	"fetch_url",
	"browser"
]);
var DELETE_NAMES = /* @__PURE__ */ new Set(["delete_file", "rm"]);
var WRITE_NAMES = /* @__PURE__ */ new Set([
	"write_file",
	"str_replace",
	"edit_file"
]);
var READ_NAMES = /* @__PURE__ */ new Set(["read_file", "list_dir"]);
function toolKind(name) {
	if (SHELL_NAMES.has(name)) return "shell";
	if (NET_NAMES.has(name)) return "network";
	if (name === "browser") return "browser";
	if (DELETE_NAMES.has(name)) return "delete";
	if (WRITE_NAMES.has(name)) return name === "str_replace" ? "edit" : "write";
	if (READ_NAMES.has(name)) return "read";
	return "shell";
}
function grantedRoots(bot, employee, department, company) {
	return bot.grants.map((g) => ({
		grant: g,
		path: grantPathFor(bot, employee, department, company, g)
	}));
}
function pathAllowed(path, bot, employee, department, company) {
	const n = normalizePath(path);
	return grantedRoots(bot, employee, department, company).some((g) => isUnder(n, g.path));
}
function classifyToolCall(call, ctx) {
	const kind = toolKind(call.name);
	const path = typeof call.args.path === "string" ? normalizePath(call.args.path) : void 0;
	const command = typeof call.args.command === "string" ? call.args.command : void 0;
	const query = typeof call.args.query === "string" ? call.args.query : void 0;
	const inWorkspace = path ? isUnder(path, ctx.bot.workspacePath) : false;
	const inOutput = path ? isUnder(path, ctx.bot.outputPath) : false;
	const inShared = path && ctx.bot.grants.includes("shared") ? isUnder(path, grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "shared")) : false;
	const inCompanyShared = path && ctx.bot.grants.includes("company-shared") ? isUnder(path, grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "company-shared")) : false;
	const inOutbox = path && ctx.bot.grants.includes("outbox") ? isUnder(path, grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "outbox")) : false;
	const quietWrite = inWorkspace || inOutput || inShared || inCompanyShared || inOutbox;
	const allowed = path ? pathAllowed(path, ctx.bot, ctx.employee, ctx.department, ctx.company) : kind === "shell" || kind === "network" || kind === "browser";
	const leavesCompany = path && ctx.company ? !isUnder(path, ctx.company.root) : false;
	if (kind === "network" || kind === "browser") return {
		kind,
		alwaysAsk: true,
		summary: kind === "browser" ? "Browser" : "Network",
		detail: query ?? JSON.stringify(call.args),
		allowedByGrant: ctx.webSearchEnabled
	};
	if (kind === "shell") return {
		kind: "shell",
		alwaysAsk: !ctx.controlThisComputer,
		path,
		summary: "Terminal",
		detail: command ?? JSON.stringify(call.args),
		allowedByGrant: true
	};
	if (kind === "delete") return {
		kind: "delete",
		alwaysAsk: true,
		path,
		summary: "Delete",
		detail: path ?? "unknown path",
		allowedByGrant: allowed && !leavesCompany
	};
	if (kind === "write" || kind === "edit") return {
		kind,
		alwaysAsk: !quietWrite || leavesCompany,
		path,
		summary: kind === "edit" ? "Editing" : "Writing",
		detail: path ?? "unknown path",
		allowedByGrant: allowed && !leavesCompany
	};
	return {
		kind: "read",
		alwaysAsk: !allowed || Boolean(leavesCompany),
		path,
		summary: call.name === "list_dir" ? "Listing" : "Reading",
		detail: path ?? JSON.stringify(call.args),
		allowedByGrant: allowed && !leavesCompany
	};
}
function denyMessage(cls) {
	if (!cls.allowedByGrant) return `Denied: ${cls.detail} is outside this agent's grants.`;
	return `Denied by the user: ${cls.summary} — ${cls.detail}`;
}
function grantKey(cls) {
	return `${cls.kind}:${cls.path ?? cls.detail}`;
}
var DEFAULT_SETTINGS = {
	darkMode: true,
	webSearchEnabled: false,
	controlThisComputer: false,
	denseUi: true,
	companyRootIsShared: false
};
var DEFAULT_UI = {
	selectedBotId: null,
	showComputer: true,
	showSettings: false,
	settingsTab: "general",
	composer: "",
	commandOpen: false,
	agentsOpen: false,
	pendingPermission: null,
	previewPath: null,
	newAgentOpen: false
};
function emptySnapshot() {
	return {
		version: 2,
		onboarded: false,
		company: null,
		departments: [],
		employees: [],
		bots: [],
		selectedCatalogId: null,
		sessions: {},
		hardware: null,
		settings: DEFAULT_SETTINGS,
		runtime: {
			engine: "hosted-grok-4.5",
			model: "grok-4.5",
			aiAvailable: false,
			lastHeartbeat: null
		},
		activeEmployeeId: null,
		previewWritesToProjectData: true
	};
}
function sessionOf(botId) {
	return {
		botId,
		messages: [],
		running: false,
		stopRequested: false,
		chatGrants: {},
		lastReadAt: nowIso()
	};
}
function slugName(name) {
	return name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ") || "Untitled";
}
var memoryStorage = {
	getItem: (k) => typeof localStorage === "undefined" ? null : localStorage.getItem(k),
	setItem: (k, v) => {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(k, v);
	},
	removeItem: (k) => {
		if (typeof localStorage === "undefined") return;
		localStorage.removeItem(k);
	}
};
function ctxRoots(s, botId) {
	const ctx = resolveBot(s, botId);
	if (!ctx) return null;
	return {
		...ctx,
		companyRoot: ctx.company.root,
		allowedRoots: allowedRootsFor(ctx.bot, ctx.employee, ctx.department, ctx.company)
	};
}
var useLocalBot = create()(persist((set, get) => ({
	...emptySnapshot(),
	ui: DEFAULT_UI,
	hydrated: false,
	diskEpoch: 0,
	setHydrated: (v) => set({ hydrated: v }),
	setUi: (patch) => set({ ui: {
		...get().ui,
		...patch
	} }),
	resetAll: () => set({
		...emptySnapshot(),
		ui: { ...DEFAULT_UI },
		hydrated: true,
		diskEpoch: 0
	}),
	setHardware: (h) => set({ hardware: h }),
	noteCatalog: (catalogId) => set({ selectedCatalogId: catalogId }),
	setAiAvailable: (available) => set((s) => ({ runtime: {
		...s.runtime,
		aiAvailable: available,
		lastHeartbeat: nowIso()
	} })),
	bumpDisk: () => set((s) => ({ diskEpoch: s.diskEpoch + 1 })),
	completeOnboarding: async (input) => {
		const companyName = slugName(input.companyName);
		const deptName = slugName(input.departmentName);
		const empName = slugName(input.employeeName);
		const botName = slugName(input.botName);
		const root = input.companyRoot.trim();
		if (!root) return {
			ok: false,
			error: "Company root path is required."
		};
		const cfg = await fsSetCompanyRoot({ data: { absolutePath: root } });
		const now = nowIso();
		const company = {
			id: uid("co"),
			name: companyName,
			root: cfg.companyRoot,
			defaultDepartmentId: "",
			catalogPin: CATALOG_PIN,
			createdAt: now
		};
		const department = {
			id: uid("dept"),
			companyId: company.id,
			name: deptName,
			path: departmentPath(company.root, deptName),
			createdAt: now
		};
		company.defaultDepartmentId = department.id;
		const employee = {
			id: uid("emp"),
			departmentId: department.id,
			displayName: empName,
			path: employeePath(department.path, empName),
			defaultModelId: input.modelId,
			createdAt: now
		};
		const bP = botPath(employee.path, botName);
		const bot = {
			id: uid("bot"),
			employeeId: employee.id,
			name: botName,
			job: input.botJob.trim() || "Generalist",
			color: input.color,
			modelId: input.modelId,
			path: bP,
			workspacePath: posixJoin(bP, "workspace"),
			outputPath: posixJoin(bP, "output"),
			memoryPath: posixJoin(bP, "memory"),
			grants: [
				"workspace",
				"output",
				"outbox",
				"shared"
			],
			standingInstructions: "Do the work in your workspace. Put finished deliverables in output/. Use the department shared folder when handing work to another agent.",
			pinned: true,
			hidden: false,
			unread: 0,
			createdAt: now
		};
		const seeded = await fsSeedCompanyTree({ data: {
			companyRoot: company.root,
			company,
			department,
			employee,
			bots: [bot]
		} });
		if (!seeded.ok) return seeded;
		set({
			onboarded: true,
			company,
			departments: [department],
			employees: [employee],
			bots: [bot],
			selectedCatalogId: input.modelId,
			sessions: { [bot.id]: sessionOf(bot.id) },
			activeEmployeeId: employee.id,
			previewWritesToProjectData: cfg.previewWritesToProjectData,
			settings: {
				...get().settings,
				companyRootIsShared: input.sharedRoot
			},
			runtime: {
				...get().runtime,
				lastHeartbeat: now
			},
			ui: {
				...DEFAULT_UI,
				selectedBotId: bot.id,
				showComputer: true
			},
			diskEpoch: get().diskEpoch + 1
		});
		return { ok: true };
	},
	createBot: async (input) => {
		const s = get();
		const employee = s.employees.find((e) => e.id === s.activeEmployeeId) ?? s.employees[0];
		const department = s.departments.find((d) => d.id === employee?.departmentId);
		if (!employee || !department || !s.company) throw new Error("Create a company first");
		const name = slugName(input.name);
		const bP = botPath(employee.path, name);
		const now = nowIso();
		const bot = {
			id: uid("bot"),
			employeeId: employee.id,
			name,
			job: input.job.trim() || "Generalist",
			color: input.color,
			modelId: input.modelId,
			path: bP,
			workspacePath: posixJoin(bP, "workspace"),
			outputPath: posixJoin(bP, "output"),
			memoryPath: posixJoin(bP, "memory"),
			grants: [
				"workspace",
				"output",
				"outbox",
				...input.extraGrants ?? ["shared"]
			],
			standingInstructions: "Do the work in your workspace. Put finished deliverables in output/.",
			pinned: false,
			hidden: false,
			unread: 0,
			createdAt: now
		};
		await fsSeedBot({ data: {
			companyRoot: s.company.root,
			bot,
			department,
			employee
		} });
		set({
			bots: [...s.bots, bot],
			sessions: {
				...s.sessions,
				[bot.id]: sessionOf(bot.id)
			},
			ui: {
				...s.ui,
				selectedBotId: bot.id,
				newAgentOpen: false
			},
			diskEpoch: s.diskEpoch + 1
		});
		return bot;
	},
	renameBot: (id, name) => {
		const next = slugName(name);
		set((s) => ({ bots: s.bots.map((b) => b.id === id ? {
			...b,
			name: next
		} : b) }));
	},
	updateBot: (id, patch) => {
		set((s) => ({ bots: s.bots.map((b) => b.id === id ? {
			...b,
			...patch,
			id: b.id
		} : b) }));
	},
	duplicateBot: async (id) => {
		const src = get().bots.find((b) => b.id === id);
		if (!src) return null;
		return get().createBot({
			name: `${src.name} copy`,
			job: src.job,
			color: src.color,
			modelId: src.modelId,
			extraGrants: src.grants.filter((g) => g === "shared" || g === "company-shared")
		});
	},
	hideBot: (id, hidden) => set((s) => ({ bots: s.bots.map((b) => b.id === id ? {
		...b,
		hidden
	} : b) })),
	pinBot: (id, pinned) => set((s) => ({ bots: s.bots.map((b) => b.id === id ? {
		...b,
		pinned
	} : b) })),
	deleteBot: async (id) => {
		const s = get();
		const bot = s.bots.find((b) => b.id === id);
		if (bot && s.company) await fsDelete({ data: {
			path: bot.path,
			companyRoot: s.company.root
		} });
		const sessions = { ...s.sessions };
		delete sessions[id];
		const remaining = s.bots.filter((b) => b.id !== id);
		set({
			bots: remaining,
			sessions,
			diskEpoch: s.diskEpoch + 1,
			ui: {
				...s.ui,
				selectedBotId: s.ui.selectedBotId === id ? remaining[0]?.id ?? null : s.ui.selectedBotId
			}
		});
	},
	setBotGrants: async (id, grants) => {
		const s = get();
		const bot = s.bots.find((b) => b.id === id);
		if (!bot || !s.company) return;
		await fsWrite({ data: {
			companyRoot: s.company.root,
			path: posixJoin(bot.path, "bot.json"),
			content: JSON.stringify({
				name: bot.name,
				job: bot.job,
				modelId: bot.modelId,
				color: bot.color,
				grants,
				createdAt: bot.createdAt
			}, null, 2) + "\n"
		} });
		set({
			bots: s.bots.map((b) => b.id === id ? {
				...b,
				grants
			} : b),
			diskEpoch: s.diskEpoch + 1
		});
	},
	moveBotToEmployee: async (botId, employeeId) => {
		const s = get();
		const bot = s.bots.find((b) => b.id === botId);
		const employee = s.employees.find((e) => e.id === employeeId);
		const department = s.departments.find((d) => d.id === employee?.departmentId);
		if (!bot || !employee || !department || !s.company) return;
		const dest = botPath(employee.path, bot.name);
		await fsMove({ data: {
			from: bot.path,
			to: dest,
			companyRoot: s.company.root
		} });
		set({
			diskEpoch: s.diskEpoch + 1,
			bots: s.bots.map((b) => b.id === botId ? {
				...b,
				employeeId,
				path: dest,
				workspacePath: posixJoin(dest, "workspace"),
				outputPath: posixJoin(dest, "output"),
				memoryPath: posixJoin(dest, "memory")
			} : b)
		});
	},
	markRead: (botId) => set((s) => ({
		bots: s.bots.map((b) => b.id === botId ? {
			...b,
			unread: 0
		} : b),
		sessions: {
			...s.sessions,
			[botId]: {
				...s.sessions[botId] ?? sessionOf(botId),
				lastReadAt: nowIso()
			}
		}
	})),
	bumpUnread: (botId) => set((s) => ({ bots: s.bots.map((b) => b.id === botId && s.ui.selectedBotId !== botId ? {
		...b,
		unread: b.unread + 1
	} : b) })),
	createDepartment: async (name) => {
		const s = get();
		if (!s.company) throw new Error("No company");
		const deptName = slugName(name);
		const department = {
			id: uid("dept"),
			companyId: s.company.id,
			name: deptName,
			path: departmentPath(s.company.root, deptName),
			createdAt: nowIso()
		};
		await fsSeedDepartment({ data: {
			companyRoot: s.company.root,
			department
		} });
		set({
			departments: [...s.departments, department],
			diskEpoch: s.diskEpoch + 1
		});
		return department;
	},
	createEmployee: async (departmentId, displayName) => {
		const s = get();
		const department = s.departments.find((d) => d.id === departmentId);
		if (!department || !s.company) throw new Error("Missing department");
		const employee = {
			id: uid("emp"),
			departmentId,
			displayName: slugName(displayName),
			path: employeePath(department.path, slugName(displayName)),
			defaultModelId: s.selectedCatalogId,
			createdAt: nowIso()
		};
		await fsSeedEmployee({ data: {
			companyRoot: s.company.root,
			department,
			employee
		} });
		set({
			employees: [...s.employees, employee],
			diskEpoch: s.diskEpoch + 1
		});
		return employee;
	},
	setCompanyRootShared: (shared) => set((s) => ({ settings: {
		...s.settings,
		companyRootIsShared: shared
	} })),
	renameCompany: (name) => set((s) => s.company ? { company: {
		...s.company,
		name: slugName(name)
	} } : s),
	applyCompanyRoot: async (absolutePath) => {
		try {
			const cfg = await fsSetCompanyRoot({ data: { absolutePath } });
			const s = get();
			if (!s.company) {
				set({ previewWritesToProjectData: cfg.previewWritesToProjectData });
				return {
					ok: true,
					root: cfg.companyRoot
				};
			}
			const oldRoot = s.company.root;
			const newRoot = cfg.companyRoot;
			const remap = (p) => remapUnderRoot(oldRoot, newRoot, p);
			set({
				company: {
					...s.company,
					root: newRoot
				},
				departments: s.departments.map((d) => ({
					...d,
					path: remap(d.path)
				})),
				employees: s.employees.map((e) => ({
					...e,
					path: remap(e.path)
				})),
				bots: s.bots.map((b) => ({
					...b,
					path: remap(b.path),
					workspacePath: remap(b.workspacePath),
					outputPath: remap(b.outputPath),
					memoryPath: remap(b.memoryPath)
				})),
				previewWritesToProjectData: cfg.previewWritesToProjectData,
				diskEpoch: s.diskEpoch + 1
			});
			return {
				ok: true,
				root: cfg.companyRoot
			};
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},
	seedFoldersHere: async () => {
		const s = get();
		if (!s.company || !s.departments[0] || !s.employees[0]) return {
			ok: false,
			error: "Finish onboarding first."
		};
		const seeded = await fsSeedCompanyTree({ data: {
			companyRoot: s.company.root,
			company: s.company,
			department: s.departments[0],
			employee: s.employees[0],
			bots: s.bots.filter((b) => b.employeeId === s.employees[0].id)
		} });
		if (seeded.ok) set({ diskEpoch: s.diskEpoch + 1 });
		return seeded;
	},
	appendMessage: (botId, msg) => {
		const message = {
			id: msg.id ?? uid("msg"),
			botId,
			role: msg.role,
			content: msg.content,
			createdAt: msg.createdAt ?? nowIso(),
			chips: msg.chips,
			permission: msg.permission,
			permissionDecision: msg.permissionDecision,
			handoffTo: msg.handoffTo
		};
		set((s) => {
			const sess = s.sessions[botId] ?? sessionOf(botId);
			return { sessions: {
				...s.sessions,
				[botId]: {
					...sess,
					messages: [...sess.messages, message]
				}
			} };
		});
		return message;
	},
	patchMessage: (botId, msgId, patch) => {
		set((s) => {
			const sess = s.sessions[botId];
			if (!sess) return s;
			return { sessions: {
				...s.sessions,
				[botId]: {
					...sess,
					messages: sess.messages.map((m) => m.id === msgId ? {
						...m,
						...patch
					} : m)
				}
			} };
		});
	},
	setSessionRunning: (botId, running) => set((s) => {
		const sess = s.sessions[botId] ?? sessionOf(botId);
		return { sessions: {
			...s.sessions,
			[botId]: {
				...sess,
				running,
				stopRequested: running ? sess.stopRequested : false
			}
		} };
	}),
	requestStop: (botId) => set((s) => {
		const sess = s.sessions[botId];
		if (!sess) return s;
		return { sessions: {
			...s.sessions,
			[botId]: {
				...sess,
				stopRequested: true,
				running: false
			}
		} };
	}),
	clearStop: (botId) => set((s) => {
		const sess = s.sessions[botId];
		if (!sess) return s;
		return { sessions: {
			...s.sessions,
			[botId]: {
				...sess,
				stopRequested: false
			}
		} };
	}),
	addChatGrant: (botId, key) => set((s) => {
		const sess = s.sessions[botId] ?? sessionOf(botId);
		return { sessions: {
			...s.sessions,
			[botId]: {
				...sess,
				chatGrants: {
					...sess.chatGrants,
					[key]: true
				}
			}
		} };
	}),
	hasChatGrant: (botId, key) => Boolean(get().sessions[botId]?.chatGrants[key]),
	writeBotFile: async (botId, path, content) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		const r = await fsWrite({ data: {
			path: n,
			content,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots
		} });
		if (r.ok) get().bumpDisk();
		return r;
	},
	readBotFile: async (botId, path) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		return fsRead({ data: {
			path: n,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots
		} });
	},
	listBotDir: async (botId, path) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		return fsTree({ data: {
			path: n,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots,
			max: 80
		} });
	},
	replaceBotFile: async (botId, path, oldString, newString) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		const r = await fsReplace({ data: {
			path: n,
			oldString,
			newString,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots
		} });
		if (r.ok) get().bumpDisk();
		return r;
	},
	deleteBotFile: async (botId, path) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		const r = await fsDelete({ data: {
			path: n,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots
		} });
		if (r.ok) get().bumpDisk();
		return r;
	},
	shellBot: async (botId, command) => {
		const ctx = ctxRoots(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const r = await fsRunCommand({ data: {
			command,
			cwd: ctx.bot.workspacePath,
			companyRoot: ctx.companyRoot,
			allowedRoots: ctx.allowedRoots
		} });
		if (r.ok) get().bumpDisk();
		return r;
	},
	handoffTask: async (fromBotId, toBotName, task) => {
		const s = get();
		const from = ctxRoots(s, fromBotId);
		if (!from) return {
			ok: false,
			error: "Unknown agent"
		};
		const needle = toBotName.replace(/^@/, "").toLowerCase();
		const to = s.bots.find((b) => b.name.toLowerCase() === needle && !b.hidden);
		if (!to) return {
			ok: false,
			error: `No agent named ${toBotName}`
		};
		if (!from.bot.grants.includes("shared") || !to.grants.includes("shared")) return {
			ok: false,
			error: "Both agents need the department shared grant."
		};
		const shared = grantPathFor(from.bot, from.employee, from.department, from.company, "shared");
		const filename = `task-${Date.now()}-${from.bot.name}-to-${to.name}.md`;
		const path = posixJoin(shared, filename);
		const wrote = await fsWrite({ data: {
			path,
			content: `# Handoff from ${from.bot.name} to ${to.name}\n\n${task}\n`,
			companyRoot: from.companyRoot,
			allowedRoots: from.allowedRoots
		} });
		if (!wrote.ok) return wrote;
		const toSess = s.sessions[to.id] ?? sessionOf(to.id);
		const notice = {
			id: uid("msg"),
			botId: to.id,
			role: "system",
			content: `${from.bot.name} handed you a task in shared/${filename}:\n\n${task}`,
			createdAt: nowIso()
		};
		set({
			diskEpoch: s.diskEpoch + 1,
			sessions: {
				...s.sessions,
				[to.id]: {
					...toSess,
					messages: [...toSess.messages, notice]
				}
			},
			bots: s.bots.map((b) => b.id === to.id ? {
				...b,
				unread: b.unread + 1
			} : b)
		});
		return {
			ok: true,
			toBotId: to.id,
			path
		};
	},
	updateSettings: (patch) => set((s) => ({ settings: {
		...s.settings,
		...patch
	} })),
	selectBot: (id) => {
		set((s) => ({ ui: {
			...s.ui,
			selectedBotId: id,
			agentsOpen: false
		} }));
		if (id) get().markRead(id);
	}
}), {
	name: "localbot-state-v2",
	storage: createJSONStorage(() => memoryStorage),
	partialize: (s) => ({
		version: s.version,
		onboarded: s.onboarded,
		company: s.company,
		departments: s.departments,
		employees: s.employees,
		bots: s.bots,
		selectedCatalogId: s.selectedCatalogId,
		sessions: Object.fromEntries(Object.entries(s.sessions).map(([id, sess]) => [id, {
			...sess,
			running: false,
			stopRequested: false
		}])),
		hardware: s.hardware,
		settings: s.settings,
		runtime: {
			...s.runtime,
			aiAvailable: false
		},
		activeEmployeeId: s.activeEmployeeId,
		previewWritesToProjectData: s.previewWritesToProjectData
	})
}));
function resolveBot(s, botId) {
	const bot = s.bots.find((b) => b.id === botId);
	if (!bot || !s.company) return null;
	const employee = s.employees.find((e) => e.id === bot.employeeId);
	if (!employee) return null;
	const department = s.departments.find((d) => d.id === employee.departmentId);
	if (!department) return null;
	return {
		bot,
		employee,
		department,
		company: s.company
	};
}
function LogoMark({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 32 32",
		className: cn("size-7", className),
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				width: "32",
				height: "32",
				rx: "8",
				fill: "currentColor",
				className: "text-accent"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "7",
				y: "8",
				width: "7",
				height: "16",
				rx: "2",
				fill: "#0a0b0d",
				opacity: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M17.5 11h7.5v2.2H20v2.1h4.2v2.2H20V21h-2.5V11z",
				fill: "#0a0b0d"
			})
		]
	});
}
function Wordmark({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("flex items-center gap-2 font-medium tracking-tight", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoMark, { className: "size-6" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "text-fg",
			children: ["Local", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-muted",
				children: "Bot"
			})]
		})]
	});
}
function detectOs(ua, platform) {
	const p = platform.toLowerCase();
	const u = ua.toLowerCase();
	const isMobile = /iphone|ipad|ipod|android|mobile|iemobile|opera mini/.test(u) || /iphone|ipad|android/.test(p);
	if (/mac os x|macintosh|macintel|macppc/.test(u) || p.includes("mac")) return {
		os: "macOS",
		appleSilicon: /arm|aarch64/.test(u) || p.includes("arm") || p === "macintel" && !/intel mac os x/.test(u) || p === "macintel",
		isMobile
	};
	if (/win/.test(p) || /windows/.test(u)) return {
		os: "Windows",
		appleSilicon: false,
		isMobile
	};
	if (/linux/.test(p) || /linux/.test(u)) return {
		os: "Linux",
		appleSilicon: false,
		isMobile
	};
	if (/android/.test(u)) return {
		os: "Android",
		appleSilicon: false,
		isMobile: true
	};
	if (/iphone|ipad|ipod/.test(u)) return {
		os: "iOS",
		appleSilicon: true,
		isMobile: true
	};
	return {
		os: platform || "Unknown",
		appleSilicon: false,
		isMobile
	};
}
function detectArch(ua, appleSilicon, platform) {
	const u = ua.toLowerCase();
	if (appleSilicon || /arm64|aarch64/.test(u)) return "arm64";
	if (/wow64|win64|x86_64|x64|amd64/.test(u) || /x86_64|win32/.test(platform.toLowerCase())) return "x64";
	if (/arm/.test(u)) return "arm";
	return "x64";
}
function gpuFromRenderer(renderer) {
	if (!renderer) return {
		name: null,
		vramGb: null
	};
	const name = renderer.replace(/^ANGLE \((.+)\)/, "$1").trim();
	let vramGb = null;
	if (/rtx 4090|rtx 5090/i.test(name)) vramGb = 24;
	else if (/rtx 4080|rtx 5080/i.test(name)) vramGb = 16;
	else if (/rtx 4070|rtx 3080|rtx 3090/i.test(name)) vramGb = 12;
	else if (/rtx 4060|rtx 3060|rtx 3070/i.test(name)) vramGb = 8;
	else if (/apple m[1-4]/i.test(name)) vramGb = null;
	else if (/iris|uhd graphics|radeon graphics/i.test(name)) vramGb = 0;
	return {
		name,
		vramGb
	};
}
/**
* Browser `deviceMemory` is capped at 8. Desktops that report the cap are
* treated as a 16 GB class machine so Recommended can actually be offered.
* Phones stay conservative.
*/
function scanHardware(hints = {}) {
	const ua = hints.userAgent ?? "";
	const platform = hints.platform ?? "";
	const { os, appleSilicon, isMobile } = detectOs(ua, platform);
	const arch = detectArch(ua, appleSilicon, platform);
	const cores = hints.hardwareConcurrency ?? 4;
	const gpu = gpuFromRenderer(hints.webglRenderer ?? null);
	const reported = hints.deviceMemoryGb;
	let totalRamGb;
	let availableRamGb;
	let ramSource;
	if (isMobile) {
		totalRamGb = reported && reported > 0 ? reported : 6;
		availableRamGb = Math.max(3, totalRamGb - 1.5);
		ramSource = reported ? "deviceMemory" : "assumed-mobile";
	} else if (reported && reported < 8) {
		totalRamGb = reported;
		availableRamGb = Math.max(2, reported - 1.5);
		ramSource = "deviceMemory";
	} else {
		totalRamGb = reported && reported > 8 ? reported : 16;
		availableRamGb = Math.max(8, totalRamGb - 3.5);
		ramSource = reported === 8 || reported === void 0 ? "assumed-desktop" : "deviceMemory";
	}
	const freeDiskGb = isMobile ? 12 : 180;
	return {
		os,
		arch,
		platformLabel: `${os} ${arch}`,
		totalRamGb,
		availableRamGb,
		ramSource,
		gpuName: gpu.name,
		vramGb: appleSilicon ? null : gpu.vramGb,
		appleSilicon,
		cores,
		freeDiskGb,
		isMobile,
		scannedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function scanBrowserHardware() {
	const nav = typeof navigator === "undefined" ? {} : navigator;
	let renderer = null;
	if (typeof document !== "undefined") try {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
		if (gl && "getExtension" in gl) {
			const info = gl.getExtension("WEBGL_debug_renderer_info");
			if (info) renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
		}
	} catch {
		renderer = null;
	}
	const mem = nav.deviceMemory;
	return scanHardware({
		userAgent: nav.userAgent,
		platform: nav.platform,
		hardwareConcurrency: nav.hardwareConcurrency,
		deviceMemoryGb: mem,
		webglRenderer: renderer
	});
}
var AGENT_COLORS = {
	sage: {
		id: "sage",
		label: "Sage",
		hex: "#8fa394"
	},
	steel: {
		id: "steel",
		label: "Steel",
		hex: "#7a8ea3"
	},
	clay: {
		id: "clay",
		label: "Clay",
		hex: "#c17f59"
	},
	moss: {
		id: "moss",
		label: "Moss",
		hex: "#6b8f71"
	},
	slate: {
		id: "slate",
		label: "Slate",
		hex: "#9aa0b4"
	},
	pine: {
		id: "pine",
		label: "Pine",
		hex: "#5f8f86"
	}
};
var AGENT_COLOR_LIST = Object.values(AGENT_COLORS);
var buttonVariants = cva("inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,color,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 active:not-disabled:scale-[0.96] select-none", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:opacity-90 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]",
			secondary: "bg-raised text-fg hover:bg-hover shadow-[0_0_0_1px_rgb(255_255_255/0.08)]",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-hover",
			danger: "bg-danger/15 text-danger hover:bg-danger/25",
			outline: "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover"
		},
		size: {
			sm: "h-8 px-3 text-sm rounded-sm",
			md: "h-10 px-3.5 text-sm rounded-md",
			lg: "h-11 px-4 text-sm rounded-md",
			icon: "size-10 rounded-md",
			"icon-sm": "size-8 rounded-sm"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, asChild, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("h-10 w-full rounded-md bg-raised px-3 text-sm text-fg placeholder:text-subtle", "shadow-[0_0_0_1px_var(--color-border)]", "transition-[box-shadow] duration-150", "focus-visible:shadow-[0_0_0_2px_var(--color-accent)]", "disabled:opacity-40", className),
		...props
	});
}
function AgentAvatar({ bot, size = "md" }) {
	const hex = AGENT_COLORS[bot.color]?.hex ?? AGENT_COLORS.sage.hex;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex shrink-0 items-center justify-center rounded-sm font-medium text-accent-fg", size === "xs" ? "size-6 text-[10px]" : size === "sm" ? "size-8 text-[11px]" : size === "lg" ? "size-12 text-base" : "size-9 text-xs"),
		style: { backgroundColor: hex },
		"aria-hidden": true,
		children: initials(bot.name)
	});
}
function ColorSwatch({ hex, selected, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: cn("size-7 rounded-sm transition-transform duration-150", selected && "ring-2 ring-fg ring-offset-2 ring-offset-bg"),
		style: { backgroundColor: hex },
		"aria-label": hex
	});
}
var TEMPLATES = [
	{
		name: "Writer",
		job: "Turn notes into drafts, briefs, and outbox deliverables.",
		color: "sage"
	},
	{
		name: "Researcher",
		job: "Gather sources into the department shared folder.",
		color: "steel"
	},
	{
		name: "Ops",
		job: "Keep the workspace organized and file the finished work.",
		color: "pine"
	}
];
var WELCOME = [
	{
		id: "hello",
		title: "Your agents, in this browser.",
		body: "LocalBot is a web app. You create named agents and talk to them like contacts. Each one has its own workspace folder on the machine running this server."
	},
	{
		id: "stay",
		title: "Chat is hosted grok-4.5.",
		body: "This build does not run a local GGUF. Agents think with hosted grok-4.5 when the server has an API key. There is no model file written to disk."
	},
	{
		id: "grants",
		title: "Work files go on disk.",
		body: "The company root is a real directory. Agents only write inside folders you grant. Two people share work only if they point at the same real folder on this machine (or a NAS mounted here)."
	}
];
function Onboarding() {
	const [step, setStep] = (0, import_react.useState)("hello");
	const hardware = useLocalBot((s) => s.hardware);
	const setHardware = useLocalBot((s) => s.setHardware);
	const noteCatalog = useLocalBot((s) => s.noteCatalog);
	const completeOnboarding = useLocalBot((s) => s.completeOnboarding);
	const [scanning, setScanning] = (0, import_react.useState)(false);
	const [picked, setPicked] = (0, import_react.useState)(null);
	const [company, setCompany] = (0, import_react.useState)("Studio");
	const [department, setDepartment] = (0, import_react.useState)("Operations");
	const [employee, setEmployee] = (0, import_react.useState)("You");
	const [shared, setShared] = (0, import_react.useState)(false);
	const [botName, setBotName] = (0, import_react.useState)("Writer");
	const [botJob, setBotJob] = (0, import_react.useState)(TEMPLATES[0].job);
	const [color, setColor] = (0, import_react.useState)("sage");
	const [companyRoot, setCompanyRoot] = (0, import_react.useState)("");
	const [rootTouched, setRootTouched] = (0, import_react.useState)(false);
	const [previewData, setPreviewData] = (0, import_react.useState)(true);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const cards = (0, import_react.useMemo)(() => hardware ? onboardingCards(hardware) : null, [hardware]);
	(0, import_react.useEffect)(() => {
		fsGetCompanyRoot().then((cfg) => {
			setPreviewData(cfg.previewWritesToProjectData);
			if (!rootTouched) setCompanyRoot(cfg.defaultRoot);
		});
	}, [rootTouched]);
	(0, import_react.useEffect)(() => {
		if (rootTouched) return;
		fsGetCompanyRoot().then((cfg) => {
			const base = cfg.defaultRoot.replace(/[/\\][^/\\]+$/, "");
			setCompanyRoot(`${base}/${company.trim() || "Studio"}`);
		});
	}, [company, rootTouched]);
	(0, import_react.useEffect)(() => {
		if (step !== "scan") return;
		setScanning(true);
		const t = window.setTimeout(() => {
			setHardware(scanBrowserHardware());
			setScanning(false);
		}, 1100);
		return () => window.clearTimeout(t);
	}, [step, setHardware]);
	const pickModel = (id) => {
		setPicked(id);
		noteCatalog(id);
		setStep("agent");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between px-5 py-4 md:px-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[11px] tracking-wide text-subtle uppercase",
				children: "First run"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-10 md:px-8",
			children: [
				WELCOME.some((w) => w.id === step) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Welcome, {
					step,
					onNext: () => {
						const next = WELCOME[WELCOME.findIndex((w) => w.id === step) + 1];
						setStep(next ? next.id : "scan");
					},
					onBack: () => {
						const idx = WELCOME.findIndex((w) => w.id === step);
						if (idx > 0) setStep(WELCOME[idx - 1].id);
					}
				}),
				step === "scan" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScanStep, {
					scanning,
					onContinue: () => setStep("models"),
					onBack: () => setStep("grants")
				}),
				step === "models" && cards && hardware && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelStep, {
					cards,
					onPick: pickModel,
					onBack: () => setStep("scan")
				}),
				step === "agent" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AgentStep, {
					company,
					setCompany,
					department,
					setDepartment,
					employee,
					setEmployee,
					shared,
					setShared,
					botName,
					setBotName,
					botJob,
					setBotJob,
					color,
					setColor,
					companyRoot,
					setCompanyRoot: (v) => {
						setRootTouched(true);
						setCompanyRoot(v);
					},
					previewData,
					busy,
					error,
					onTemplate: (t) => {
						setBotName(t.name);
						setBotJob(t.job);
						setColor(t.color);
					},
					onBack: () => setStep("models"),
					onFinish: async () => {
						setBusy(true);
						setError(null);
						const result = await completeOnboarding({
							companyName: company,
							departmentName: department,
							employeeName: employee,
							botName,
							botJob,
							color,
							modelId: picked ?? "gemma4-e2b-q4",
							sharedRoot: shared,
							companyRoot
						});
						setBusy(false);
						if (!result.ok) setError(result.error);
					}
				})
			]
		})]
	});
}
function Welcome({ step, onNext, onBack }) {
	const screen = WELCOME.find((w) => w.id === step);
	const idx = WELCOME.findIndex((w) => w.id === step);
	const Icon = [
		HardDrive,
		Shield,
		FolderLock
	][idx] ?? HardDrive;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "stagger-in flex flex-1 flex-col justify-center py-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mb-6 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: [idx + 1, " / 3"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-6 flex size-12 items-center justify-center rounded-lg bg-raised text-accent shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
					className: "size-5",
					strokeWidth: 1.6
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "max-w-xl text-3xl leading-tight font-medium tracking-tight md:text-4xl",
				children: screen.title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 max-w-xl text-base leading-relaxed text-muted",
				children: screen.body
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-10 flex gap-3",
				children: [idx > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: onNext,
					children: ["Continue", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" })]
				})]
			})
		]
	});
}
function ScanStep({ scanning, onContinue, onBack }) {
	const hardware = useLocalBot((s) => s.hardware);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "stagger-in flex flex-1 flex-col justify-center py-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Hardware"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "This machine"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-xl text-sm leading-relaxed text-muted",
				children: "Browser estimate of RAM and GPU. It does not change chat in this build — chat still uses hosted grok-4.5. Kept for when local models are wired."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-8 overflow-hidden rounded-xl bg-surface p-1 shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
					className: "grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0",
					children: [
						["OS", scanning ? "…" : hardware?.platformLabel],
						["CPU cores", scanning ? "…" : String(hardware?.cores ?? "—")],
						["RAM", scanning ? "…" : hardware ? `${hardware.totalRamGb} GB total · ${hardware.availableRamGb.toFixed(1)} GB free` : "—"],
						["GPU", scanning ? "…" : hardware?.gpuName ?? (hardware?.appleSilicon ? "Apple Silicon (unified)" : "None detected")],
						["Apple Silicon", scanning ? "…" : hardware?.appleSilicon ? "Yes" : "No"],
						["Free disk", scanning ? "…" : hardware ? `${hardware.freeDiskGb} GB (estimate)` : "—"]
					].map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
							className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
							children: k
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
							className: "mt-1 text-sm text-fg",
							children: v
						})]
					}, k))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: onContinue,
					disabled: scanning || !hardware,
					children: ["See catalog", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" })]
				})]
			})
		]
	});
}
function ModelStep({ cards, onPick, onBack }) {
	const items = [
		{
			key: "small",
			title: "Small",
			model: cards.small
		},
		{
			key: "recommended",
			title: "Recommended",
			model: cards.recommended
		},
		{
			key: "large",
			title: "Large",
			model: cards.large
		}
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "stagger-in flex flex-1 flex-col py-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Catalog"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Choose a catalog size (placeholder)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "These cards are planned local models. This build does not download a GGUF or run inference locally. Chat uses hosted grok-4.5. Catalog noted."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6 grid gap-3 md:grid-cols-3",
				children: items.map(({ key, title, model }) => {
					if (!model) return null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => onPick(model.id),
						className: "flex flex-col rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[transform,background-color] duration-150 hover:bg-raised",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
									children: title
								}), key === "recommended" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent",
									children: "Placeholder"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "mt-3 text-base font-medium",
								children: model.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 font-mono text-xs text-muted",
								children: [
									model.sizeLabel,
									" · ",
									model.license
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 text-xs leading-relaxed text-muted",
								children: "Not wired in this build. Stored as a catalog id only."
							})
						]
					}, key);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-8",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), "Back"]
				})
			})
		]
	});
}
function AgentStep(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "stagger-in flex flex-1 flex-col py-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Company"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Create your first agent"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "This writes the company tree on disk at the path below. The agent’s computer is its workspace folder."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-4 md:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Company", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							className: "mt-1.5",
							value: props.company,
							onChange: (e) => props.setCompany(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Department", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							className: "mt-1.5",
							value: props.department,
							onChange: (e) => props.setDepartment(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Your name", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							className: "mt-1.5",
							value: props.employee,
							onChange: (e) => props.setEmployee(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex items-end gap-2 pb-1 text-sm text-fg",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "checkbox",
							className: "size-4 accent-accent",
							checked: props.shared,
							onChange: (e) => props.setShared(e.target.checked)
						}), "This path is a shared drive"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "mt-4 block text-xs font-medium text-muted",
				children: ["Company root (absolute path)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "mt-1.5 font-mono text-xs",
					value: props.companyRoot,
					onChange: (e) => props.setCompanyRoot(e.target.value)
				})]
			}),
			props.previewData ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-muted",
				children: "This preview writes to the project data folder. Two laptops share work only if they point at the same real folder on the machine running npm run dev."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-muted",
				children: "Shared departments require a shared folder path. This process sees the disk of the machine running the server."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium text-muted",
					children: "Template"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex flex-wrap gap-2",
					children: TEMPLATES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => props.onTemplate(t),
						className: "rounded-md bg-raised px-3 py-1.5 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover",
						children: t.name
					}, t.name))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 grid gap-4 md:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block text-xs font-medium text-muted",
					children: ["Agent name", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1.5",
						value: props.botName,
						onChange: (e) => props.setBotName(e.target.value)
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block text-xs font-medium text-muted",
					children: ["Job", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1.5",
						value: props.botJob,
						onChange: (e) => props.setBotJob(e.target.value)
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium text-muted",
					children: "Color"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex gap-2",
					children: AGENT_COLOR_LIST.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorSwatch, {
						hex: c.hex,
						selected: props.color === c.id,
						onClick: () => props.setColor(c.id)
					}, c.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-5 font-mono text-[11px] leading-relaxed text-subtle break-all",
				children: `${props.companyRoot || "(set a path)"}/departments/${props.department || "Operations"}/people/${props.employee || "You"}/bots/${props.botName || "Writer"}/`
			}),
			props.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-danger",
				children: props.error
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					onClick: props.onBack,
					disabled: props.busy,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => void props.onFinish(),
					disabled: !props.botName.trim() || !props.companyRoot.trim() || props.busy,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }), props.busy ? "Creating folders…" : "Open chat"]
				})]
			})
		]
	});
}
function buildSystemPrompt(s, bot, extras) {
	const ctx = resolveBot(s, bot.id);
	if (!ctx) return "You are a LocalBot agent.";
	const modelName = getCatalogModel(bot.modelId)?.name ?? bot.modelId;
	const shared = bot.grants.includes("shared") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const outbox = bot.grants.includes("outbox") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox") : null;
	return `You are ${bot.name}, a LocalBot agent in a browser app.
Job: ${bot.job}
Chat model: hosted grok-4.5 (catalog identity: ${modelName})
Employee: ${ctx.employee.displayName}
Department: ${ctx.department.name}
Company: ${ctx.company.name}

You do real work by calling tools. Prefer write_file / str_replace / list_dir over talking about work. When the user asks you to create something, actually write it into output/ or workspace/. Put finished deliverables in output/ AND copy a final version into the employee outbox when it is granted.

Paths you may use (absolute paths on the machine running this server):
- workspace: ${bot.workspacePath}
- output: ${bot.outputPath}
- memory: ${bot.memoryPath}
${shared ? `- department shared: ${shared}` : "- department shared: not granted"}
${outbox ? `- outbox: ${outbox}` : ""}

Current workspace tree:
${extras.tree}

Shared folder:
${extras.sharedTree}

Standing instructions:
${extras.standing}

Memory:
${extras.memory}

Rules:
- Never claim you cannot write files. You can. Use tools.
- Bare filenames like hello.md go in your workspace. Use the absolute workspace/output paths above.
- Never ask the user to paste file contents you can read yourself.
- Keep replies concise. After tools, summarize what you wrote and where.
- If another agent is mentioned with @Name, the UI will write a handoff file. You may also write a task note into the shared folder.
- Do not invent network access. Web search is ${s.settings.webSearchEnabled ? "enabled" : "disabled"}.
- Stay inside granted folders.`;
}
function rosterBlurb(s) {
	return s.bots.filter((b) => !b.hidden).map((b) => `@${b.name} — ${b.job}`).join("\n");
}
/**
* Isolation layer: the UI talks to this adapter, never to the model HTTP client.
* This pass: hosted grok-4.5 via src/lib/runtime/turn.ts.
* File tools write to the company root on the server disk.
*
* AbortSignal cannot be forwarded through createServerFn; Stop cancels the
* client loop between rounds only.
*/
function parseArgs(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
async function executeTool(botId, call) {
	const s = useLocalBot.getState();
	switch (call.name) {
		case "read_file": {
			const path = String(call.args.path ?? "");
			const r = await s.readBotFile(botId, path);
			return r.ok ? r.content : r.error;
		}
		case "write_file": {
			const path = String(call.args.path ?? "");
			const content = String(call.args.content ?? "");
			const r = await s.writeBotFile(botId, path, content);
			return r.ok ? `Wrote ${path} (${content.length} chars)` : r.error;
		}
		case "str_replace": {
			const path = String(call.args.path ?? "");
			const r = await s.replaceBotFile(botId, path, String(call.args.old_string ?? ""), String(call.args.new_string ?? ""));
			return r.ok ? `Edited ${path}` : r.error;
		}
		case "list_dir": {
			const path = String(call.args.path ?? "");
			const r = await s.listBotDir(botId, path);
			return r.ok ? r.listing : r.error;
		}
		case "delete_file": {
			const path = String(call.args.path ?? "");
			const r = await s.deleteBotFile(botId, path);
			return r.ok ? `Deleted ${path}` : r.error;
		}
		case "run_command": {
			const command = String(call.args.command ?? "");
			const r = await s.shellBot(botId, command);
			if (!r.ok) return r.error;
			return [r.stdout, r.stderr].filter(Boolean).join("\n") || `(exit ${r.code})`;
		}
		case "web_search": return "Network is gated. Enable web search in Settings to use this tool.";
		default: return `Unknown tool: ${call.name}`;
	}
}
async function runAgentLoop(opts) {
	const store = useLocalBot.getState();
	const ctx = resolveBot(store, opts.botId);
	if (!ctx) return {
		stopped: false,
		error: "Unknown agent"
	};
	const history = (store.sessions[opts.botId]?.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant").slice(-16).map((m) => ({
		role: m.role,
		content: m.content
	}));
	const snap = useLocalBot.getState();
	const shared = ctx.bot.grants.includes("shared") ? grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const [memoryRes, standingRes, treeRes, sharedRes] = await Promise.all([
		fsRead({ data: {
			path: `${ctx.bot.memoryPath}/notes.md`,
			companyRoot: ctx.company.root
		} }),
		fsRead({ data: {
			path: `${ctx.bot.path}/AGENTS.md`,
			companyRoot: ctx.company.root
		} }),
		fsTree({ data: {
			path: ctx.bot.path,
			companyRoot: ctx.company.root,
			max: 60
		} }),
		shared ? fsTree({ data: {
			path: shared,
			companyRoot: ctx.company.root,
			max: 40
		} }) : Promise.resolve({
			ok: true,
			listing: "(not granted)"
		})
	]);
	const messages = [{
		role: "system",
		content: buildSystemPrompt(snap, ctx.bot, {
			memory: memoryRes.ok ? memoryRes.content : "",
			standing: standingRes.ok ? standingRes.content : ctx.bot.standingInstructions,
			tree: treeRes.ok ? treeRes.listing : "(unavailable)",
			sharedTree: sharedRes.ok ? sharedRes.listing : "(unavailable)"
		}) + `\n\nOther agents:\n${rosterBlurb(snap)}`
	}, ...history];
	let rounds = 0;
	while (rounds < 6) {
		if (opts.abort.aborted || useLocalBot.getState().sessions[opts.botId]?.stopRequested) return { stopped: true };
		rounds += 1;
		const turn = await runHarnessTurn({ data: {
			messages,
			allowNetwork: useLocalBot.getState().settings.webSearchEnabled
		} });
		if (!turn.ok) return {
			stopped: false,
			error: turn.error
		};
		if (turn.toolCalls.length === 0) {
			if (turn.content.trim()) store.appendMessage(opts.botId, {
				role: "assistant",
				content: turn.content.trim()
			});
			return { stopped: false };
		}
		messages.push({
			role: "assistant",
			content: turn.content ?? "",
			tool_calls: turn.toolCalls
		});
		for (const tc of turn.toolCalls) {
			if (opts.abort.aborted) return { stopped: true };
			const result = await handleOneTool(opts.botId, tc, opts.events);
			messages.push({
				role: "tool",
				tool_call_id: tc.id,
				content: result
			});
		}
	}
	store.appendMessage(opts.botId, {
		role: "assistant",
		content: "Stopped after too many tool rounds. Ask me to continue."
	});
	return { stopped: false };
}
async function handleOneTool(botId, tc, events) {
	const snap = useLocalBot.getState();
	const ctx = resolveBot(snap, botId);
	if (!ctx) return "Unknown agent";
	const args = parseArgs(tc.arguments);
	const call = {
		name: tc.name,
		args
	};
	const cls = classifyToolCall(call, {
		bot: ctx.bot,
		employee: ctx.employee,
		department: ctx.department,
		company: ctx.company,
		webSearchEnabled: snap.settings.webSearchEnabled,
		controlThisComputer: snap.settings.controlThisComputer
	});
	const chipId = uid("chip");
	events.onChip({
		id: chipId,
		kind: cls.kind,
		label: cls.summary,
		detail: cls.detail,
		status: "running"
	});
	let decision = "allow-once";
	if (cls.alwaysAsk) {
		const key = grantKey(cls);
		if (snap.hasChatGrant(botId, key) || snap.hasChatGrant(botId, cls.kind)) decision = "allow-chat";
		else {
			const req = {
				id: uid("perm"),
				botId,
				tool: tc.name,
				kind: cls.kind,
				summary: cls.summary,
				detail: cls.detail,
				path: cls.path,
				alwaysAsk: true
			};
			decision = await events.askPermission(req);
			if (decision === "allow-chat") {
				useLocalBot.getState().addChatGrant(botId, key);
				useLocalBot.getState().addChatGrant(botId, cls.kind);
			}
		}
	}
	if (decision === "deny" || !cls.allowedByGrant) {
		events.onChipUpdate(chipId, { status: "denied" });
		return denyMessage(cls);
	}
	const output = await executeTool(botId, call);
	const denied = output.startsWith("Denied");
	events.onChipUpdate(chipId, { status: denied ? "denied" : "ok" });
	return output;
}
function renderInline(text, keyPrefix) {
	const parts = [];
	const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
	let last = 0;
	let m;
	let i = 0;
	while (m = re.exec(text)) {
		if (m.index > last) parts.push(text.slice(last, m.index));
		const token = m[0];
		if (token.startsWith("**")) parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
			className: "font-medium text-fg",
			children: token.slice(2, -2)
		}, `${keyPrefix}-b${i++}`));
		else if (token.startsWith("`")) parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
			className: "rounded-xs bg-raised px-1 py-0.5 font-mono text-[0.85em] text-accent",
			children: token.slice(1, -1)
		}, `${keyPrefix}-c${i++}`));
		else parts.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", {
			className: "italic",
			children: token.slice(1, -1)
		}, `${keyPrefix}-i${i++}`));
		last = m.index + token.length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}
function ChatMarkdown({ text, className }) {
	const blocks = text.split(/```/);
	const nodes = [];
	blocks.forEach((block, idx) => {
		if (idx % 2 === 1) {
			const nl = block.indexOf("\n");
			const code = nl >= 0 ? block.slice(nl + 1) : block;
			nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
				className: "my-2 overflow-x-auto rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-fg shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: code.replace(/\n$/, "") })
			}, `code-${idx}`));
			return;
		}
		const lines = block.split("\n");
		let list = [];
		const flushList = () => {
			if (list.length === 0) return;
			const items = list;
			list = [];
			nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "my-1.5 space-y-1 pl-4",
				children: items.map((it, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "list-disc text-sm leading-relaxed text-fg/90",
					children: renderInline(it, `li-${idx}-${i}`)
				}, i))
			}, `ul-${idx}-${nodes.length}`));
		};
		lines.forEach((line, li) => {
			const t = line.trimEnd();
			if (/^\s*[-*]\s+/.test(t)) {
				list.push(t.replace(/^\s*[-*]\s+/, ""));
				return;
			}
			flushList();
			if (!t.trim()) {
				nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-2" }, `sp-${idx}-${li}`));
				return;
			}
			if (t.startsWith("### ")) {
				nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "mt-3 mb-1 text-sm font-medium text-fg",
					children: t.slice(4)
				}, `h-${idx}-${li}`));
				return;
			}
			if (t.startsWith("## ") || t.startsWith("# ")) {
				nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-3 mb-1 text-[15px] font-medium text-fg",
					children: t.replace(/^#+\s+/, "")
				}, `h-${idx}-${li}`));
				return;
			}
			nodes.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-fg/90",
				children: renderInline(t, `p-${idx}-${li}`)
			}, `p-${idx}-${li}`));
		});
		flushList();
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("space-y-0.5", className),
		children: nodes
	});
}
var SUGGESTIONS = [
	"Write a one-page launch brief into output/brief.md",
	"List everything in your workspace and summarize it",
	"Create notes.md in your workspace with today's priorities"
];
function ChatPane() {
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bot = useLocalBot((s) => s.bots).find((b) => b.id === selected) ?? null;
	const session = useLocalBot((s) => selected ? s.sessions[selected] : void 0);
	const composer = useLocalBot((s) => s.ui.composer);
	const setUi = useLocalBot((s) => s.setUi);
	const appendMessage = useLocalBot((s) => s.appendMessage);
	const setRunning = useLocalBot((s) => s.setSessionRunning);
	const requestStop = useLocalBot((s) => s.requestStop);
	const handoffTask = useLocalBot((s) => s.handoffTask);
	const writeBotFile = useLocalBot((s) => s.writeBotFile);
	const showComputer = useLocalBot((s) => s.ui.showComputer);
	const aiAvailable = useLocalBot((s) => s.runtime.aiAvailable);
	const snap = useLocalBot.getState();
	const [chips, setChips] = (0, import_react.useState)([]);
	const [pending, setPending] = (0, import_react.useState)(null);
	const permResolver = (0, import_react.useRef)(null);
	const abortRef = (0, import_react.useRef)(null);
	const scroller = (0, import_react.useRef)(null);
	const fileInput = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
	}, [
		session?.messages.length,
		chips.length,
		pending,
		session?.running
	]);
	(0, import_react.useEffect)(() => {
		setChips([]);
		setPending(null);
	}, [selected]);
	if (!bot) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-1 items-center justify-center text-sm text-muted",
		children: "Select an agent"
	});
	const running = Boolean(session?.running);
	const ctx = resolveBot(snap, bot.id);
	const send = async (text) => {
		const trimmed = text.trim();
		if (!trimmed || running) return;
		setUi({ composer: "" });
		appendMessage(bot.id, {
			role: "user",
			content: trimmed
		});
		const mentions = [...trimmed.matchAll(/@([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
		for (const name of mentions) {
			if (name.toLowerCase() === bot.name.toLowerCase()) continue;
			const result = await handoffTask(bot.id, name, trimmed);
			if (result.ok) appendMessage(bot.id, {
				role: "system",
				content: `Handed work to ${name} via ${result.path}`,
				handoffTo: result.toBotId
			});
		}
		const ac = new AbortController();
		abortRef.current = ac;
		setChips([]);
		setRunning(bot.id, true);
		const live = [];
		const result = await runAgentLoop({
			botId: bot.id,
			userText: trimmed,
			abort: ac.signal,
			events: {
				onChip: (chip) => {
					live.push(chip);
					setChips([...live]);
				},
				onChipUpdate: (id, patch) => {
					const i = live.findIndex((c) => c.id === id);
					if (i >= 0) live[i] = {
						...live[i],
						...patch
					};
					setChips([...live]);
				},
				askPermission: (req) => new Promise((resolve) => {
					permResolver.current = resolve;
					setPending(req);
					useLocalBot.getState().setUi({ pendingPermission: req });
				})
			}
		});
		setPending(null);
		useLocalBot.getState().setUi({ pendingPermission: null });
		setRunning(bot.id, false);
		const last = [...useLocalBot.getState().sessions[bot.id]?.messages ?? []].reverse().find((m) => m.role === "assistant");
		if (last && live.length > 0) useLocalBot.getState().patchMessage(bot.id, last.id, { chips: [...live] });
		setChips([]);
		if (result.stopped) appendMessage(bot.id, {
			role: "system",
			content: "Stopped."
		});
		else if (result.error) appendMessage(bot.id, {
			role: "assistant",
			content: result.error
		});
	};
	const decide = (d) => {
		permResolver.current?.(d);
		permResolver.current = null;
		setPending(null);
		useLocalBot.getState().setUi({ pendingPermission: null });
	};
	const onAttach = async (file) => {
		const text = await file.text();
		const path = `${bot.workspacePath}/${file.name}`;
		const r = await writeBotFile(bot.id, path, text);
		appendMessage(bot.id, {
			role: "system",
			content: r.ok ? `Attached ${file.name} into workspace.` : `Could not attach ${file.name}: ${r.error}`
		});
	};
	const messages = session?.messages ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex min-w-0 flex-1 flex-col bg-bg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex h-12 shrink-0 items-center gap-3 border-b border-border px-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AgentAvatar, {
						bot,
						size: "sm"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
								className: "truncate text-sm font-medium",
								children: bot.name
							}), running && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shimmer-text font-mono text-[10px] tracking-wider uppercase",
								children: "Working"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "truncate text-[11px] text-muted",
							children: bot.job
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `hidden rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase md:inline ${aiAvailable ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`,
						children: aiAvailable ? "Hosted grok-4.5" : "AI unavailable"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: running ? "danger" : "ghost",
						size: "sm",
						onClick: () => {
							abortRef.current?.abort();
							requestStop(bot.id);
						},
						disabled: !running,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-3.5" }), "Stop"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Show computer",
						onClick: () => setUi({ showComputer: !showComputer }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Monitor, { className: "size-4" })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				ref: scroller,
				className: "min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin md:px-8",
				children: [messages.length === 0 && !running && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, {
					botName: bot.name,
					onPick: (t) => void send(t)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
					className: "mx-auto flex max-w-2xl flex-col gap-4",
					children: [
						messages.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: m.role === "user" ? "ml-8" : "mr-4",
							children: m.role === "system" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono text-[11px] text-subtle",
								children: m.content
							}) : m.role === "user" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "rounded-lg bg-raised px-3.5 py-2.5 shadow-[0_0_0_1px_var(--color-border)]",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm leading-relaxed whitespace-pre-wrap",
									children: m.content
								})
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [m.chips && m.chips.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChipRow, { chips: m.chips }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMarkdown, { text: m.content })] })
						}, m.id)),
						(running || chips.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "mr-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChipRow, { chips }), running && chips.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "shimmer-text text-sm",
								children: "Thinking"
							})]
						}),
						pending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PermissionCard, {
							req: pending,
							allowed: true,
							onDecide: decide
						}) })
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border px-3 py-3 md:px-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-2xl rounded-xl bg-surface p-2 shadow-[0_0_0_1px_var(--color-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						value: composer,
						onChange: (e) => setUi({ composer: e.target.value }),
						onKeyDown: (e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send(composer);
							}
						},
						rows: 2,
						placeholder: `Message ${bot.name} — @name to hand off`,
						className: "w-full resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-none"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between px-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									ref: fileInput,
									type: "file",
									className: "hidden",
									onChange: (e) => {
										const f = e.target.files?.[0];
										if (f) onAttach(f);
										e.target.value = "";
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									size: "icon-sm",
									"aria-label": "Attach file",
									onClick: () => fileInput.current?.click(),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Paperclip, { className: "size-4" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MentionHint, {})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							disabled: !composer.trim() || running,
							onClick: () => void send(composer),
							children: "Send"
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mx-auto mt-2 max-w-2xl font-mono text-[10px] text-subtle",
					children: ctx ? `computer · ${bot.workspacePath}` : "workspace"
				})]
			})
		]
	});
}
function Empty({ botName, onPick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto flex max-w-lg flex-col items-start py-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "text-sm text-muted",
			children: [botName, " is ready. Work stays in the workspace. Try one of these:"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-4 flex flex-col gap-2",
			children: SUGGESTIONS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onPick(s),
				className: "rounded-md bg-surface px-3 py-2 text-left text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-raised",
				children: s
			}, s))
		})]
	});
}
function ChipRow({ chips }) {
	if (chips.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mb-2 flex flex-wrap gap-1.5",
		children: chips.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: `inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] ${c.status === "denied" ? "text-danger" : c.status === "running" ? "text-accent" : "text-muted"}`,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChipIcon, { kind: c.kind }),
				c.label,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "max-w-[180px] truncate font-mono text-[10px] text-subtle",
					children: c.detail
				})
			]
		}, c.id))
	});
}
function ChipIcon({ kind }) {
	const cls = "size-3";
	if (kind === "shell") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Terminal, { className: cls });
	if (kind === "edit" || kind === "write") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePenLine, { className: cls });
	if (kind === "network" || kind === "browser") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Globe, { className: cls });
	if (kind === "delete") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { className: cls });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileSearch, { className: cls });
}
function PermissionCard({ req, allowed, onDecide }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl bg-raised p-4 shadow-[0_0_0_1px_var(--color-border-strong)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
				children: "Permission"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mt-1 text-sm font-medium",
				children: req.summary
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 font-mono text-xs leading-relaxed break-all text-muted",
				children: req.detail
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => onDecide("deny"),
					children: "Deny"
				}), allowed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => onDecide("allow-once"),
					children: "Allow once"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					onClick: () => onDecide("allow-chat"),
					children: "Allow for this chat"
				})] })]
			})
		]
	});
}
function MentionHint() {
	const bots = useLocalBot((s) => s.bots).filter((b) => !b.hidden);
	const composer = useLocalBot((s) => s.ui.composer);
	const setUi = useLocalBot((s) => s.setUi);
	const at = composer.lastIndexOf("@");
	if (at < 0) return null;
	const q = composer.slice(at + 1).split(/\s/)[0] ?? "";
	if (composer.slice(at).includes(" ") && q.length === 0) return null;
	const matches = bots.filter((b) => b.name.toLowerCase().startsWith(q.toLowerCase()));
	if (matches.length === 0) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex gap-1",
		children: matches.slice(0, 3).map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "rounded-sm px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-hover",
			onClick: () => {
				const next = composer.slice(0, at) + `@${b.name} `;
				setUi({ composer: next });
			},
			children: ["@", b.name]
		}, b.id))
	});
}
function ComputerPane() {
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bots = useLocalBot((s) => s.bots);
	const bot = bots.find((b) => b.id === selected) ?? null;
	const previewPath = useLocalBot((s) => s.ui.previewPath);
	const company = useLocalBot((s) => s.company);
	const employees = useLocalBot((s) => s.employees);
	const departments = useLocalBot((s) => s.departments);
	const show = useLocalBot((s) => s.ui.showComputer);
	const diskEpoch = useLocalBot((s) => s.diskEpoch);
	const ctx = bot && company ? resolveBot({
		bots,
		employees,
		departments,
		company
	}, bot.id) : null;
	if (!show) return null;
	if (!bot || !ctx || !company) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", { className: "hidden h-full w-[280px] shrink-0 border-l border-border bg-surface lg:block" });
	const shared = bot.grants.includes("shared") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const outbox = grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox");
	const copyPath = async (path) => {
		try {
			await navigator.clipboard.writeText(path);
		} catch {}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "flex h-full min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface md:w-[300px] md:border-t-0 md:border-l",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-12 items-center justify-between px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
					children: "Computer"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => void copyPath(outbox),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inbox, { className: "size-3.5" }), "Outbox"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "workspace",
						root: bot.workspacePath,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-3.5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "output",
						root: bot.outputPath,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "size-3.5" })
					}),
					shared && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "shared",
						root: shared,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Share2, { className: "size-3.5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "outbox",
						root: outbox,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inbox, { className: "size-3.5" })
					}),
					previewPath && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DiskPreview, {
						path: previewPath,
						companyRoot: company.root,
						epoch: diskEpoch
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-t border-border px-3 py-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void copyPath(bot.workspacePath),
					className: "w-full text-left font-mono text-[10px] leading-relaxed text-subtle hover:text-muted",
					children: "Reveal path — copies the workspace location"
				})
			})
		]
	});
}
function TreeSection({ title, root, companyRoot, epoch, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mb-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-wider text-subtle uppercase",
			children: [icon, title]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileTree, {
			path: root,
			companyRoot,
			epoch,
			depth: 0
		})]
	});
}
function FileTree({ path, companyRoot, epoch, depth }) {
	const setUi = useLocalBot((s) => s.setUi);
	const preview = useLocalBot((s) => s.ui.previewPath);
	const [open, setOpen] = (0, import_react.useState)(depth < 1);
	const [children, setChildren] = (0, import_react.useState)(null);
	const [missing, setMissing] = (0, import_react.useState)(false);
	const [isFile, setIsFile] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		fsList({ data: {
			path,
			companyRoot
		} }).then((r) => {
			if (cancelled) return;
			if (r.ok) {
				setChildren(r.entries);
				setIsFile(false);
				setMissing(false);
				return;
			}
			if (/Not a directory/i.test(r.error)) {
				setIsFile(true);
				setMissing(false);
				setChildren([]);
				return;
			}
			setMissing(true);
			setChildren([]);
		});
		return () => {
			cancelled = true;
		};
	}, [
		path,
		companyRoot,
		epoch
	]);
	if (missing) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-2 py-1 text-[11px] text-subtle",
		children: "Folder not created yet."
	});
	if (isFile) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setUi({ previewPath: path }),
		className: `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${preview === path ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"}`,
		style: { paddingLeft: 8 + depth * 10 },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "size-3 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate",
			children: posixBasename(path)
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setOpen((v) => !v),
		className: "flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-[12px] text-muted hover:bg-hover hover:text-fg",
		style: { paddingLeft: 8 + depth * 10 },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: `size-3 transition-transform duration-150 ${open ? "rotate-90" : ""}` }),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, { className: "size-3" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "truncate",
				children: posixBasename(path)
			})
		]
	}), open && (children ?? []).map((c) => c.kind === "file" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setUi({ previewPath: c.path }),
		className: `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${preview === c.path ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"}`,
		style: { paddingLeft: 8 + (depth + 1) * 10 },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "size-3 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate",
			children: c.name
		})]
	}, c.path) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileTree, {
		path: c.path,
		companyRoot,
		epoch,
		depth: depth + 1
	}, c.path))] });
}
function DiskPreview({ path, companyRoot, epoch }) {
	const [text, setText] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		fsRead({ data: {
			path,
			companyRoot
		} }).then((r) => {
			if (cancelled) return;
			setText(r.ok ? r.content.slice(0, 2500) : "");
		});
		return () => {
			cancelled = true;
		};
	}, [
		path,
		companyRoot,
		epoch
	]);
	if (!text) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-1 truncate font-mono text-[10px] text-subtle",
			children: posixBasename(path)
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
			className: "max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap",
			children: text
		})]
	});
}
function NewAgentDialog() {
	const open = useLocalBot((s) => s.ui.newAgentOpen);
	const setUi = useLocalBot((s) => s.setUi);
	const createBot = useLocalBot((s) => s.createBot);
	const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
	const bots = useLocalBot((s) => s.bots);
	const [name, setName] = (0, import_react.useState)("");
	const [job, setJob] = (0, import_react.useState)("");
	const [color, setColor] = (0, import_react.useState)("steel");
	if (!open) return null;
	const submit = () => {
		const n = name.trim() || `Agent ${bots.length + 1}`;
		createBot({
			name: n,
			job: job.trim() || "Generalist",
			color,
			modelId: selectedCatalogId ?? "gemma4-e2b-q4",
			extraGrants: ["shared"]
		});
		setName("");
		setJob("");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-lg font-medium tracking-tight",
					children: "New agent"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Each agent gets a workspace, memory, and output folder."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-4 block text-xs font-medium text-muted",
					children: ["Name", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1.5",
						value: name,
						onChange: (e) => setName(e.target.value),
						placeholder: "Researcher"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-3 block text-xs font-medium text-muted",
					children: ["Job", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "mt-1.5",
						value: job,
						onChange: (e) => setJob(e.target.value),
						placeholder: "Sources into shared/"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium text-muted",
						children: "Color"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex gap-2",
						children: AGENT_COLOR_LIST.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorSwatch, {
							hex: c.hex,
							selected: color === c.id,
							onClick: () => setColor(c.id)
						}, c.id))
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex justify-end gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						onClick: () => setUi({ newAgentOpen: false }),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: submit,
						children: "Create"
					})]
				})
			]
		})
	});
}
function CommandPalette() {
	const open = useLocalBot((s) => s.ui.commandOpen);
	const setUi = useLocalBot((s) => s.setUi);
	const bots = useLocalBot((s) => s.bots).filter((b) => !b.hidden);
	const selectBot = useLocalBot((s) => s.selectBot);
	const [q, setQ] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		const onKey = (e) => {
			const meta = e.metaKey || e.ctrlKey;
			if (meta && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setUi({ commandOpen: !useLocalBot.getState().ui.commandOpen });
			}
			if (meta && e.key.toLowerCase() === "n") {
				e.preventDefault();
				setUi({
					newAgentOpen: true,
					commandOpen: false
				});
			}
			if (meta && e.key === ",") {
				e.preventDefault();
				setUi({
					showSettings: true,
					commandOpen: false
				});
			}
			if (e.key === "Escape") setUi({
				commandOpen: false,
				showSettings: false,
				newAgentOpen: false
			});
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [setUi]);
	const actions = (0, import_react.useMemo)(() => {
		const list = [
			{
				id: "new",
				label: "New agent",
				hint: "⌘N",
				run: () => setUi({
					newAgentOpen: true,
					commandOpen: false
				})
			},
			{
				id: "settings",
				label: "Settings",
				hint: "⌘,",
				run: () => setUi({
					showSettings: true,
					commandOpen: false
				})
			},
			{
				id: "computer",
				label: "Toggle computer pane",
				hint: "",
				run: () => setUi({
					showComputer: !useLocalBot.getState().ui.showComputer,
					commandOpen: false
				})
			}
		];
		for (const b of bots) list.push({
			id: b.id,
			label: `Open ${b.name}`,
			hint: b.job,
			run: () => {
				selectBot(b.id);
				setUi({ commandOpen: false });
			}
		});
		const n = q.trim().toLowerCase();
		return n ? list.filter((a) => a.label.toLowerCase().includes(n)) : list;
	}, [
		bots,
		q,
		selectBot,
		setUi
	]);
	if (!open) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 flex items-start justify-center bg-bg/60 pt-[18vh] backdrop-blur-[2px]",
		onClick: () => setUi({ commandOpen: false }),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-lg overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				autoFocus: true,
				value: q,
				onChange: (e) => setQ(e.target.value),
				placeholder: "Jump to an agent or action",
				className: "h-12 w-full bg-transparent px-4 text-sm text-fg placeholder:text-subtle focus-visible:outline-none"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "max-h-72 overflow-y-auto border-t border-border py-1 scrollbar-thin",
				children: actions.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: a.run,
					className: "flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-hover",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: a.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[10px] text-subtle",
						children: a.hint
					})]
				}) }, a.id))
			})]
		})
	});
}
var TABS = [
	["general", "General"],
	["models", "Models"],
	["company", "Company"],
	["runtime", "Runtime"],
	["safety", "Safety"]
];
function SettingsDialog() {
	const open = useLocalBot((s) => s.ui.showSettings);
	const tab = useLocalBot((s) => s.ui.settingsTab);
	const setUi = useLocalBot((s) => s.setUi);
	if (!open) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-start justify-center bg-bg/70 p-3 pt-[8vh] backdrop-blur-[2px] md:p-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between border-b border-border px-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex gap-1 overflow-x-auto",
					children: TABS.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setUi({ settingsTab: id }),
						className: `h-12 shrink-0 px-3 text-sm ${tab === id ? "text-fg" : "text-muted hover:text-fg"}`,
						children: [label, tab === id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mt-1 block h-0.5 rounded-full bg-accent" })]
					}, id))
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "icon-sm",
					"aria-label": "Close settings",
					onClick: () => setUi({ showSettings: false }),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin",
				children: [
					tab === "general" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GeneralPane, {}),
					tab === "models" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelsPane, {}),
					tab === "company" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompanyPane, {}),
					tab === "runtime" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuntimePane, {}),
					tab === "safety" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SafetyPane, {})
				]
			})]
		})
	});
}
function GeneralPane() {
	const company = useLocalBot((s) => s.company);
	const employee = useLocalBot((s) => s.employees[0]);
	const renameCompany = useLocalBot((s) => s.renameCompany);
	const resetAll = useLocalBot((s) => s.resetAll);
	const preview = useLocalBot((s) => s.previewWritesToProjectData);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "Company name",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					defaultValue: company?.name ?? "",
					onBlur: (e) => renameCompany(e.target.value)
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "Employee",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-fg",
					children: employee?.displayName ?? "—"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "This build",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm leading-relaxed text-muted",
					children: "Browser app. Chat uses hosted grok-4.5. Work files live on disk at the company root. There is no local GGUF and no desktop installer."
				})
			}),
			preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs leading-relaxed text-muted",
				children: "This preview writes to the project data folder."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "danger",
				onClick: () => resetAll(),
				children: "Reset this workspace"
			})
		]
	});
}
function ModelsPane() {
	const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "Planned local models. Not wired in this build. Chat ignores this list and uses hosted grok-4.5. No GGUF is downloaded."
			}),
			selectedCatalogId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-mono text-xs text-muted",
				children: ["Catalog noted: ", selectedCatalogId]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Catalog"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2",
				children: CATALOG.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between gap-3 rounded-md px-3 py-2 opacity-70 shadow-[0_0_0_1px_var(--color-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm",
						children: m.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[11px] text-muted",
						children: [
							m.sizeLabel,
							" · ",
							m.license,
							" · ",
							m.tier
						]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-mono text-[10px] text-subtle",
						children: "Not wired"
					})]
				}, m.id))
			})
		]
	});
}
function CompanyPane() {
	const departments = useLocalBot((s) => s.departments);
	const employees = useLocalBot((s) => s.employees);
	const bots = useLocalBot((s) => s.bots);
	const settings = useLocalBot((s) => s.settings);
	const company = useLocalBot((s) => s.company);
	const setCompanyRootShared = useLocalBot((s) => s.setCompanyRootShared);
	const setBotGrants = useLocalBot((s) => s.setBotGrants);
	const createBot = useLocalBot((s) => s.createBot);
	const createDepartment = useLocalBot((s) => s.createDepartment);
	const createEmployee = useLocalBot((s) => s.createEmployee);
	const moveBotToEmployee = useLocalBot((s) => s.moveBotToEmployee);
	const applyCompanyRoot = useLocalBot((s) => s.applyCompanyRoot);
	const seedFoldersHere = useLocalBot((s) => s.seedFoldersHere);
	const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
	const preview = useLocalBot((s) => s.previewWritesToProjectData);
	const [path, setPath] = (0, import_react.useState)(company?.root ?? "");
	const [msg, setMsg] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setPath(company?.root ?? "");
		fsGetCompanyRoot().then((cfg) => {
			if (!company?.root) setPath(cfg.companyRoot);
		});
	}, [company?.root]);
	const copyPath = async () => {
		try {
			await navigator.clipboard.writeText(path);
			setMsg("Path copied.");
		} catch {
			setMsg(path);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "Company root (absolute path)",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "font-mono text-xs",
					value: path,
					onChange: (e) => setPath(e.target.value)
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						size: "sm",
						onClick: async () => {
							const r = await applyCompanyRoot(path);
							setMsg(r.ok ? `Using ${r.root}` : r.error);
						},
						children: "Use this path"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						size: "sm",
						onClick: async () => {
							const r = await seedFoldersHere();
							setMsg(r.ok ? "Folders created on disk." : r.error);
						},
						children: "Create folders here"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => void copyPath(),
						children: "Reveal path"
					})
				]
			}),
			preview && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted",
				children: "This preview writes to the project data folder."
			}),
			msg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-mono text-xs text-muted",
				children: msg
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "flex items-center gap-2 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: "size-4 accent-accent",
					checked: settings.companyRootIsShared,
					onChange: (e) => setCompanyRootShared(e.target.checked)
				}), "This path is a shared drive"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted",
				children: "Two people see the same files only if this process and theirs point at the same real folder (NAS / Drive / shared disk) on the machine running the server. This checkbox only changes the copy."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => void createDepartment("Research"),
					children: "Add department"
				}), departments[0] && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => void createEmployee(departments[0].id, "Teammate"),
					children: "Add employee"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Agents & grants"
			}),
			bots.map((bot) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md bg-raised p-3 shadow-[0_0_0_1px_var(--color-border)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-medium",
						children: bot.name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						className: "h-8 rounded-sm bg-bg px-2 text-xs text-fg shadow-[0_0_0_1px_var(--color-border)]",
						value: bot.employeeId,
						onChange: (e) => void moveBotToEmployee(bot.id, e.target.value),
						children: employees.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: e.id,
							children: e.displayName
						}, e.id))
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex flex-wrap gap-2",
					children: [
						"workspace",
						"output",
						"shared",
						"outbox",
						"company-shared"
					].map((g) => {
						const on = bot.grants.includes(g);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								const next = on ? bot.grants.filter((x) => x !== g) : [...bot.grants, g];
								setBotGrants(bot.id, next);
							},
							className: `rounded-full px-2.5 py-1 text-[11px] ${on ? "bg-accent/15 text-accent" : "bg-bg text-muted"}`,
							children: g
						}, g);
					})
				})]
			}, bot.id)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "sm",
				onClick: () => void createBot({
					name: `Agent ${bots.length + 1}`,
					job: "Generalist",
					color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length].id,
					modelId: selectedCatalogId ?? "gemma4-e2b-q4"
				}),
				children: "New agent"
			})
		]
	});
}
function RuntimePane() {
	const runtime = useLocalBot((s) => s.runtime);
	const company = useLocalBot((s) => s.company);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Engine",
				v: runtime.engine
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Chat model",
				v: runtime.model
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "AI status",
				v: runtime.aiAvailable ? "Hosted grok-4.5" : "AI unavailable"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Company root",
				v: company?.root ?? "—"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "This is a browser app. Agents think with hosted grok-4.5 when the server has an API key. There is no local llama.cpp process and no GGUF download. File tools write to the company root on the machine running this server."
			})
		]
	});
}
function SafetyPane() {
	const settings = useLocalBot((s) => s.settings);
	const updateSettings = useLocalBot((s) => s.updateSettings);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "flex items-start gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "checkbox",
				className: "mt-1 size-4 accent-accent",
				checked: settings.webSearchEnabled,
				onChange: (e) => updateSettings({ webSearchEnabled: e.target.checked })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "block text-sm",
				children: "Web search"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-xs text-muted",
				children: "Off by default. Network always asks."
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "rounded-md bg-danger/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: "mt-1 size-4 accent-danger",
					checked: settings.controlThisComputer,
					onChange: (e) => updateSettings({ controlThisComputer: e.target.checked })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "block text-sm text-danger",
					children: "Control this computer"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-muted",
					children: "Off. Turns off permission cards for the workspace shell. Still scoped to the company root."
				})] })]
			})
		})]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs font-medium text-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1.5",
			children
		})]
	});
}
function Row({ k, v }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-baseline justify-between gap-4 border-b border-border py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs text-muted",
			children: k
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "max-w-[70%] text-right font-mono text-xs break-all text-fg",
			children: v
		})]
	});
}
function Sidebar() {
	const bots = useLocalBot((s) => s.bots).filter((b) => !b.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const sessions = useLocalBot((s) => s.sessions);
	const selectBot = useLocalBot((s) => s.selectBot);
	const pinBot = useLocalBot((s) => s.pinBot);
	const hideBot = useLocalBot((s) => s.hideBot);
	const duplicateBot = useLocalBot((s) => s.duplicateBot);
	const deleteBot = useLocalBot((s) => s.deleteBot);
	const setUi = useLocalBot((s) => s.setUi);
	const company = useLocalBot((s) => s.company);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-border bg-surface",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-12 items-center justify-between px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, { className: "text-sm" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "icon-sm",
					"aria-label": "Settings",
					onClick: () => setUi({ showSettings: true }),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { className: "size-4" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-3 pb-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate font-mono text-[10px] tracking-wider text-subtle uppercase",
					children: company?.name ?? "LocalBot"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 overflow-y-auto px-1.5 scrollbar-thin",
				children: [bots.map((bot) => {
					const active = selected === bot.id;
					const last = sessions[bot.id]?.messages.at(-1);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: `group relative mb-0.5 flex items-center rounded-md ${active ? "bg-raised" : "hover:bg-hover"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => selectBot(bot.id),
							className: "flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "relative",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AgentAvatar, {
										bot,
										size: "sm"
									}), bot.unread > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent" })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex items-center gap-1.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "truncate text-sm font-medium text-fg",
											children: bot.name
										}), bot.pinned && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pin, { className: "size-3 text-subtle" })]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block truncate text-[11px] text-muted",
										children: last?.content?.slice(0, 48) || bot.job
									})]
								}),
								last && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] text-subtle tabular-nums",
									children: formatRelative(last.createdAt)
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
							className: "relative mr-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
								className: "flex size-8 list-none items-center justify-center rounded-sm text-subtle opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 [&::-webkit-details-marker]:hidden",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { className: "size-4" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "absolute top-8 right-0 z-20 w-40 rounded-md bg-raised py-1 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => pinBot(bot.id, !bot.pinned),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pin, { className: "size-3.5" }),
											" ",
											bot.pinned ? "Unpin" : "Pin"
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => void duplicateBot(bot.id),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-3.5" }), " Duplicate"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => hideBot(bot.id, true),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "size-3.5" }), " Hide"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => void deleteBot(bot.id),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" }), " Delete"]
									})
								]
							})]
						})]
					}, bot.id);
				}), bots.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-3 py-6 text-sm text-muted",
					children: "No agents yet."
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-border p-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "secondary",
					className: "w-full",
					onClick: () => setUi({ newAgentOpen: true }),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), "New agent"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 px-1 font-mono text-[10px] text-subtle",
					children: "Hosted grok-4.5"
				})]
			})
		]
	});
}
function MenuItem({ children, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover",
		children
	});
}
function AppShell() {
	const setUi = useLocalBot((s) => s.setUi);
	const agentsOpen = useLocalBot((s) => s.ui.agentsOpen);
	const showComputer = useLocalBot((s) => s.ui.showComputer);
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bots = useLocalBot((s) => s.bots);
	(0, import_react.useEffect)(() => {
		if (!selected) {
			const first = bots.find((b) => !b.hidden) ?? bots[0];
			if (first) useLocalBot.getState().selectBot(first.id);
		}
	}, [selected, bots]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 md:hidden",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Agents",
						onClick: () => setUi({ agentsOpen: !agentsOpen }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Menu, { className: "size-4" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex-1 text-sm font-medium",
						children: "LocalBot"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "New agent",
						onClick: () => setUi({ newAgentOpen: true }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Computer",
						onClick: () => setUi({ showComputer: !showComputer }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Monitor, { className: "size-4" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Settings",
						onClick: () => setUi({ showSettings: true }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { className: "size-4" })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative flex min-h-0 flex-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: `${agentsOpen ? "flex" : "hidden"} absolute inset-0 z-20 md:static md:z-0 md:flex`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, {}), agentsOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "flex-1 bg-bg/50 md:hidden",
							"aria-label": "Close agents",
							onClick: () => setUi({ agentsOpen: false })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatPane, {}),
					showComputer && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:h-[50%] md:static",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComputerPane, {})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsDialog, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewAgentDialog, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandPalette, {})
		]
	});
}
function LocalBotApp() {
	const [ready, setReady] = (0, import_react.useState)(false);
	const onboarded = useLocalBot((s) => s.onboarded);
	const setAiAvailable = useLocalBot((s) => s.setAiAvailable);
	(0, import_react.useEffect)(() => {
		const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
		if (useLocalBot.persist.hasHydrated()) setReady(true);
		return unsub;
	}, []);
	(0, import_react.useEffect)(() => {
		if (!ready) return;
		getAiStatus().then((s) => setAiAvailable(s.available));
	}, [ready, setAiAvailable]);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-dvh items-center justify-center bg-bg text-fg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wordmark, { className: "text-lg opacity-80" })
	});
	if (!onboarded) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Onboarding, {});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LocalBotApp, {});
}
//#endregion
export { Home as component };
