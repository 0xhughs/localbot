import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "../index.js";
import { a as onboardingCards, n as CATALOG_PIN, r as getCatalogModel, t as CATALOG } from "./catalog-D9qvFKrt.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { ArrowLeft, ArrowRight, Ban, Check, ChevronRight, Copy, EyeOff, FilePenLine, FileSearch, FileText, Folder, FolderLock, FolderOpen, Globe, HardDrive, Inbox, Menu, Minus, Monitor, MoreHorizontal, Paperclip, Pause, Pin, Play, Plus, Settings, Share2, Shield, Square, Terminal, Trash2, X } from "lucide-react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { cva } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
//#region node_modules/@tanstack/start-server-core/dist/esm/createSsrRpc.js
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
//#endregion
//#region src/lib/runtime/turn.ts
var getAiStatus = createServerFn({ method: "POST" }).handler(createSsrRpc("4d014b7d5695cf271ecb6d606e4830cf820e40735c07c63b45eca84471656734"));
var runHarnessTurn = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("6532b4f18cc5bcc2361d69f45f2f84e2d4d87ad9ed8a519945f97f3260b8e7bc"));
//#endregion
//#region src/lib/utils.ts
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
//#endregion
//#region src/lib/fs/company.ts
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
//#endregion
//#region src/lib/fs/server.ts
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
//#endregion
//#region src/lib/mascots.ts
var MASCOT_IDS = [
	"writer",
	"researcher",
	"ops"
];
var MASCOT_META = {
	writer: {
		id: "writer",
		label: "Scrib",
		blurb: "Paper and pen",
		defaultColor: "sage"
	},
	researcher: {
		id: "researcher",
		label: "Lens",
		blurb: "Magnifier",
		defaultColor: "clay"
	},
	ops: {
		id: "ops",
		label: "Crate",
		blurb: "Gear and crate",
		defaultColor: "slate"
	}
};
function mascotIdForTemplate(name) {
	const n = name.trim().toLowerCase();
	if (n.includes("writer") || n.includes("draft") || n.includes("scrib")) return "writer";
	if (n.includes("research") || n.includes("lens")) return "researcher";
	if (n.includes("ops") || n.includes("crate")) return "ops";
	return "ops";
}
function isMascotId(v) {
	return v === "writer" || v === "researcher" || v === "ops";
}
//#endregion
//#region src/lib/permissions.ts
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
//#endregion
//#region src/lib/store.ts
var DEFAULT_SETTINGS = {
	darkMode: true,
	webSearchEnabled: false,
	controlThisComputer: false,
	denseUi: true,
	companyRootIsShared: false,
	allowHostedDemo: false,
	useExistingOllama: false
};
var DEFAULT_UI = {
	selectedBotId: null,
	showComputer: false,
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
			engine: "llama.cpp",
			model: "",
			aiAvailable: false,
			lastHeartbeat: null,
			ggufPath: null,
			loopback: null,
			ramEstimate: "—",
			badge: "Local model not ready"
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
	setRuntime: (patch) => set((s) => ({ runtime: {
		...s.runtime,
		...patch,
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
			mascotId: input.mascotId ?? mascotIdForTemplate(botName),
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
				showComputer: false
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
			mascotId: input.mascotId ?? mascotIdForTemplate(name),
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
			mascotId: src.mascotId,
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
	name: "localbot-state-v3",
	storage: createJSONStorage(() => memoryStorage),
	merge: (persisted, current) => {
		const p = persisted ?? {};
		const bots = (p.bots ?? current.bots).map((b) => ({
			...b,
			mascotId: isMascotId(b.mascotId) ? b.mascotId : mascotIdForTemplate(b.name ?? "")
		}));
		return {
			...current,
			...p,
			bots,
			settings: {
				...current.settings,
				...p.settings,
				allowHostedDemo: Boolean(p.settings?.allowHostedDemo),
				useExistingOllama: Boolean(p.settings?.useExistingOllama)
			}
		};
	},
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
//#endregion
//#region src/components/localbot/logo.tsx
function LogoMark({ className }) {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 32 32",
		className: cn("size-7", className),
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ jsx("rect", {
				width: "32",
				height: "32",
				rx: "8",
				fill: "currentColor",
				className: "text-accent"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "7",
				y: "8",
				width: "7",
				height: "16",
				rx: "2",
				fill: "#0a0b0d",
				opacity: "0.9"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M17.5 11h7.5v2.2H20v2.1h4.2v2.2H20V21h-2.5V11z",
				fill: "#0a0b0d"
			})
		]
	});
}
function Wordmark({ className }) {
	return /* @__PURE__ */ jsxs("span", {
		className: cn("flex items-center gap-2 font-medium tracking-tight", className),
		children: [/* @__PURE__ */ jsx(LogoMark, { className: "size-6" }), /* @__PURE__ */ jsxs("span", {
			className: "text-fg",
			children: ["Local", /* @__PURE__ */ jsx("span", {
				className: "text-muted",
				children: "Bot"
			})]
		})]
	});
}
//#endregion
//#region src/lib/hardware.ts
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
//#endregion
//#region src/lib/runtime/model-server.ts
var fsScanServerHardware = createServerFn({ method: "POST" }).handler(createSsrRpc("a10030064aa8cb2d1a66e8c1ba637b73d5b3dc705a6289627c80f7758fc1f92f"));
var modelDownloadStart = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("c6f65c16d8da84d6a4ad2ff8034e14b91f3ebd421fc676c72895f8752bbccfde"));
var modelDownloadStatus = createServerFn({ method: "POST" }).handler(createSsrRpc("0cfb78988111782633ceeb01ab5f9e0736aa02b2cd724cbbd61bb54dc9b98909"));
var modelDownloadPause = createServerFn({ method: "POST" }).handler(createSsrRpc("40e6e177fdc1ea80b599d36b38c9289f1b9ed31408636fad28e2df4f98f06f9f"));
var modelDownloadResume = createServerFn({ method: "POST" }).handler(createSsrRpc("21aeebc0ab0a4911fb4efe3f4690e0b2b215b90c1f7bd5174b9de93b5ae81277"));
var modelVerify = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("aa0cf80feb628d830e818e3bfd93b3aa2bbecce6a5055b7096c5fd2e72464032"));
var modelList = createServerFn({ method: "POST" }).handler(createSsrRpc("420cd8996fd4a20743089920e3ef7620d1193a44f16c1b84c8dc056db1d497d0"));
var modelImport = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("0c465437edd45d3f2bd2924494b9097eb2b16378c8acc1e1c0af4ce50fe26b81"));
var modelSetHostedDemo = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("216280aab065baa2c1570dec8fec91a193841d36f6d16c0753d315d8170f14ff"));
var modelSetOllama = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("8a65b429183ddd80c22c497da1b0bb7df13f24c14d8fdf07f0f217f9270350ef"));
var modelEngineStatus = createServerFn({ method: "POST" }).handler(createSsrRpc("1c9e314be70d5595ab05707502096bb9cfe6d4a037e7825b225ae227799fb911"));
createServerFn({ method: "POST" }).handler(createSsrRpc("1f289b3c13d0e081998b37de1b19fc322edfa4a1fb6a5ca1febc01cc8248b102"));
var AGENT_COLOR_LIST = Object.values({
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
});
//#endregion
//#region src/components/ui/button.tsx
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
	return /* @__PURE__ */ jsx(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
//#endregion
//#region src/components/ui/input.tsx
function Input({ className, ...props }) {
	return /* @__PURE__ */ jsx("input", {
		className: cn("h-10 w-full rounded-md bg-raised px-3 text-sm text-fg placeholder:text-subtle", "shadow-[0_0_0_1px_var(--color-border)]", "transition-[box-shadow] duration-150", "focus-visible:shadow-[0_0_0_2px_var(--color-accent)]", "disabled:opacity-40", className),
		...props
	});
}
//#endregion
//#region src/components/localbot/mascots/index.tsx
function MascotMark({ id, className }) {
	const cls = cn("size-full", className);
	if (id === "writer") return /* @__PURE__ */ jsx(WriterMascot, { className: cls });
	if (id === "researcher") return /* @__PURE__ */ jsx(ResearcherMascot, { className: cls });
	return /* @__PURE__ */ jsx(OpsMascot, { className: cls });
}
function WriterMascot({ className }) {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 32 32",
		className,
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ jsx("circle", {
				cx: "16",
				cy: "16",
				r: "15",
				fill: "var(--color-mascot-writer-bg)"
			}),
			/* @__PURE__ */ jsx("ellipse", {
				cx: "16",
				cy: "18",
				rx: "8.5",
				ry: "7",
				fill: "var(--color-mascot-writer)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "13",
				cy: "16.5",
				r: "1.15",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "19",
				cy: "16.5",
				r: "1.15",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M13.2 20.4c1.6 1.1 3.9 1.1 5.6 0",
				fill: "none",
				stroke: "var(--color-bg)",
				strokeWidth: "1.1",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M21.2 8.2 24.6 11.4 15.1 21.2l-3.6.6.7-3.5z",
				fill: "var(--color-fg)",
				opacity: "0.92"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M21.2 8.2 24.6 11.4 22.4 9.3z",
				fill: "var(--color-mascot-writer)"
			})
		]
	});
}
function ResearcherMascot({ className }) {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 32 32",
		className,
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ jsx("circle", {
				cx: "16",
				cy: "16",
				r: "15",
				fill: "var(--color-mascot-researcher-bg)"
			}),
			/* @__PURE__ */ jsx("ellipse", {
				cx: "15",
				cy: "17.5",
				rx: "8",
				ry: "6.6",
				fill: "var(--color-mascot-researcher)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "12.4",
				cy: "16.2",
				r: "1.1",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "17.6",
				cy: "16.2",
				r: "1.1",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M12.6 20.1c1.4.9 3.4.9 4.8 0",
				fill: "none",
				stroke: "var(--color-bg)",
				strokeWidth: "1.1",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "21.4",
				cy: "11.2",
				r: "4.1",
				fill: "none",
				stroke: "var(--color-fg)",
				strokeWidth: "1.7"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M24.4 14.2 27.4 17.3",
				fill: "none",
				stroke: "var(--color-fg)",
				strokeWidth: "1.8",
				strokeLinecap: "round"
			})
		]
	});
}
function OpsMascot({ className }) {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 32 32",
		className,
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ jsx("circle", {
				cx: "16",
				cy: "16",
				r: "15",
				fill: "var(--color-mascot-ops-bg)"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "8.5",
				y: "14",
				width: "15",
				height: "10",
				rx: "1.6",
				fill: "var(--color-mascot-ops)"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M8.5 17.2h15",
				stroke: "var(--color-bg)",
				strokeWidth: "1",
				opacity: "0.45"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "14.2",
				y: "16.6",
				width: "3.6",
				height: "2.4",
				rx: "0.4",
				fill: "var(--color-bg)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "16",
				cy: "11.2",
				r: "3.4",
				fill: "var(--color-fg)"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: "16",
				cy: "11.2",
				r: "1.35",
				fill: "var(--color-mascot-ops-bg)"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M16 7.4v1.3M16 13.7v1.3M12.2 11.2h1.3M18.5 11.2h1.3M13.3 8.5l.9.9M17.8 12.9l.9.9M18.7 8.5l-.9.9M13.3 12.9l-.9.9",
				stroke: "var(--color-fg)",
				strokeWidth: "1.15",
				strokeLinecap: "round"
			})
		]
	});
}
//#endregion
//#region src/components/localbot/avatar.tsx
function AgentAvatar({ bot, size = "md" }) {
	const mascot = isMascotId(bot.mascotId) ? bot.mascotId : mascotIdForTemplate(bot.name);
	return /* @__PURE__ */ jsx("span", {
		className: cn("inline-flex shrink-0 overflow-hidden rounded-full", size === "xs" ? "size-6" : size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-9"),
		"aria-hidden": true,
		title: bot.name,
		children: /* @__PURE__ */ jsx(MascotMark, { id: mascot })
	});
}
function ColorSwatch({ hex, selected, onClick }) {
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		onClick,
		className: cn("size-7 rounded-sm transition-transform duration-150", selected && "ring-2 ring-fg ring-offset-2 ring-offset-bg"),
		style: { backgroundColor: hex },
		"aria-label": hex
	});
}
//#endregion
//#region src/components/localbot/onboarding.tsx
var TEMPLATES = [
	{
		name: "Writer",
		job: "Turn notes into drafts, briefs, and outbox deliverables.",
		color: "sage",
		mascotId: "writer"
	},
	{
		name: "Researcher",
		job: "Gather sources into the department shared folder.",
		color: "clay",
		mascotId: "researcher"
	},
	{
		name: "Ops",
		job: "Keep the workspace organized and file the finished work.",
		color: "slate",
		mascotId: "ops"
	}
];
var WELCOME = [
	{
		id: "hello",
		title: "Your agents, on this computer.",
		body: "LocalBot is a chat of named agents. Each one has its own workspace folder on this machine."
	},
	{
		id: "stay",
		title: "Chat is a local model file.",
		body: "No account. No API key on the default path. The model is a GGUF on this machine. Work files go on disk under the company root."
	},
	{
		id: "grants",
		title: "Agents only touch folders you grant.",
		body: "The company root is a real directory. Two people share work only if they point at the same real folder on this machine."
	}
];
function Onboarding() {
	const [step, setStep] = useState("hello");
	const hardware = useLocalBot((s) => s.hardware);
	const setHardware = useLocalBot((s) => s.setHardware);
	const noteCatalog = useLocalBot((s) => s.noteCatalog);
	const completeOnboarding = useLocalBot((s) => s.completeOnboarding);
	const [scanning, setScanning] = useState(false);
	const [picked, setPicked] = useState(null);
	const [company, setCompany] = useState("Studio");
	const [department, setDepartment] = useState("Operations");
	const [employee, setEmployee] = useState("You");
	const [shared, setShared] = useState(false);
	const [botName, setBotName] = useState("Writer");
	const [botJob, setBotJob] = useState(TEMPLATES[0].job);
	const [color, setColor] = useState("sage");
	const [mascotId, setMascotId] = useState("writer");
	const [companyRoot, setCompanyRoot] = useState("");
	const [rootTouched, setRootTouched] = useState(false);
	const [previewData, setPreviewData] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);
	const [browserGuess, setBrowserGuess] = useState(null);
	const cards = useMemo(() => hardware ? onboardingCards(hardware) : null, [hardware]);
	useEffect(() => {
		fsGetCompanyRoot().then((cfg) => {
			setPreviewData(cfg.previewWritesToProjectData);
			if (!rootTouched) setCompanyRoot(cfg.defaultRoot);
		});
	}, [rootTouched]);
	useEffect(() => {
		if (rootTouched) return;
		fsGetCompanyRoot().then((cfg) => {
			const base = cfg.defaultRoot.replace(/[/\\][^/\\]+$/, "");
			setCompanyRoot(`${base}/${company.trim() || "Studio"}`);
		});
	}, [company, rootTouched]);
	useEffect(() => {
		if (step !== "scan") return;
		setScanning(true);
		const guess = scanBrowserHardware();
		setBrowserGuess(`${guess.totalRamGb} GB (browser guess, source ${guess.ramSource})`);
		fsScanServerHardware().then((hw) => {
			setHardware(hw);
			setScanning(false);
		}).catch(() => {
			setHardware(guess);
			setScanning(false);
		});
	}, [step, setHardware]);
	const pickModel = (id) => {
		setPicked(id);
		noteCatalog(id);
		setStep("download");
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex min-h-dvh flex-col bg-bg text-fg",
		children: [/* @__PURE__ */ jsxs("header", {
			className: "flex items-center justify-between px-5 py-4 md:px-8",
			children: [/* @__PURE__ */ jsx(Wordmark, {}), /* @__PURE__ */ jsx("span", {
				className: "font-mono text-[11px] tracking-wide text-subtle uppercase",
				children: "First run"
			})]
		}), /* @__PURE__ */ jsxs("main", {
			className: "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-5 pb-10 md:px-8",
			children: [
				WELCOME.some((w) => w.id === step) && /* @__PURE__ */ jsx(Welcome, {
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
				step === "scan" && /* @__PURE__ */ jsx(ScanStep, {
					scanning,
					browserGuess,
					onContinue: () => setStep("models"),
					onBack: () => setStep("grants")
				}),
				step === "models" && cards && hardware && /* @__PURE__ */ jsx(ModelStep, {
					cards,
					onPick: pickModel,
					onBack: () => setStep("scan")
				}),
				step === "download" && picked && /* @__PURE__ */ jsx(DownloadStep, {
					catalogId: picked,
					onBack: () => setStep("models"),
					onReady: () => setStep("agent")
				}),
				step === "agent" && /* @__PURE__ */ jsx(AgentStep, {
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
					mascotId,
					setMascotId,
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
						setMascotId(t.mascotId);
					},
					onBack: () => setStep("download"),
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
							mascotId,
							modelId: picked ?? "qwen25-05b-q4",
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
	return /* @__PURE__ */ jsxs("section", {
		className: "stagger-in flex flex-1 flex-col justify-center py-4",
		children: [
			/* @__PURE__ */ jsxs("p", {
				className: "mb-6 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: [idx + 1, " / 3"]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mb-6 flex size-12 items-center justify-center rounded-lg bg-raised text-accent shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ jsx(Icon, {
					className: "size-5",
					strokeWidth: 1.6
				})
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "max-w-xl text-3xl leading-tight font-medium tracking-tight md:text-4xl",
				children: screen.title
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-4 max-w-xl text-base leading-relaxed text-muted",
				children: screen.body
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-10 flex gap-3",
				children: [idx > 0 && /* @__PURE__ */ jsxs(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ jsx(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ jsxs(Button, {
					onClick: onNext,
					children: ["Continue", /* @__PURE__ */ jsx(ArrowRight, { className: "size-4" })]
				})]
			})
		]
	});
}
function ScanStep({ scanning, browserGuess, onContinue, onBack }) {
	const hardware = useLocalBot((s) => s.hardware);
	return /* @__PURE__ */ jsxs("section", {
		className: "stagger-in flex flex-1 flex-col justify-center py-4",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Hardware"
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "This machine"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-2 max-w-xl text-sm leading-relaxed text-muted",
				children: "Server RAM and disk from Node. Catalog recommendations use these numbers, not the browser guess."
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-8 overflow-hidden rounded-xl bg-surface p-1 shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ jsx("dl", {
					className: "grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0",
					children: [
						["OS", scanning ? "…" : hardware?.platformLabel],
						["CPU cores", scanning ? "…" : String(hardware?.cores ?? "—")],
						["RAM", scanning ? "…" : hardware ? `${hardware.totalRamGb.toFixed(1)} GB total · ${hardware.availableRamGb.toFixed(1)} GB free (${hardware.ramSource})` : "—"],
						["GPU / CPU", scanning ? "…" : hardware?.gpuName ?? "None detected"],
						["Apple Silicon", scanning ? "…" : hardware?.appleSilicon ? "Yes" : "No"],
						["Free disk", scanning ? "…" : hardware ? `${hardware.freeDiskGb.toFixed(0)} GB` : "—"]
					].map(([k, v]) => /* @__PURE__ */ jsxs("div", {
						className: "px-4 py-3",
						children: [/* @__PURE__ */ jsx("dt", {
							className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
							children: k
						}), /* @__PURE__ */ jsx("dd", {
							className: "mt-1 text-sm text-fg",
							children: v
						})]
					}, k))
				})
			}),
			browserGuess && /* @__PURE__ */ jsxs("p", {
				className: "mt-3 font-mono text-[11px] text-subtle",
				children: ["Browser guess: ", browserGuess]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ jsxs(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ jsx(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ jsxs(Button, {
					onClick: onContinue,
					disabled: scanning || !hardware,
					children: ["See catalog", /* @__PURE__ */ jsx(ArrowRight, { className: "size-4" })]
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
	return /* @__PURE__ */ jsxs("section", {
		className: "stagger-in flex flex-1 flex-col py-6",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Catalog"
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Choose a local model"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "Grey cards need more RAM than this server has, or are not downloadable. Small is the default for this machine."
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-6 grid gap-3 md:grid-cols-3",
				children: items.map(({ key, title, model }) => {
					if (!model) return null;
					const fit = cards.fits[model.id];
					const enabled = Boolean(fit?.fits && model.downloadable);
					return /* @__PURE__ */ jsxs("button", {
						type: "button",
						disabled: !enabled,
						onClick: () => enabled && onPick(model.id),
						className: `flex flex-col rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[transform,background-color] duration-150 ${enabled ? "hover:bg-raised" : "cursor-not-allowed opacity-50"}`,
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ jsx("span", {
									className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
									children: title
								}), key === "recommended" && enabled && /* @__PURE__ */ jsx("span", {
									className: "rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent",
									children: "Fits"
								})]
							}),
							/* @__PURE__ */ jsx("h2", {
								className: "mt-3 text-base font-medium",
								children: model.name
							}),
							/* @__PURE__ */ jsxs("p", {
								className: "mt-1 font-mono text-xs text-muted",
								children: [
									model.sizeLabel,
									" · ",
									model.license
								]
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-3 text-xs leading-relaxed text-muted",
								children: enabled ? fit?.reason : fit && !fit.fits ? fit.reason : "Not downloadable in this build."
							})
						]
					}, key);
				})
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-8",
				children: /* @__PURE__ */ jsxs(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ jsx(ArrowLeft, { className: "size-4" }), "Back"]
				})
			})
		]
	});
}
function DownloadStep({ catalogId, onBack, onReady }) {
	const [status, setStatus] = useState(null);
	const [importPath, setImportPath] = useState("");
	const [msg, setMsg] = useState(null);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let stop = false;
		const tick = async () => {
			const s = await modelDownloadStatus();
			if (stop) return;
			setStatus(s);
			if (s.status === "done") {
				if ((await modelVerify({ data: { catalogId } })).ok) setReady(true);
			}
		};
		(async () => {
			const hit = (await modelList()).models.find((m) => m.catalogId === catalogId);
			if (hit) {
				if ((await modelVerify({ data: { catalogId } })).ok) {
					setReady(true);
					setMsg(`Already on disk · ${hit.path}`);
					return;
				}
			}
			await modelDownloadStart({ data: { catalogId } });
			await tick();
		})();
		const id = window.setInterval(() => void tick(), 500);
		return () => {
			stop = true;
			window.clearInterval(id);
		};
	}, [catalogId]);
	const pct = status && status.bytesTotal > 0 ? Math.min(100, Math.round(status.bytesDone / status.bytesTotal * 100)) : 0;
	return /* @__PURE__ */ jsxs("section", {
		className: "stagger-in flex flex-1 flex-col py-6",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Download"
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Get the GGUF"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "Real bytes from Hugging Face into the models folder. Pause uses HTTP Range. You can also import a .gguf already on this machine."
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-6 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)]",
				children: [
					/* @__PURE__ */ jsx("div", {
						className: "h-2 overflow-hidden rounded-full bg-raised",
						children: /* @__PURE__ */ jsx("div", {
							className: "h-full bg-accent transition-[width] duration-200",
							style: { width: `${ready ? 100 : pct}%` }
						})
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-3 font-mono text-xs text-muted",
						children: ready ? "Verified on disk." : status ? `${(status.bytesDone / 1024 ** 2).toFixed(1)} / ${(status.bytesTotal / 1024 ** 2).toFixed(1)} MB · ${status.status}` : "Starting…"
					}),
					status?.error && /* @__PURE__ */ jsx("p", {
						className: "mt-2 text-sm text-danger",
						children: status.error
					}),
					msg && /* @__PURE__ */ jsx("p", {
						className: "mt-2 font-mono text-xs break-all text-muted",
						children: msg
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: [/* @__PURE__ */ jsxs(Button, {
							variant: "secondary",
							size: "sm",
							onClick: () => void modelDownloadPause(),
							disabled: status?.status !== "running",
							children: [/* @__PURE__ */ jsx(Pause, { className: "size-3.5" }), "Pause"]
						}), /* @__PURE__ */ jsxs(Button, {
							variant: "secondary",
							size: "sm",
							onClick: () => void modelDownloadResume(),
							disabled: status?.status !== "paused",
							children: [/* @__PURE__ */ jsx(Play, { className: "size-3.5" }), "Resume"]
						})]
					})
				]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "mt-5 block text-xs font-medium text-muted",
				children: ["Import GGUF (absolute path on this server)", /* @__PURE__ */ jsx(Input, {
					className: "mt-1.5 font-mono text-xs",
					value: importPath,
					onChange: (e) => setImportPath(e.target.value),
					placeholder: "/path/to/model.gguf"
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-2",
				children: /* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					size: "sm",
					disabled: !importPath.trim(),
					onClick: async () => {
						const r = await modelImport({ data: {
							absolutePath: importPath,
							catalogId
						} });
						if (r.ok) {
							setReady(true);
							setMsg(`Imported ${r.path}`);
						} else setMsg(r.error ?? "Import failed");
					},
					children: "Import this file"
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ jsxs(Button, {
					variant: "ghost",
					onClick: onBack,
					children: [/* @__PURE__ */ jsx(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ jsxs(Button, {
					onClick: onReady,
					disabled: !ready,
					children: ["Continue", /* @__PURE__ */ jsx(ArrowRight, { className: "size-4" })]
				})]
			})
		]
	});
}
function AgentStep(props) {
	return /* @__PURE__ */ jsxs("section", {
		className: "stagger-in flex flex-1 flex-col py-6",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Company"
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Create your first agent"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "This writes the company tree on disk. Chat uses the local GGUF you just verified."
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-6 grid gap-4 md:grid-cols-2",
				children: [
					/* @__PURE__ */ jsxs("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Company", /* @__PURE__ */ jsx(Input, {
							className: "mt-1.5",
							value: props.company,
							onChange: (e) => props.setCompany(e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Department", /* @__PURE__ */ jsx(Input, {
							className: "mt-1.5",
							value: props.department,
							onChange: (e) => props.setDepartment(e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("label", {
						className: "block text-xs font-medium text-muted",
						children: ["Your name", /* @__PURE__ */ jsx(Input, {
							className: "mt-1.5",
							value: props.employee,
							onChange: (e) => props.setEmployee(e.target.value)
						})]
					}),
					/* @__PURE__ */ jsxs("label", {
						className: "flex items-end gap-2 pb-1 text-sm text-fg",
						children: [/* @__PURE__ */ jsx("input", {
							type: "checkbox",
							className: "size-4 accent-accent",
							checked: props.shared,
							onChange: (e) => props.setShared(e.target.checked)
						}), "This path is a shared drive"]
					})
				]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "mt-4 block text-xs font-medium text-muted",
				children: ["Company root (absolute path)", /* @__PURE__ */ jsx(Input, {
					className: "mt-1.5 font-mono text-xs",
					value: props.companyRoot,
					onChange: (e) => props.setCompanyRoot(e.target.value)
				})]
			}),
			props.previewData ? /* @__PURE__ */ jsx("p", {
				className: "mt-2 text-xs text-muted",
				children: "This preview writes to the project data folder."
			}) : /* @__PURE__ */ jsx("p", {
				className: "mt-2 text-xs text-muted",
				children: "Shared departments require a shared folder path."
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-6",
				children: [/* @__PURE__ */ jsx("p", {
					className: "text-xs font-medium text-muted",
					children: "Template"
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-2 flex flex-wrap gap-2",
					children: TEMPLATES.map((t) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						onClick: () => props.onTemplate(t),
						className: "inline-flex items-center gap-2 rounded-md bg-raised px-3 py-1.5 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover",
						children: [/* @__PURE__ */ jsx("span", {
							className: "size-6 overflow-hidden rounded-full",
							children: /* @__PURE__ */ jsx(MascotMark, { id: t.mascotId })
						}), t.name]
					}, t.name))
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-4 grid gap-4 md:grid-cols-2",
				children: [/* @__PURE__ */ jsxs("label", {
					className: "block text-xs font-medium text-muted",
					children: ["Agent name", /* @__PURE__ */ jsx(Input, {
						className: "mt-1.5",
						value: props.botName,
						onChange: (e) => props.setBotName(e.target.value)
					})]
				}), /* @__PURE__ */ jsxs("label", {
					className: "block text-xs font-medium text-muted",
					children: ["Job", /* @__PURE__ */ jsx(Input, {
						className: "mt-1.5",
						value: props.botJob,
						onChange: (e) => props.setBotJob(e.target.value)
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-4 grid gap-6 md:grid-cols-2",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-xs font-medium text-muted",
					children: "Mascot"
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-2 flex gap-2",
					children: MASCOT_IDS.map((id) => /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => props.setMascotId(id),
						className: `flex size-11 items-center justify-center overflow-hidden rounded-full ${props.mascotId === id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`,
						"aria-label": MASCOT_META[id].label,
						children: /* @__PURE__ */ jsx(MascotMark, { id })
					}, id))
				})] }), /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-xs font-medium text-muted",
					children: "Color"
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-2 flex flex-wrap gap-2",
					children: AGENT_COLOR_LIST.map((c) => /* @__PURE__ */ jsx(ColorSwatch, {
						hex: c.hex,
						selected: props.color === c.id,
						onClick: () => props.setColor(c.id)
					}, c.id))
				})] })]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-5 font-mono text-[11px] leading-relaxed text-subtle break-all",
				children: `${props.companyRoot || "(set a path)"}/departments/${props.department || "Operations"}/people/${props.employee || "You"}/bots/${props.botName || "Writer"}/`
			}),
			props.error && /* @__PURE__ */ jsx("p", {
				className: "mt-2 text-sm text-danger",
				children: props.error
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ jsxs(Button, {
					variant: "ghost",
					onClick: props.onBack,
					disabled: props.busy,
					children: [/* @__PURE__ */ jsx(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ jsxs(Button, {
					onClick: () => void props.onFinish(),
					disabled: !props.botName.trim() || !props.companyRoot.trim() || props.busy,
					children: [/* @__PURE__ */ jsx(Check, { className: "size-4" }), props.busy ? "Creating folders…" : "Open chat"]
				})]
			})
		]
	});
}
//#endregion
//#region src/lib/runtime/prompt.ts
function buildSystemPrompt(s, bot, extras) {
	const ctx = resolveBot(s, bot.id);
	if (!ctx) return "You are a LocalBot agent.";
	const modelName = getCatalogModel(bot.modelId)?.name ?? bot.modelId;
	const shared = bot.grants.includes("shared") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const outbox = bot.grants.includes("outbox") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox") : null;
	return `You are ${bot.name}, a LocalBot agent in a browser app.
Job: ${bot.job}
Chat model: local GGUF (${modelName})
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
//#endregion
//#region src/runtime/harnessAdapter.ts
/**
* Isolation layer: the UI talks to this adapter, never to the model HTTP client.
* Default: local GGUF via llama-server on 127.0.0.1. Hosted grok-4.5 only if
* the explicit demo switch is on in server config.
*
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
//#endregion
//#region src/components/localbot/markdown.tsx
function renderInline(text, keyPrefix) {
	const parts = [];
	const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
	let last = 0;
	let m;
	let i = 0;
	while (m = re.exec(text)) {
		if (m.index > last) parts.push(text.slice(last, m.index));
		const token = m[0];
		if (token.startsWith("**")) parts.push(/* @__PURE__ */ jsx("strong", {
			className: "font-medium text-fg",
			children: token.slice(2, -2)
		}, `${keyPrefix}-b${i++}`));
		else if (token.startsWith("`")) parts.push(/* @__PURE__ */ jsx("code", {
			className: "rounded-xs bg-raised px-1 py-0.5 font-mono text-[0.85em] text-accent",
			children: token.slice(1, -1)
		}, `${keyPrefix}-c${i++}`));
		else parts.push(/* @__PURE__ */ jsx("em", {
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
			nodes.push(/* @__PURE__ */ jsx("pre", {
				className: "my-2 overflow-x-auto rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-fg shadow-[0_0_0_1px_var(--color-border)]",
				children: /* @__PURE__ */ jsx("code", { children: code.replace(/\n$/, "") })
			}, `code-${idx}`));
			return;
		}
		const lines = block.split("\n");
		let list = [];
		const flushList = () => {
			if (list.length === 0) return;
			const items = list;
			list = [];
			nodes.push(/* @__PURE__ */ jsx("ul", {
				className: "my-1.5 space-y-1 pl-4",
				children: items.map((it, i) => /* @__PURE__ */ jsx("li", {
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
				nodes.push(/* @__PURE__ */ jsx("div", { className: "h-2" }, `sp-${idx}-${li}`));
				return;
			}
			if (t.startsWith("### ")) {
				nodes.push(/* @__PURE__ */ jsx("h3", {
					className: "mt-3 mb-1 text-sm font-medium text-fg",
					children: t.slice(4)
				}, `h-${idx}-${li}`));
				return;
			}
			if (t.startsWith("## ") || t.startsWith("# ")) {
				nodes.push(/* @__PURE__ */ jsx("h2", {
					className: "mt-3 mb-1 text-[15px] font-medium text-fg",
					children: t.replace(/^#+\s+/, "")
				}, `h-${idx}-${li}`));
				return;
			}
			nodes.push(/* @__PURE__ */ jsx("p", {
				className: "text-sm leading-relaxed text-fg/90",
				children: renderInline(t, `p-${idx}-${li}`)
			}, `p-${idx}-${li}`));
		});
		flushList();
	});
	return /* @__PURE__ */ jsx("div", {
		className: cn("space-y-0.5", className),
		children: nodes
	});
}
//#endregion
//#region src/components/localbot/chat.tsx
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
	const badge = useLocalBot((s) => s.runtime.badge);
	const snap = useLocalBot.getState();
	const [chips, setChips] = useState([]);
	const [pending, setPending] = useState(null);
	const permResolver = useRef(null);
	const abortRef = useRef(null);
	const scroller = useRef(null);
	const fileInput = useRef(null);
	useEffect(() => {
		scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
	}, [
		session?.messages.length,
		chips.length,
		pending,
		session?.running
	]);
	useEffect(() => {
		setChips([]);
		setPending(null);
	}, [selected]);
	if (!bot) return /* @__PURE__ */ jsx("div", {
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
	return /* @__PURE__ */ jsxs("section", {
		className: "flex min-w-0 flex-1 flex-col bg-bg",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex h-12 shrink-0 items-center gap-3 border-b border-border px-3",
				children: [
					/* @__PURE__ */ jsx(AgentAvatar, {
						bot,
						size: "sm"
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ jsx("h1", {
								className: "truncate text-sm font-medium",
								children: bot.name
							}), running && /* @__PURE__ */ jsx("span", {
								className: "shimmer-text font-mono text-[10px] tracking-wider uppercase",
								children: "Working"
							})]
						}), /* @__PURE__ */ jsx("p", {
							className: "truncate text-[11px] text-muted",
							children: bot.job
						})]
					}),
					/* @__PURE__ */ jsx("span", {
						className: `hidden rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase md:inline ${aiAvailable ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`,
						children: badge || (aiAvailable ? "Local model" : "Local model not ready")
					}),
					/* @__PURE__ */ jsxs(Button, {
						variant: running ? "danger" : "ghost",
						size: "sm",
						onClick: () => {
							abortRef.current?.abort();
							requestStop(bot.id);
						},
						disabled: !running,
						children: [/* @__PURE__ */ jsx(Square, { className: "size-3.5" }), "Stop"]
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Show computer",
						onClick: () => setUi({ showComputer: !showComputer }),
						children: /* @__PURE__ */ jsx(Monitor, { className: "size-4" })
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				ref: scroller,
				className: "min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin md:px-8",
				children: [messages.length === 0 && !running && /* @__PURE__ */ jsx(Empty, {
					botName: bot.name,
					onPick: (t) => void send(t)
				}), /* @__PURE__ */ jsxs("ol", {
					className: "mx-auto flex max-w-2xl flex-col gap-4",
					children: [
						messages.map((m) => /* @__PURE__ */ jsx("li", {
							className: m.role === "user" ? "ml-8" : "mr-4",
							children: m.role === "system" ? /* @__PURE__ */ jsx("p", {
								className: "font-mono text-[11px] text-subtle",
								children: m.content
							}) : m.role === "user" ? /* @__PURE__ */ jsx("div", {
								className: "rounded-lg bg-raised px-3.5 py-2.5 shadow-[0_0_0_1px_var(--color-border)]",
								children: /* @__PURE__ */ jsx("p", {
									className: "text-sm leading-relaxed whitespace-pre-wrap",
									children: m.content
								})
							}) : /* @__PURE__ */ jsxs("div", { children: [m.chips && m.chips.length > 0 && /* @__PURE__ */ jsx(ChipRow, { chips: m.chips }), /* @__PURE__ */ jsx(ChatMarkdown, { text: m.content })] })
						}, m.id)),
						(running || chips.length > 0) && /* @__PURE__ */ jsxs("li", {
							className: "mr-4",
							children: [/* @__PURE__ */ jsx(ChipRow, { chips }), running && chips.length === 0 && /* @__PURE__ */ jsx("p", {
								className: "shimmer-text text-sm",
								children: "Thinking"
							})]
						}),
						pending && /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(PermissionCard, {
							req: pending,
							allowed: true,
							onDecide: decide
						}) })
					]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "border-t border-border px-3 py-3 md:px-6",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mx-auto max-w-2xl rounded-xl bg-surface p-2 shadow-[0_0_0_1px_var(--color-border)]",
					children: [/* @__PURE__ */ jsx("textarea", {
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
					}), /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between px-1",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ jsx("input", {
									ref: fileInput,
									type: "file",
									className: "hidden",
									onChange: (e) => {
										const f = e.target.files?.[0];
										if (f) onAttach(f);
										e.target.value = "";
									}
								}),
								/* @__PURE__ */ jsx(Button, {
									variant: "ghost",
									size: "icon-sm",
									"aria-label": "Attach file",
									onClick: () => fileInput.current?.click(),
									children: /* @__PURE__ */ jsx(Paperclip, { className: "size-4" })
								}),
								/* @__PURE__ */ jsx(MentionHint, {})
							]
						}), /* @__PURE__ */ jsx(Button, {
							size: "sm",
							disabled: !composer.trim() || running,
							onClick: () => void send(composer),
							children: "Send"
						})]
					})]
				}), /* @__PURE__ */ jsx("p", {
					className: "mx-auto mt-2 max-w-2xl font-mono text-[10px] text-subtle",
					children: ctx ? `computer · ${bot.workspacePath}` : "workspace"
				})]
			})
		]
	});
}
function Empty({ botName, onPick }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "mx-auto flex max-w-lg flex-col items-start py-10",
		children: [/* @__PURE__ */ jsxs("p", {
			className: "text-sm text-muted",
			children: [botName, " is ready. Work stays in the workspace. Try one of these:"]
		}), /* @__PURE__ */ jsx("div", {
			className: "mt-4 flex flex-col gap-2",
			children: SUGGESTIONS.map((s) => /* @__PURE__ */ jsx("button", {
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
	return /* @__PURE__ */ jsx("div", {
		className: "mb-2 flex flex-wrap gap-1.5",
		children: chips.map((c) => /* @__PURE__ */ jsxs("span", {
			className: `inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] ${c.status === "denied" ? "text-danger" : c.status === "running" ? "text-accent" : "text-muted"}`,
			children: [
				/* @__PURE__ */ jsx(ChipIcon, { kind: c.kind }),
				c.label,
				/* @__PURE__ */ jsx("span", {
					className: "max-w-[180px] truncate font-mono text-[10px] text-subtle",
					children: c.detail
				})
			]
		}, c.id))
	});
}
function ChipIcon({ kind }) {
	const cls = "size-3";
	if (kind === "shell") return /* @__PURE__ */ jsx(Terminal, { className: cls });
	if (kind === "edit" || kind === "write") return /* @__PURE__ */ jsx(FilePenLine, { className: cls });
	if (kind === "network" || kind === "browser") return /* @__PURE__ */ jsx(Globe, { className: cls });
	if (kind === "delete") return /* @__PURE__ */ jsx(Ban, { className: cls });
	return /* @__PURE__ */ jsx(FileSearch, { className: cls });
}
function PermissionCard({ req, allowed, onDecide }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "rounded-xl bg-raised p-4 shadow-[0_0_0_1px_var(--color-border-strong)]",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
				children: "Permission"
			}),
			/* @__PURE__ */ jsx("h3", {
				className: "mt-1 text-sm font-medium",
				children: req.summary
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-1 font-mono text-xs leading-relaxed break-all text-muted",
				children: req.detail
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "mt-3 flex flex-wrap gap-2",
				children: [/* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => onDecide("deny"),
					children: "Deny"
				}), allowed && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => onDecide("allow-once"),
					children: "Allow once"
				}), /* @__PURE__ */ jsx(Button, {
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
	return /* @__PURE__ */ jsx("div", {
		className: "flex gap-1",
		children: matches.slice(0, 3).map((b) => /* @__PURE__ */ jsxs("button", {
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
//#endregion
//#region src/components/localbot/computer.tsx
function ComputerPane() {
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bots = useLocalBot((s) => s.bots);
	const bot = bots.find((b) => b.id === selected) ?? null;
	const previewPath = useLocalBot((s) => s.ui.previewPath);
	const company = useLocalBot((s) => s.company);
	const employees = useLocalBot((s) => s.employees);
	const departments = useLocalBot((s) => s.departments);
	const show = useLocalBot((s) => s.ui.showComputer);
	const setUi = useLocalBot((s) => s.setUi);
	const diskEpoch = useLocalBot((s) => s.diskEpoch);
	const ctx = bot && company ? resolveBot({
		bots,
		employees,
		departments,
		company
	}, bot.id) : null;
	if (!show) return null;
	if (!bot || !ctx || !company) return /* @__PURE__ */ jsx("aside", { className: "hidden h-full w-[280px] shrink-0 border-l border-border bg-surface lg:block" });
	const shared = bot.grants.includes("shared") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const outbox = grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox");
	const copyPath = async (path) => {
		try {
			await navigator.clipboard.writeText(path);
		} catch {}
	};
	return /* @__PURE__ */ jsxs("aside", {
		className: "flex h-full min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface shadow-[0_0_0_1px_var(--color-border),-16px_0_40px_rgb(0_0_0/0.35)] md:border-t-0 md:border-l",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex h-12 items-center justify-between px-3",
				children: [/* @__PURE__ */ jsx("p", {
					className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
					children: "Computer"
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-1",
					children: [/* @__PURE__ */ jsxs(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => void copyPath(outbox),
						children: [/* @__PURE__ */ jsx(Inbox, { className: "size-3.5" }), "Outbox"]
					}), /* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Close computer",
						onClick: () => setUi({ showComputer: false }),
						children: /* @__PURE__ */ jsx(X, { className: "size-4" })
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin",
				children: [
					/* @__PURE__ */ jsx(TreeSection, {
						title: "workspace",
						root: bot.workspacePath,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ jsx(FolderOpen, { className: "size-3.5" })
					}),
					/* @__PURE__ */ jsx(TreeSection, {
						title: "output",
						root: bot.outputPath,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ jsx(FileText, { className: "size-3.5" })
					}),
					shared && /* @__PURE__ */ jsx(TreeSection, {
						title: "shared",
						root: shared,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ jsx(Share2, { className: "size-3.5" })
					}),
					/* @__PURE__ */ jsx(TreeSection, {
						title: "outbox",
						root: outbox,
						companyRoot: company.root,
						epoch: diskEpoch,
						icon: /* @__PURE__ */ jsx(Inbox, { className: "size-3.5" })
					}),
					previewPath && /* @__PURE__ */ jsx(DiskPreview, {
						path: previewPath,
						companyRoot: company.root,
						epoch: diskEpoch
					})
				]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "border-t border-border px-3 py-2",
				children: /* @__PURE__ */ jsx("button", {
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
	return /* @__PURE__ */ jsxs("div", {
		className: "mb-3",
		children: [/* @__PURE__ */ jsxs("p", {
			className: "mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-wider text-subtle uppercase",
			children: [icon, title]
		}), /* @__PURE__ */ jsx(FileTree, {
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
	const [open, setOpen] = useState(depth < 1);
	const [children, setChildren] = useState(null);
	const [missing, setMissing] = useState(false);
	const [isFile, setIsFile] = useState(false);
	useEffect(() => {
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
	if (missing) return /* @__PURE__ */ jsx("p", {
		className: "px-2 py-1 text-[11px] text-subtle",
		children: "Folder not created yet."
	});
	if (isFile) return /* @__PURE__ */ jsxs("button", {
		type: "button",
		onClick: () => setUi({ previewPath: path }),
		className: `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${preview === path ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"}`,
		style: { paddingLeft: 8 + depth * 10 },
		children: [/* @__PURE__ */ jsx(FileText, { className: "size-3 shrink-0" }), /* @__PURE__ */ jsx("span", {
			className: "truncate",
			children: posixBasename(path)
		})]
	});
	return /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("button", {
		type: "button",
		onClick: () => setOpen((v) => !v),
		className: "flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-[12px] text-muted hover:bg-hover hover:text-fg",
		style: { paddingLeft: 8 + depth * 10 },
		children: [
			/* @__PURE__ */ jsx(ChevronRight, { className: `size-3 transition-transform duration-150 ${open ? "rotate-90" : ""}` }),
			open ? /* @__PURE__ */ jsx(FolderOpen, { className: "size-3" }) : /* @__PURE__ */ jsx(Folder, { className: "size-3" }),
			/* @__PURE__ */ jsx("span", {
				className: "truncate",
				children: posixBasename(path)
			})
		]
	}), open && (children ?? []).map((c) => c.kind === "file" ? /* @__PURE__ */ jsxs("button", {
		type: "button",
		onClick: () => setUi({ previewPath: c.path }),
		className: `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${preview === c.path ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"}`,
		style: { paddingLeft: 8 + (depth + 1) * 10 },
		children: [/* @__PURE__ */ jsx(FileText, { className: "size-3 shrink-0" }), /* @__PURE__ */ jsx("span", {
			className: "truncate",
			children: c.name
		})]
	}, c.path) : /* @__PURE__ */ jsx(FileTree, {
		path: c.path,
		companyRoot,
		epoch,
		depth: depth + 1
	}, c.path))] });
}
function DiskPreview({ path, companyRoot, epoch }) {
	const [text, setText] = useState("");
	useEffect(() => {
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
	return /* @__PURE__ */ jsxs("div", {
		className: "mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]",
		children: [/* @__PURE__ */ jsx("p", {
			className: "mb-1 truncate font-mono text-[10px] text-subtle",
			children: posixBasename(path)
		}), /* @__PURE__ */ jsx("pre", {
			className: "max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap",
			children: text
		})]
	});
}
//#endregion
//#region src/components/localbot/desktop-titlebar.tsx
function DesktopTitlebar() {
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bots = useLocalBot((s) => s.bots);
	const setUi = useLocalBot((s) => s.setUi);
	const bot = bots.find((b) => b.id === selected);
	const title = bot ? `${bot.name} · LocalBot` : "LocalBot";
	const desktop = typeof window !== "undefined" ? window.localbotDesktop : void 0;
	useEffect(() => {
		document.title = title;
		desktop?.setTitle(title);
	}, [title, desktop]);
	useEffect(() => {
		if (!desktop?.onSettings) return;
		return desktop.onSettings(() => setUi({ showSettings: true }));
	}, [desktop, setUi]);
	if (!desktop) return null;
	const showControls = desktop.platform !== "darwin";
	return /* @__PURE__ */ jsxs("div", {
		className: "flex h-9 shrink-0 items-center border-b border-border bg-bg px-3",
		style: { WebkitAppRegion: "drag" },
		children: [
			desktop.platform === "darwin" && /* @__PURE__ */ jsx("span", { className: "w-16" }),
			/* @__PURE__ */ jsx("p", {
				className: "flex-1 truncate font-mono text-[11px] tracking-wide text-subtle",
				children: title
			}),
			showControls && /* @__PURE__ */ jsxs("div", {
				className: "flex",
				style: { WebkitAppRegion: "no-drag" },
				children: [
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "flex size-8 items-center justify-center text-muted hover:text-fg",
						"aria-label": "Minimize",
						onClick: () => desktop.minimize(),
						children: /* @__PURE__ */ jsx(Minus, { className: "size-3.5" })
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "flex size-8 items-center justify-center text-muted hover:text-fg",
						"aria-label": "Maximize",
						onClick: () => desktop.maximize(),
						children: /* @__PURE__ */ jsx(Square, { className: "size-3" })
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "flex size-8 items-center justify-center text-muted hover:text-danger",
						"aria-label": "Close",
						onClick: () => desktop.close(),
						children: /* @__PURE__ */ jsx(X, { className: "size-3.5" })
					})
				]
			})
		]
	});
}
//#endregion
//#region src/components/localbot/new-agent.tsx
function NewAgentDialog() {
	const open = useLocalBot((s) => s.ui.newAgentOpen);
	const setUi = useLocalBot((s) => s.setUi);
	const createBot = useLocalBot((s) => s.createBot);
	const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
	const bots = useLocalBot((s) => s.bots);
	const [name, setName] = useState("");
	const [job, setJob] = useState("");
	const [color, setColor] = useState("steel");
	const [mascotId, setMascotId] = useState("researcher");
	if (!open) return null;
	const submit = () => {
		const n = name.trim() || `Agent ${bots.length + 1}`;
		createBot({
			name: n,
			job: job.trim() || "Generalist",
			color,
			mascotId,
			modelId: selectedCatalogId ?? "qwen25-05b-q4",
			extraGrants: ["shared"]
		});
		setName("");
		setJob("");
	};
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-40 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]",
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-md rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			children: [
				/* @__PURE__ */ jsx("h2", {
					className: "text-lg font-medium tracking-tight",
					children: "New agent"
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-1 text-sm text-muted",
					children: "Each agent gets a workspace, memory, and output folder."
				}),
				/* @__PURE__ */ jsxs("label", {
					className: "mt-4 block text-xs font-medium text-muted",
					children: ["Name", /* @__PURE__ */ jsx(Input, {
						className: "mt-1.5",
						value: name,
						onChange: (e) => {
							const v = e.target.value;
							setName(v);
							const guessed = mascotIdForTemplate(v);
							setMascotId(guessed);
							setColor(MASCOT_META[guessed].defaultColor);
						},
						placeholder: "Researcher"
					})]
				}),
				/* @__PURE__ */ jsxs("label", {
					className: "mt-3 block text-xs font-medium text-muted",
					children: ["Job", /* @__PURE__ */ jsx(Input, {
						className: "mt-1.5",
						value: job,
						onChange: (e) => setJob(e.target.value),
						placeholder: "Sources into shared/"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-3",
					children: [/* @__PURE__ */ jsx("p", {
						className: "text-xs font-medium text-muted",
						children: "Mascot"
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-2 flex gap-2",
						children: MASCOT_IDS.map((id) => /* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: () => setMascotId(id),
							className: `flex size-11 items-center justify-center overflow-hidden rounded-full ${mascotId === id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`,
							"aria-label": MASCOT_META[id].label,
							children: /* @__PURE__ */ jsx(MascotMark, { id })
						}, id))
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-3",
					children: [/* @__PURE__ */ jsx("p", {
						className: "text-xs font-medium text-muted",
						children: "Color"
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-2 flex gap-2",
						children: AGENT_COLOR_LIST.map((c) => /* @__PURE__ */ jsx(ColorSwatch, {
							hex: c.hex,
							selected: color === c.id,
							onClick: () => setColor(c.id)
						}, c.id))
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-5 flex justify-end gap-2",
					children: [/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						onClick: () => setUi({ newAgentOpen: false }),
						children: "Cancel"
					}), /* @__PURE__ */ jsx(Button, {
						onClick: submit,
						children: "Create"
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/components/localbot/palette.tsx
function CommandPalette() {
	const open = useLocalBot((s) => s.ui.commandOpen);
	const setUi = useLocalBot((s) => s.setUi);
	const bots = useLocalBot((s) => s.bots).filter((b) => !b.hidden);
	const selectBot = useLocalBot((s) => s.selectBot);
	const [q, setQ] = useState("");
	useEffect(() => {
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
	const actions = useMemo(() => {
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
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-start justify-center bg-bg/60 pt-[18vh] backdrop-blur-[2px]",
		onClick: () => setUi({ commandOpen: false }),
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-lg overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ jsx("input", {
				autoFocus: true,
				value: q,
				onChange: (e) => setQ(e.target.value),
				placeholder: "Jump to an agent or action",
				className: "h-12 w-full bg-transparent px-4 text-sm text-fg placeholder:text-subtle focus-visible:outline-none"
			}), /* @__PURE__ */ jsx("ul", {
				className: "max-h-72 overflow-y-auto border-t border-border py-1 scrollbar-thin",
				children: actions.map((a) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsxs("button", {
					type: "button",
					onClick: a.run,
					className: "flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-hover",
					children: [/* @__PURE__ */ jsx("span", { children: a.label }), /* @__PURE__ */ jsx("span", {
						className: "font-mono text-[10px] text-subtle",
						children: a.hint
					})]
				}) }, a.id))
			})]
		})
	});
}
//#endregion
//#region src/components/localbot/settings.tsx
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
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-40 flex items-start justify-center bg-bg/70 p-3 pt-[8vh] backdrop-blur-[2px] md:p-6",
		children: /* @__PURE__ */ jsxs("div", {
			className: "flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "flex items-center justify-between border-b border-border px-4",
				children: [/* @__PURE__ */ jsx("div", {
					className: "flex gap-1 overflow-x-auto",
					children: TABS.map(([id, label]) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						onClick: () => setUi({ settingsTab: id }),
						className: `h-12 shrink-0 px-3 text-sm ${tab === id ? "text-fg" : "text-muted hover:text-fg"}`,
						children: [label, tab === id && /* @__PURE__ */ jsx("span", { className: "mt-1 block h-0.5 rounded-full bg-accent" })]
					}, id))
				}), /* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "icon-sm",
					"aria-label": "Close settings",
					onClick: () => setUi({ showSettings: false }),
					children: /* @__PURE__ */ jsx(X, { className: "size-4" })
				})]
			}), /* @__PURE__ */ jsxs("div", {
				className: "min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin",
				children: [
					tab === "general" && /* @__PURE__ */ jsx(GeneralPane, {}),
					tab === "models" && /* @__PURE__ */ jsx(ModelsPane, {}),
					tab === "company" && /* @__PURE__ */ jsx(CompanyPane, {}),
					tab === "runtime" && /* @__PURE__ */ jsx(RuntimePane, {}),
					tab === "safety" && /* @__PURE__ */ jsx(SafetyPane, {})
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
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Company name",
				children: /* @__PURE__ */ jsx(Input, {
					defaultValue: company?.name ?? "",
					onBlur: (e) => renameCompany(e.target.value)
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Employee",
				children: /* @__PURE__ */ jsx("p", {
					className: "text-sm text-fg",
					children: employee?.displayName ?? "—"
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "This build",
				children: /* @__PURE__ */ jsx("p", {
					className: "text-sm leading-relaxed text-muted",
					children: "Browser app. Chat uses a local GGUF via llama.cpp on this machine. Work files live on disk at the company root. Hosted models stay off unless you turn on the explicit demo switch."
				})
			}),
			preview && /* @__PURE__ */ jsx("p", {
				className: "text-xs leading-relaxed text-muted",
				children: "This preview writes to the project data folder."
			}),
			/* @__PURE__ */ jsx(Button, {
				variant: "danger",
				onClick: () => resetAll(),
				children: "Reset this workspace"
			})
		]
	});
}
function ModelsPane() {
	const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
	const noteCatalog = useLocalBot((s) => s.noteCatalog);
	const [modelsDir, setModelsDir] = useState("");
	const [onDisk, setOnDisk] = useState([]);
	const [importPath, setImportPath] = useState("");
	const [msg, setMsg] = useState(null);
	useEffect(() => {
		modelList().then((r) => {
			setModelsDir(r.modelsDir);
			setOnDisk(r.models.map((m) => m.filename));
		});
	}, []);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "Local GGUF files. Chat uses the active file on disk. Grey entries need more RAM or are not downloaded yet."
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Models folder",
				children: /* @__PURE__ */ jsx("p", {
					className: "font-mono text-xs break-all text-muted",
					children: modelsDir || "—"
				})
			}),
			selectedCatalogId && /* @__PURE__ */ jsxs("p", {
				className: "font-mono text-xs text-muted",
				children: ["Active catalog: ", selectedCatalogId]
			}),
			/* @__PURE__ */ jsx("h2", {
				className: "text-sm font-medium",
				children: "Catalog"
			}),
			/* @__PURE__ */ jsx("ul", {
				className: "space-y-2",
				children: CATALOG.map((m) => {
					const have = onDisk.includes(m.filename);
					return /* @__PURE__ */ jsxs("li", {
						className: "flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-sm",
							children: m.name
						}), /* @__PURE__ */ jsxs("p", {
							className: "text-[11px] text-muted",
							children: [
								m.sizeLabel,
								" · ",
								m.license,
								" · ",
								m.tier
							]
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ jsx("span", {
								className: "font-mono text-[10px] text-subtle",
								children: have ? "On disk" : m.downloadable ? "Hub" : "Listed"
							}), m.downloadable && !have && /* @__PURE__ */ jsx(Button, {
								size: "sm",
								variant: "secondary",
								onClick: () => {
									noteCatalog(m.id);
									modelDownloadStart({ data: { catalogId: m.id } }).then(() => setMsg("Download started. Watch Runtime / this list."));
								},
								children: "Download"
							})]
						})]
					}, m.id);
				})
			}),
			/* @__PURE__ */ jsx(Field, {
				label: "Import GGUF (absolute path)",
				children: /* @__PURE__ */ jsx(Input, {
					className: "font-mono text-xs",
					value: importPath,
					onChange: (e) => setImportPath(e.target.value)
				})
			}),
			/* @__PURE__ */ jsx(Button, {
				variant: "secondary",
				size: "sm",
				disabled: !importPath.trim(),
				onClick: async () => {
					const r = await modelImport({ data: { absolutePath: importPath } });
					setMsg(r.ok ? `Imported ${r.path}` : r.error ?? "failed");
					const listed = await modelList();
					setOnDisk(listed.models.map((m) => m.filename));
				},
				children: "Import this file"
			}),
			msg && /* @__PURE__ */ jsx("p", {
				className: "font-mono text-xs text-muted",
				children: msg
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
	const [path, setPath] = useState(company?.root ?? "");
	const [msg, setMsg] = useState(null);
	useEffect(() => {
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
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ jsx(Field, {
				label: "Company root (absolute path)",
				children: /* @__PURE__ */ jsx(Input, {
					className: "font-mono text-xs",
					value: path,
					onChange: (e) => setPath(e.target.value)
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ jsx(Button, {
						variant: "secondary",
						size: "sm",
						onClick: async () => {
							const r = await applyCompanyRoot(path);
							setMsg(r.ok ? `Using ${r.root}` : r.error);
						},
						children: "Use this path"
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "secondary",
						size: "sm",
						onClick: async () => {
							const r = await seedFoldersHere();
							setMsg(r.ok ? "Folders created on disk." : r.error);
						},
						children: "Create folders here"
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => void copyPath(),
						children: "Reveal path"
					})
				]
			}),
			preview && /* @__PURE__ */ jsx("p", {
				className: "text-xs text-muted",
				children: "This preview writes to the project data folder."
			}),
			msg && /* @__PURE__ */ jsx("p", {
				className: "font-mono text-xs text-muted",
				children: msg
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "flex items-center gap-2 text-sm",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					className: "size-4 accent-accent",
					checked: settings.companyRootIsShared,
					onChange: (e) => setCompanyRootShared(e.target.checked)
				}), "This path is a shared drive"]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "text-xs text-muted",
				children: "Two people see the same files only if this process and theirs point at the same real folder (NAS / Drive / shared disk) on the machine running the server. This checkbox only changes the copy."
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => void createDepartment("Research"),
					children: "Add department"
				}), departments[0] && /* @__PURE__ */ jsx(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => void createEmployee(departments[0].id, "Teammate"),
					children: "Add employee"
				})]
			}),
			/* @__PURE__ */ jsx("h2", {
				className: "text-sm font-medium",
				children: "Agents & grants"
			}),
			bots.map((bot) => /* @__PURE__ */ jsxs("div", {
				className: "rounded-md bg-raised p-3 shadow-[0_0_0_1px_var(--color-border)]",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ jsx("p", {
						className: "text-sm font-medium",
						children: bot.name
					}), /* @__PURE__ */ jsx("select", {
						className: "h-8 rounded-sm bg-bg px-2 text-xs text-fg shadow-[0_0_0_1px_var(--color-border)]",
						value: bot.employeeId,
						onChange: (e) => void moveBotToEmployee(bot.id, e.target.value),
						children: employees.map((e) => /* @__PURE__ */ jsx("option", {
							value: e.id,
							children: e.displayName
						}, e.id))
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-2 flex flex-wrap gap-2",
					children: [
						"workspace",
						"output",
						"shared",
						"outbox",
						"company-shared"
					].map((g) => {
						const on = bot.grants.includes(g);
						return /* @__PURE__ */ jsx("button", {
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
			/* @__PURE__ */ jsx(Button, {
				size: "sm",
				onClick: () => void createBot({
					name: `Agent ${bots.length + 1}`,
					job: "Generalist",
					color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length].id,
					modelId: selectedCatalogId ?? "qwen25-05b-q4"
				}),
				children: "New agent"
			})
		]
	});
}
function RuntimePane() {
	const runtime = useLocalBot((s) => s.runtime);
	const company = useLocalBot((s) => s.company);
	const [engine, setEngine] = useState(runtime);
	useEffect(() => {
		modelEngineStatus().then((s) => {
			setEngine({
				...runtime,
				engine: s.engine,
				model: s.model,
				aiAvailable: s.ready,
				ggufPath: s.ggufPath,
				loopback: s.loopback,
				ramEstimate: s.ramEstimate,
				badge: s.badge
			});
		});
	}, [runtime]);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ jsx(Row, {
				k: "Engine",
				v: engine.engine || runtime.engine
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "Chat model",
				v: engine.model || runtime.model || "—"
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "Status",
				v: engine.badge || runtime.badge
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "GGUF",
				v: engine.ggufPath || runtime.ggufPath || "—"
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "RAM estimate",
				v: engine.ramEstimate || "—"
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "Loopback",
				v: engine.loopback || runtime.loopback || "—"
			}),
			/* @__PURE__ */ jsx(Row, {
				k: "Company root",
				v: company?.root ?? "—"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "llama-server binds 127.0.0.1 only. Chat does not call a hosted API unless you turn on Allow hosted demo (breaks policy)."
			})
		]
	});
}
function SafetyPane() {
	const settings = useLocalBot((s) => s.settings);
	const updateSettings = useLocalBot((s) => s.updateSettings);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ jsxs("label", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					className: "mt-1 size-4 accent-accent",
					checked: settings.webSearchEnabled,
					onChange: (e) => updateSettings({ webSearchEnabled: e.target.checked })
				}), /* @__PURE__ */ jsxs("span", { children: [/* @__PURE__ */ jsx("span", {
					className: "block text-sm",
					children: "Web search"
				}), /* @__PURE__ */ jsx("span", {
					className: "text-xs text-muted",
					children: "Off by default. Network always asks."
				})] })]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					className: "mt-1 size-4 accent-accent",
					checked: settings.useExistingOllama,
					onChange: (e) => {
						updateSettings({ useExistingOllama: e.target.checked });
						modelSetOllama({ data: { use: e.target.checked } });
					}
				}), /* @__PURE__ */ jsxs("span", { children: [/* @__PURE__ */ jsx("span", {
					className: "block text-sm",
					children: "Use existing Ollama"
				}), /* @__PURE__ */ jsx("span", {
					className: "text-xs text-muted",
					children: "Off by default. Only if something is already serving on this machine’s Ollama port. Not required."
				})] })]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "rounded-md bg-danger/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]",
				children: /* @__PURE__ */ jsxs("label", {
					className: "flex items-start gap-3",
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						className: "mt-1 size-4 accent-danger",
						checked: settings.allowHostedDemo,
						onChange: (e) => {
							updateSettings({ allowHostedDemo: e.target.checked });
							modelSetHostedDemo({ data: { allow: e.target.checked } });
						}
					}), /* @__PURE__ */ jsxs("span", { children: [/* @__PURE__ */ jsx("span", {
						className: "block text-sm text-danger",
						children: "Allow hosted demo (breaks policy)"
					}), /* @__PURE__ */ jsx("span", {
						className: "text-xs text-muted",
						children: "Off. Default chat is the local GGUF. Turning this on sends turns to a hosted model instead."
					})] })]
				})
			}),
			/* @__PURE__ */ jsx("div", {
				className: "rounded-md bg-danger/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]",
				children: /* @__PURE__ */ jsxs("label", {
					className: "flex items-start gap-3",
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						className: "mt-1 size-4 accent-danger",
						checked: settings.controlThisComputer,
						onChange: (e) => updateSettings({ controlThisComputer: e.target.checked })
					}), /* @__PURE__ */ jsxs("span", { children: [/* @__PURE__ */ jsx("span", {
						className: "block text-sm text-danger",
						children: "Control this computer"
					}), /* @__PURE__ */ jsx("span", {
						className: "text-xs text-muted",
						children: "Off. Turns off permission cards for the workspace shell. Still scoped to the company root."
					})] })]
				})
			})
		]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ jsxs("label", {
		className: "block",
		children: [/* @__PURE__ */ jsx("span", {
			className: "text-xs font-medium text-muted",
			children: label
		}), /* @__PURE__ */ jsx("div", {
			className: "mt-1.5",
			children
		})]
	});
}
function Row({ k, v }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-baseline justify-between gap-4 border-b border-border py-2",
		children: [/* @__PURE__ */ jsx("span", {
			className: "text-xs text-muted",
			children: k
		}), /* @__PURE__ */ jsx("span", {
			className: "max-w-[70%] text-right font-mono text-xs break-all text-fg",
			children: v
		})]
	});
}
//#endregion
//#region src/components/localbot/sidebar.tsx
function Sidebar() {
	const bots = useLocalBot((s) => s.bots).filter((b) => !b.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const selectBot = useLocalBot((s) => s.selectBot);
	const pinBot = useLocalBot((s) => s.pinBot);
	const hideBot = useLocalBot((s) => s.hideBot);
	const duplicateBot = useLocalBot((s) => s.duplicateBot);
	const deleteBot = useLocalBot((s) => s.deleteBot);
	const setUi = useLocalBot((s) => s.setUi);
	return /* @__PURE__ */ jsxs("aside", {
		className: "flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-border bg-surface",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex h-12 items-center justify-between px-3",
				children: [/* @__PURE__ */ jsx(Wordmark, { className: "text-sm" }), /* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "icon-sm",
					"aria-label": "Settings",
					onClick: () => setUi({ showSettings: true }),
					children: /* @__PURE__ */ jsx(Settings, { className: "size-4" })
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "min-h-0 flex-1 overflow-y-auto px-1.5 scrollbar-thin",
				children: [bots.map((bot) => {
					const active = selected === bot.id;
					return /* @__PURE__ */ jsxs("div", {
						className: `group relative mb-0.5 flex items-center rounded-md ${active ? "bg-raised" : "hover:bg-hover"}`,
						children: [/* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: () => selectBot(bot.id),
							className: "flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left",
							children: [/* @__PURE__ */ jsxs("span", {
								className: "relative",
								children: [/* @__PURE__ */ jsx(AgentAvatar, {
									bot,
									size: "sm"
								}), bot.unread > 0 && /* @__PURE__ */ jsx("span", { className: "absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent" })]
							}), /* @__PURE__ */ jsxs("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ jsxs("span", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ jsx("span", {
										className: "truncate text-sm font-medium text-fg",
										children: bot.name
									}), bot.pinned && /* @__PURE__ */ jsx(Pin, { className: "size-3 text-subtle" })]
								}), /* @__PURE__ */ jsx("span", {
									className: "block truncate text-[11px] text-muted",
									children: bot.job
								})]
							})]
						}), /* @__PURE__ */ jsxs("details", {
							className: "relative mr-1",
							children: [/* @__PURE__ */ jsx("summary", {
								className: "flex size-8 list-none items-center justify-center rounded-sm text-subtle opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 [&::-webkit-details-marker]:hidden",
								children: /* @__PURE__ */ jsx(MoreHorizontal, { className: "size-4" })
							}), /* @__PURE__ */ jsxs("div", {
								className: "absolute top-8 right-0 z-20 w-40 rounded-md bg-raised py-1 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]",
								children: [
									/* @__PURE__ */ jsxs(MenuItem, {
										onClick: () => pinBot(bot.id, !bot.pinned),
										children: [
											/* @__PURE__ */ jsx(Pin, { className: "size-3.5" }),
											" ",
											bot.pinned ? "Unpin" : "Pin"
										]
									}),
									/* @__PURE__ */ jsxs(MenuItem, {
										onClick: () => void duplicateBot(bot.id),
										children: [/* @__PURE__ */ jsx(Copy, { className: "size-3.5" }), " Duplicate"]
									}),
									/* @__PURE__ */ jsxs(MenuItem, {
										onClick: () => hideBot(bot.id, true),
										children: [/* @__PURE__ */ jsx(EyeOff, { className: "size-3.5" }), " Hide"]
									}),
									/* @__PURE__ */ jsxs(MenuItem, {
										onClick: () => void deleteBot(bot.id),
										children: [/* @__PURE__ */ jsx(Trash2, { className: "size-3.5" }), " Delete"]
									})
								]
							})]
						})]
					}, bot.id);
				}), bots.length === 0 && /* @__PURE__ */ jsx("p", {
					className: "px-3 py-6 text-sm text-muted",
					children: "No agents yet."
				})]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "border-t border-border p-2",
				children: /* @__PURE__ */ jsxs(Button, {
					variant: "secondary",
					className: "w-full",
					onClick: () => setUi({ newAgentOpen: true }),
					children: [/* @__PURE__ */ jsx(Plus, { className: "size-4" }), "New agent"]
				})
			})
		]
	});
}
function MenuItem({ children, onClick }) {
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		onClick,
		className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover",
		children
	});
}
//#endregion
//#region src/components/localbot/shell.tsx
function AppShell() {
	const setUi = useLocalBot((s) => s.setUi);
	const agentsOpen = useLocalBot((s) => s.ui.agentsOpen);
	const showComputer = useLocalBot((s) => s.ui.showComputer);
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const bots = useLocalBot((s) => s.bots);
	useEffect(() => {
		if (!selected) {
			const first = bots.find((b) => !b.hidden) ?? bots[0];
			if (first) useLocalBot.getState().selectBot(first.id);
		}
	}, [selected, bots]);
	return /* @__PURE__ */ jsxs("div", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [
			/* @__PURE__ */ jsx(DesktopTitlebar, {}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 md:hidden",
				children: [
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Agents",
						onClick: () => setUi({ agentsOpen: !agentsOpen }),
						children: /* @__PURE__ */ jsx(Menu, { className: "size-4" })
					}),
					/* @__PURE__ */ jsx("span", {
						className: "flex-1 text-sm font-medium",
						children: "LocalBot"
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "New agent",
						onClick: () => setUi({ newAgentOpen: true }),
						children: /* @__PURE__ */ jsx(Plus, { className: "size-4" })
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Computer",
						onClick: () => setUi({ showComputer: !showComputer }),
						children: /* @__PURE__ */ jsx(Monitor, { className: "size-4" })
					}),
					/* @__PURE__ */ jsx(Button, {
						variant: "ghost",
						size: "icon-sm",
						"aria-label": "Settings",
						onClick: () => setUi({ showSettings: true }),
						children: /* @__PURE__ */ jsx(Settings, { className: "size-4" })
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "relative flex min-h-0 flex-1",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: `${agentsOpen ? "flex" : "hidden"} absolute inset-0 z-20 md:static md:z-0 md:flex`,
						children: [/* @__PURE__ */ jsx(Sidebar, {}), agentsOpen && /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "flex-1 bg-bg/50 md:hidden",
							"aria-label": "Close agents",
							onClick: () => setUi({ agentsOpen: false })
						})]
					}),
					/* @__PURE__ */ jsx(ChatPane, {}),
					showComputer && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "absolute inset-0 z-20 bg-bg/40 max-md:hidden",
						"aria-label": "Close computer",
						onClick: () => setUi({ showComputer: false })
					}), /* @__PURE__ */ jsx("div", {
						className: "absolute inset-x-0 bottom-0 z-30 flex h-[50%] md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[320px]",
						children: /* @__PURE__ */ jsx(ComputerPane, {})
					})] })
				]
			}),
			/* @__PURE__ */ jsx(SettingsDialog, {}),
			/* @__PURE__ */ jsx(NewAgentDialog, {}),
			/* @__PURE__ */ jsx(CommandPalette, {})
		]
	});
}
//#endregion
//#region src/components/localbot/app.tsx
function LocalBotApp() {
	const [ready, setReady] = useState(false);
	const onboarded = useLocalBot((s) => s.onboarded);
	const setRuntime = useLocalBot((s) => s.setRuntime);
	useEffect(() => {
		const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
		if (useLocalBot.persist.hasHydrated()) setReady(true);
		return unsub;
	}, []);
	useEffect(() => {
		if (!ready) return;
		getAiStatus().then((s) => setRuntime({
			aiAvailable: s.available,
			model: s.model,
			engine: s.engine,
			ggufPath: s.ggufPath,
			loopback: s.loopback,
			ramEstimate: s.ramEstimate,
			badge: s.badge
		}));
	}, [ready, setRuntime]);
	if (!ready) return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-dvh items-center justify-center bg-bg text-fg",
		children: /* @__PURE__ */ jsx(Wordmark, { className: "text-lg opacity-80" })
	});
	if (!onboarded) return /* @__PURE__ */ jsx(Onboarding, {});
	return /* @__PURE__ */ jsx(AppShell, {});
}
//#endregion
//#region src/routes/index.tsx?tsr-split=component
function Home() {
	return /* @__PURE__ */ jsx(LocalBotApp, {});
}
//#endregion
export { Home as component };
