import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { A as Ban, C as FileSearch, D as Copy, E as Ellipsis, M as ArrowLeft, O as ChevronRight, S as FileText, T as EyeOff, _ as HardDrive, a as Square, b as FolderOpen, c as Settings, d as Pin, f as Pause, g as Inbox, h as Menu, i as Terminal, j as ArrowRight, k as Check, l as Plus, m as Monitor, o as Shield, p as Paperclip, r as Trash2, s as Share2, t as X, u as Play, v as Globe, w as FilePenLine, x as FolderLock, y as Folder } from "../_libs/lucide-react.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { n as persist, r as create, t as createJSONStorage } from "../_libs/zustand.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CMYd0Yg3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
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
async function sha256Hex(data) {
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
	if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("SHA-256 is not available in this environment");
	const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
	const digest = await crypto.subtle.digest("SHA-256", buf);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function ggufBlob(params) {
	return `GGUF\n${JSON.stringify({
		localbot: 1,
		id: params.id,
		filename: params.filename,
		sizeBytes: params.sizeBytes,
		catalogSha256: params.sha256
	})}\n`;
}
async function checksumBlob(blob) {
	return sha256Hex(blob);
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
function posixDirname(path) {
	const n = posixJoin(path);
	const i = n.lastIndexOf("/");
	if (i <= 0) return "/";
	return n.slice(0, i) || "/";
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
function normalizePath(path) {
	if (!path) return "/";
	return posixJoin(path.startsWith("/") ? path : `/${path}`);
}
function ensureDir(vfs, path, mtime = Date.now()) {
	const n = normalizePath(path);
	if (n === "/") {
		if (!vfs["/"]) return {
			...vfs,
			"/": {
				path: "/",
				kind: "dir",
				content: "",
				mtime,
				size: 0
			}
		};
		return vfs;
	}
	let next = vfs;
	const parts = n.split("/").filter(Boolean);
	let cur = "";
	next = ensureDir(next, "/", mtime);
	for (const part of parts) {
		cur = `${cur}/${part}`;
		if (!next[cur] || next[cur].kind !== "dir") next = {
			...next,
			[cur]: {
				path: cur,
				kind: "dir",
				content: "",
				mtime,
				size: 0
			}
		};
	}
	return next;
}
function writeFile(vfs, path, content, mtime = Date.now()) {
	const n = normalizePath(path);
	if (n === "/") throw new Error("Cannot write file at /");
	let next = ensureDir(vfs, posixDirname(n), mtime);
	if (next[n]?.kind === "dir") throw new Error(`Cannot overwrite directory: ${n}`);
	next = {
		...next,
		[n]: {
			path: n,
			kind: "file",
			content,
			mtime,
			size: new TextEncoder().encode(content).length
		}
	};
	return next;
}
function readFile(vfs, path) {
	const n = normalizePath(path);
	const node = vfs[n];
	if (!node) throw new Error(`No such file: ${n}`);
	if (node.kind !== "file") throw new Error(`Not a file: ${n}`);
	return node.content;
}
function exists(vfs, path) {
	return Boolean(vfs[normalizePath(path)]);
}
function isDir(vfs, path) {
	return vfs[normalizePath(path)]?.kind === "dir";
}
function isFile(vfs, path) {
	return vfs[normalizePath(path)]?.kind === "file";
}
function listDir(vfs, path) {
	const n = normalizePath(path);
	const dir = vfs[n];
	if (!dir || dir.kind !== "dir") throw new Error(`Not a directory: ${n}`);
	const prefix = n === "/" ? "/" : n + "/";
	return Object.values(vfs).filter((node) => {
		if (node.path === n) return false;
		if (!node.path.startsWith(prefix)) return false;
		const rest = node.path.slice(prefix.length);
		return rest.length > 0 && !rest.includes("/");
	}).sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
		return a.path.localeCompare(b.path);
	});
}
function removeNode(vfs, path) {
	const n = normalizePath(path);
	if (n === "/") throw new Error("Cannot delete /");
	const next = { ...vfs };
	const prefix = n + "/";
	for (const key of Object.keys(next)) if (key === n || key.startsWith(prefix)) delete next[key];
	return next;
}
function moveTree(vfs, from, to) {
	const src = normalizePath(from);
	const dst = normalizePath(to);
	if (src === dst) return vfs;
	if (isUnder(dst, src) && dst !== src) throw new Error("Cannot move a folder into itself");
	const prefix = src + "/";
	let next = { ...vfs };
	const moving = Object.values(vfs).filter((n) => n.path === src || n.path.startsWith(prefix));
	if (moving.length === 0) throw new Error(`Nothing to move: ${src}`);
	next = ensureDir(next, posixDirname(dst));
	for (const node of moving) {
		const rel = node.path === src ? "" : node.path.slice(prefix.length);
		const np = rel ? `${dst}/${rel}` : dst;
		next[np] = {
			...node,
			path: np
		};
	}
	for (const node of moving) delete next[node.path];
	return next;
}
function strReplace(vfs, path, oldString, newString) {
	const current = readFile(vfs, path);
	if (!current.includes(oldString)) throw new Error(`Pattern not found in ${normalizePath(path)}`);
	return writeFile(vfs, path, current.replace(oldString, newString));
}
function writeJson(vfs, path, value) {
	return writeFile(vfs, path, JSON.stringify(value, null, 2) + "\n");
}
function prettyTree(vfs, root, max = 80) {
	const n = normalizePath(root);
	const prefix = n === "/" ? "/" : n + "/";
	const nodes = Object.values(vfs).filter((node) => node.path === n || node.path.startsWith(prefix)).sort((a, b) => a.path.localeCompare(b.path));
	const lines = [];
	for (const node of nodes) {
		if (lines.length >= max) {
			lines.push("  …");
			break;
		}
		const rel = node.path === n ? posixBasename(n) || "/" : node.path.slice(prefix.length);
		const depth = rel === posixBasename(n) || rel === "/" ? 0 : rel.split("/").length;
		const name = posixBasename(node.path) + (node.kind === "dir" ? "/" : "");
		lines.push(`${"  ".repeat(Math.max(0, depth - (node.path === n ? 0 : 0)))}${name}`);
	}
	const better = [];
	for (const node of nodes.slice(0, max)) {
		const rel = node.path === n ? "" : node.path.slice(prefix.length);
		const depth = rel === "" ? 0 : rel.split("/").length;
		const name = (rel === "" ? posixBasename(n) || node.path : posixBasename(node.path)) + (node.kind === "dir" ? "/" : "");
		better.push(`${"  ".repeat(depth)}${name}`);
	}
	if (nodes.length > max) better.push("  …");
	return better.join("\n");
}
function filePreview(vfs, path, max = 4e3) {
	const node = vfs[normalizePath(path)];
	if (!node) return "";
	if (node.kind === "dir") return "";
	if (node.content.length <= max) return node.content;
	return node.content.slice(0, max) + "\n…";
}
var DEFAULT_HOME = "/LocalBot";
var DEFAULT_COMPANY_ROOT = "/Documents/LocalBot";
function companyRootPath(companyName, rootBase = DEFAULT_COMPANY_ROOT) {
	return posixJoin(rootBase, companyName.trim() || "Studio");
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
function seedHome(vfs, home = DEFAULT_HOME) {
	let next = vfs;
	for (const p of [
		home,
		posixJoin(home, "models"),
		posixJoin(home, "sessions"),
		posixJoin(home, "logs")
	]) next = ensureDir(next, p);
	return next;
}
function seedCompanyTree(args) {
	const { company, department, employee, bots } = args;
	let vfs = args.vfs;
	vfs = ensureDir(vfs, company.root);
	vfs = writeJson(vfs, posixJoin(company.root, "company.json"), {
		name: company.name,
		catalogPin: company.catalogPin,
		defaultDepartment: department.name
	});
	vfs = ensureDir(vfs, posixJoin(company.root, "shared"));
	vfs = ensureDir(vfs, posixJoin(company.root, "departments"));
	vfs = ensureDir(vfs, department.path);
	vfs = writeJson(vfs, posixJoin(department.path, "department.json"), { name: department.name });
	vfs = ensureDir(vfs, posixJoin(department.path, "shared"));
	vfs = ensureDir(vfs, posixJoin(department.path, "people"));
	vfs = ensureDir(vfs, employee.path);
	vfs = writeJson(vfs, posixJoin(employee.path, "employee.json"), {
		displayName: employee.displayName,
		department: department.name,
		defaultModel: employee.defaultModelId
	});
	vfs = ensureDir(vfs, posixJoin(employee.path, "inbox"));
	vfs = ensureDir(vfs, posixJoin(employee.path, "outbox"));
	vfs = ensureDir(vfs, posixJoin(employee.path, "bots"));
	for (const bot of bots) vfs = seedBotFolder(vfs, bot, department, employee);
	return vfs;
}
function seedBotFolder(vfs, bot, department, employee) {
	let next = vfs;
	next = ensureDir(next, bot.path);
	next = ensureDir(next, posixJoin(bot.path, "memory"));
	next = ensureDir(next, posixJoin(bot.path, "workspace"));
	next = ensureDir(next, posixJoin(bot.path, "output"));
	next = writeJson(next, posixJoin(bot.path, "bot.json"), {
		name: bot.name,
		job: bot.job,
		modelId: bot.modelId,
		color: bot.color,
		grants: bot.grants,
		createdAt: bot.createdAt
	});
	next = writeFile(next, posixJoin(bot.path, "AGENTS.md"), `# ${bot.name}\n\n${bot.job}\n\n${bot.standingInstructions}\n`);
	next = writeFile(next, posixJoin(bot.path, "memory", "notes.md"), `# Memory\n\nStanding context for ${bot.name}.\n`);
	next = writeFile(next, posixJoin(department.path, "shared", ".keep"), `Department shared folder for ${department.name}.\nAny granted bot may read and write here.\n`);
	next = writeFile(next, posixJoin(employee.path, "outbox", ".keep"), `Finished deliverables for ${employee.displayName} land here.\n`);
	return next;
}
function writeModelBlob(vfs, home, model, blob) {
	const dir = posixJoin(home, "models");
	let next = ensureDir(vfs, dir);
	next = writeFile(next, model.path, blob);
	next = writeJson(next, posixJoin(dir, `${model.catalogId}.json`), {
		id: model.catalogId,
		filename: model.filename,
		sha256: model.sha256,
		sizeBytes: model.sizeBytes,
		downloadedAt: model.downloadedAt
	});
	return next;
}
function fail(vfs, msg) {
	return {
		stdout: "",
		stderr: msg,
		code: 1,
		vfs
	};
}
function ok(vfs, stdout) {
	return {
		stdout,
		stderr: "",
		code: 0,
		vfs
	};
}
function tokenize(command) {
	const out = [];
	let cur = "";
	let quote = null;
	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		if (quote) {
			if (ch === quote) quote = null;
			else cur += ch;
			continue;
		}
		if (ch === "'" || ch === "\"") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (cur) out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}
function runVirtualShell(vfs, cwd, command, sandboxRoot) {
	const tokens = tokenize(command.trim());
	if (tokens.length === 0) return ok(vfs, "");
	const [cmd, ...args] = tokens;
	const resolve = (p) => {
		const abs = p.startsWith("/") ? normalizePath(p) : posixJoin(cwd, p);
		if (!abs.startsWith(normalizePath(sandboxRoot))) throw new Error(`Refusing path outside sandbox: ${abs}`);
		return abs;
	};
	try {
		switch (cmd) {
			case "pwd": return ok(vfs, cwd);
			case "ls": {
				const flagLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
				const target = args.find((a) => !a.startsWith("-")) ?? ".";
				const path = resolve(target);
				if (!exists(vfs, path)) return fail(vfs, `ls: ${target}: no such file`);
				if (isFile(vfs, path)) return ok(vfs, posixBasename(path));
				const entries = listDir(vfs, path);
				if (!flagLong) return ok(vfs, entries.map((e) => posixBasename(e.path) + (e.kind === "dir" ? "/" : "")).join("\n"));
				return ok(vfs, entries.map((e) => `${e.kind === "dir" ? "d" : "-"}  ${String(e.size).padStart(6)}  ${posixBasename(e.path)}`).join("\n"));
			}
			case "cat": {
				if (!args[0]) return fail(vfs, "cat: missing file");
				const path = resolve(args[0]);
				if (!isFile(vfs, path)) return fail(vfs, `cat: ${args[0]}: not a file`);
				return ok(vfs, readFile(vfs, path));
			}
			case "mkdir": {
				const p = args.filter((a) => a !== "-p")[0];
				if (!p) return fail(vfs, "mkdir: missing operand");
				return ok(ensureDir(vfs, resolve(p)), "");
			}
			case "touch": {
				if (!args[0]) return fail(vfs, "touch: missing file");
				const path = resolve(args[0]);
				if (exists(vfs, path) && isFile(vfs, path)) return ok(writeFile(vfs, path, readFile(vfs, path)), "");
				return ok(writeFile(vfs, path, ""), "");
			}
			case "rm": {
				const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
				const target = args.find((a) => !a.startsWith("-"));
				if (!target) return fail(vfs, "rm: missing operand");
				const path = resolve(target);
				if (!exists(vfs, path)) return fail(vfs, `rm: ${target}: no such file`);
				if (isDir(vfs, path) && !recursive) return fail(vfs, `rm: ${target}: is a directory`);
				return ok(removeNode(vfs, path), "");
			}
			case "echo": {
				const redir = args.indexOf(">");
				const append = args.indexOf(">>");
				if (redir >= 0 && args[redir + 1]) {
					const text = args.slice(0, redir).join(" ") + "\n";
					return ok(writeFile(vfs, resolve(args[redir + 1]), text), "");
				}
				if (append >= 0 && args[append + 1]) {
					const path = resolve(args[append + 1]);
					return ok(writeFile(vfs, path, (isFile(vfs, path) ? readFile(vfs, path) : "") + (args.slice(0, append).join(" ") + "\n")), "");
				}
				return ok(vfs, args.join(" "));
			}
			case "mv":
			case "cp": {
				if (args.length < 2) return fail(vfs, `${cmd}: missing operand`);
				const src = resolve(args[0]);
				const dst = resolve(args[1]);
				if (!isFile(vfs, src)) return fail(vfs, `${cmd}: ${args[0]}: not a file`);
				let next = writeFile(vfs, dst, readFile(vfs, src));
				if (cmd === "mv") next = removeNode(next, src);
				return ok(next, "");
			}
			case "head": {
				const file = args.find((a) => !a.startsWith("-"));
				if (!file) return fail(vfs, "head: missing file");
				const path = resolve(file);
				const nFlag = args.find((a) => a.startsWith("-n"));
				const n = nFlag ? Number(nFlag.replace("-n", "") || args[args.indexOf(nFlag) + 1]) : 10;
				return ok(vfs, readFile(vfs, path).split("\n").slice(0, Number.isFinite(n) ? n : 10).join("\n"));
			}
			default: return fail(vfs, `${cmd}: command not available in the workspace shell. Use read_file / write_file / list_dir.`);
		}
	} catch (err) {
		return fail(vfs, err instanceof Error ? err.message : String(err));
	}
}
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
/**
* LocalBot inference and harness bind loopback only.
* The preview web server is a separate process and is not this bind.
*/
var LOOPBACK_HOST = "127.0.0.1";
var LOOPBACK_PORT = 18789;
`${LOOPBACK_HOST}${LOOPBACK_PORT}`;
function describeBind(host = LOOPBACK_HOST, port = LOOPBACK_PORT) {
	return {
		host,
		port,
		loopbackOnly: host === "127.0.0.1" || host === "localhost" || host === "::1",
		lanBind: host === "0.0.0.0" || host === "::" || host === "*",
		url: `http://${host}:${port}/v1`
	};
}
var DEFAULT_SETTINGS = {
	darkMode: true,
	webSearchEnabled: false,
	controlThisComputer: false,
	useExistingOllama: false,
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
		version: 1,
		onboarded: false,
		localbotHome: DEFAULT_HOME,
		company: null,
		departments: [],
		employees: [],
		bots: [],
		models: [],
		files: {},
		sessions: {},
		hardware: null,
		download: null,
		settings: DEFAULT_SETTINGS,
		runtime: {
			bindHost: LOOPBACK_HOST,
			bindPort: LOOPBACK_PORT,
			ready: false,
			engine: "embedded-llama.cpp",
			mode: "standard",
			lastHeartbeat: null
		},
		activeEmployeeId: null
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
var useLocalBot = create()(persist((set, get) => ({
	...emptySnapshot(),
	ui: DEFAULT_UI,
	hydrated: false,
	setHydrated: (v) => set({ hydrated: v }),
	setUi: (patch) => set({ ui: {
		...get().ui,
		...patch
	} }),
	resetAll: () => set({
		...emptySnapshot(),
		ui: { ...DEFAULT_UI },
		hydrated: true
	}),
	setHardware: (h) => set({ hardware: h }),
	setDownload: (job) => set({ download: job }),
	completeDownload: async (catalogId) => {
		const model = getCatalogModel(catalogId);
		if (!model) throw new Error("Unknown model");
		const blob = ggufBlob({
			id: model.id,
			filename: model.filename,
			sizeBytes: model.sizeBytes,
			sha256: model.sha256
		});
		const digest = await checksumBlob(blob);
		const record = {
			id: uid("mdl"),
			catalogId: model.id,
			filename: model.filename,
			path: posixJoin(get().localbotHome, "models", model.filename),
			sizeBytes: model.sizeBytes,
			sha256: digest,
			downloadedAt: nowIso(),
			source: "catalog"
		};
		set((s) => ({
			models: [...s.models.filter((m) => m.catalogId !== model.id), record],
			files: writeModelBlob(seedHome(s.files, s.localbotHome), s.localbotHome, record, blob),
			download: {
				catalogId: model.id,
				status: "done",
				progress: 1,
				startedAt: s.download?.startedAt ?? nowIso()
			},
			runtime: {
				...s.runtime,
				ready: true,
				lastHeartbeat: nowIso()
			}
		}));
		return record;
	},
	importGguf: async (filename, bytes) => {
		const blob = ggufBlob({
			id: `import-${filename}`,
			filename,
			sizeBytes: bytes,
			sha256: "import"
		});
		const digest = await checksumBlob(blob);
		const record = {
			id: uid("mdl"),
			catalogId: `import:${filename}`,
			filename,
			path: posixJoin(get().localbotHome, "models", filename),
			sizeBytes: bytes,
			sha256: digest,
			downloadedAt: nowIso(),
			source: "import"
		};
		set((s) => ({
			models: [...s.models, record],
			files: writeModelBlob(seedHome(s.files, s.localbotHome), s.localbotHome, record, blob),
			runtime: {
				...s.runtime,
				ready: true,
				lastHeartbeat: nowIso()
			}
		}));
		return record;
	},
	completeOnboarding: (input) => {
		const companyName = slugName(input.companyName);
		const deptName = slugName(input.departmentName);
		const empName = slugName(input.employeeName);
		const botName = slugName(input.botName);
		const root = companyRootPath(companyName, DEFAULT_COMPANY_ROOT);
		const deptP = departmentPath(root, deptName);
		const empP = employeePath(deptP, empName);
		const bP = botPath(empP, botName);
		const now = nowIso();
		const company = {
			id: uid("co"),
			name: companyName,
			root,
			defaultDepartmentId: "",
			catalogPin: CATALOG_PIN,
			createdAt: now
		};
		const department = {
			id: uid("dept"),
			companyId: company.id,
			name: deptName,
			path: deptP,
			createdAt: now
		};
		company.defaultDepartmentId = department.id;
		const employee = {
			id: uid("emp"),
			departmentId: department.id,
			displayName: empName,
			path: empP,
			defaultModelId: input.modelId,
			createdAt: now
		};
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
		let files = {};
		files = seedHome(files, DEFAULT_HOME);
		files = seedCompanyTree({
			vfs: files,
			company,
			department,
			employee,
			bots: [bot]
		});
		set({
			onboarded: true,
			localbotHome: DEFAULT_HOME,
			company,
			departments: [department],
			employees: [employee],
			bots: [bot],
			files,
			sessions: { [bot.id]: sessionOf(bot.id) },
			activeEmployeeId: employee.id,
			settings: {
				...get().settings,
				companyRootIsShared: input.sharedRoot
			},
			runtime: {
				...get().runtime,
				ready: get().models.length > 0,
				lastHeartbeat: now
			},
			ui: {
				...DEFAULT_UI,
				selectedBotId: bot.id,
				showComputer: true
			}
		});
	},
	createBot: (input) => {
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
		set({
			bots: [...s.bots, bot],
			files: seedBotFolder(s.files, bot, department, employee),
			sessions: {
				...s.sessions,
				[bot.id]: sessionOf(bot.id)
			},
			ui: {
				...s.ui,
				selectedBotId: bot.id,
				newAgentOpen: false
			}
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
	duplicateBot: (id) => {
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
	deleteBot: (id) => {
		const s = get();
		const bot = s.bots.find((b) => b.id === id);
		const files = bot ? removeNode(s.files, bot.path) : s.files;
		const sessions = { ...s.sessions };
		delete sessions[id];
		const remaining = s.bots.filter((b) => b.id !== id);
		set({
			bots: remaining,
			files,
			sessions,
			ui: {
				...s.ui,
				selectedBotId: s.ui.selectedBotId === id ? remaining[0]?.id ?? null : s.ui.selectedBotId
			}
		});
	},
	setBotGrants: (id, grants) => {
		set((s) => {
			const bot = s.bots.find((b) => b.id === id);
			if (!bot) return s;
			const files = writeFile(s.files, posixJoin(bot.path, "bot.json"), JSON.stringify({
				name: bot.name,
				job: bot.job,
				modelId: bot.modelId,
				color: bot.color,
				grants,
				createdAt: bot.createdAt
			}, null, 2) + "\n");
			return {
				bots: s.bots.map((b) => b.id === id ? {
					...b,
					grants
				} : b),
				files
			};
		});
	},
	moveBotToEmployee: (botId, employeeId) => {
		const s = get();
		const bot = s.bots.find((b) => b.id === botId);
		const employee = s.employees.find((e) => e.id === employeeId);
		const department = s.departments.find((d) => d.id === employee?.departmentId);
		if (!bot || !employee || !department) return;
		const dest = botPath(employee.path, bot.name);
		set({
			files: moveTree(s.files, bot.path, dest),
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
	createDepartment: (name) => {
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
		let files = s.files;
		files = seedCompanyTree({
			vfs: files,
			company: s.company,
			department,
			employee: {
				id: "tmp",
				departmentId: department.id,
				displayName: "_",
				path: employeePath(department.path, "_"),
				defaultModelId: null,
				createdAt: nowIso()
			},
			bots: []
		});
		files = removeNode(files, employeePath(department.path, "_"));
		set({
			departments: [...s.departments, department],
			files
		});
		return department;
	},
	createEmployee: (departmentId, displayName) => {
		const s = get();
		const department = s.departments.find((d) => d.id === departmentId);
		if (!department || !s.company) throw new Error("Missing department");
		const employee = {
			id: uid("emp"),
			departmentId,
			displayName: slugName(displayName),
			path: employeePath(department.path, slugName(displayName)),
			defaultModelId: s.models[0]?.catalogId ?? null,
			createdAt: nowIso()
		};
		const files = seedCompanyTree({
			vfs: s.files,
			company: s.company,
			department,
			employee,
			bots: []
		});
		set({
			employees: [...s.employees, employee],
			files
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
	applyVfs: (mut) => set((s) => ({ files: mut(s.files) })),
	writeBotFile: (botId, path, content) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = normalizePath(path);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		set((s) => ({ files: writeFile(s.files, n, content) }));
		return { ok: true };
	},
	readBotFile: (botId, path) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = normalizePath(path);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		try {
			return {
				ok: true,
				content: readFile(get().files, n)
			};
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},
	listBotDir: (botId, path) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = normalizePath(path);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		try {
			return {
				ok: true,
				listing: prettyTree(get().files, n, 80)
			};
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},
	replaceBotFile: (botId, path, oldString, newString) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = normalizePath(path);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		try {
			set((s) => ({ files: strReplace(s.files, n, oldString, newString) }));
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	},
	deleteBotFile: (botId, path) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const n = normalizePath(path);
		if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) return {
			ok: false,
			error: `Denied: ${n} is outside this agent's grants.`
		};
		if (!exists(get().files, n)) return {
			ok: false,
			error: `No such file: ${n}`
		};
		set((s) => ({ files: removeNode(s.files, n) }));
		return { ok: true };
	},
	shellBot: (botId, command) => {
		const ctx = resolveBot(get(), botId);
		if (!ctx) return {
			ok: false,
			error: "Unknown agent"
		};
		const result = runVirtualShell(get().files, ctx.bot.workspacePath, command, ctx.company.root);
		set({ files: result.vfs });
		return {
			ok: true,
			stdout: result.stdout,
			stderr: result.stderr,
			code: result.code
		};
	},
	handoffTask: (fromBotId, toBotName, task) => {
		const s = get();
		const from = resolveBot(s, fromBotId);
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
		const body = `# Handoff from ${from.bot.name} to ${to.name}\n\n${task}\n`;
		const files = writeFile(s.files, path, body);
		const toSess = s.sessions[to.id] ?? sessionOf(to.id);
		const notice = {
			id: uid("msg"),
			botId: to.id,
			role: "system",
			content: `${from.bot.name} handed you a task in shared/${filename}:\n\n${task}`,
			createdAt: nowIso()
		};
		set({
			files,
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
	setRuntimeReady: (ready) => set((s) => ({ runtime: {
		...s.runtime,
		ready,
		lastHeartbeat: nowIso()
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
	name: "localbot-state-v1",
	storage: createJSONStorage(() => memoryStorage),
	partialize: (s) => ({
		version: s.version,
		onboarded: s.onboarded,
		localbotHome: s.localbotHome,
		company: s.company,
		departments: s.departments,
		employees: s.employees,
		bots: s.bots,
		models: s.models,
		files: s.files,
		sessions: Object.fromEntries(Object.entries(s.sessions).map(([id, sess]) => [id, {
			...sess,
			running: false,
			stopRequested: false
		}])),
		hardware: s.hardware,
		download: s.download,
		settings: s.settings,
		runtime: s.runtime,
		activeEmployeeId: s.activeEmployeeId
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
		title: "Your agents, on this computer.",
		body: "LocalBot is a personal workspace. You pick a local model, create named agents, and talk to them like contacts. Each one has its own memory and its own folder."
	},
	{
		id: "stay",
		title: "Work stays here.",
		body: "There is no cloud account and no key on the default path. The model is a file on disk. Sessions, logs, and memory live in your LocalBot home."
	},
	{
		id: "grants",
		title: "Agents only touch folders you grant.",
		body: "The default computer is the agent’s workspace — not your whole home directory. Shell, deletes, network, and anything outside the company root always ask first."
	}
];
function Onboarding() {
	const [step, setStep] = (0, import_react.useState)("hello");
	const hardware = useLocalBot((s) => s.hardware);
	const setHardware = useLocalBot((s) => s.setHardware);
	const setDownload = useLocalBot((s) => s.setDownload);
	const download = useLocalBot((s) => s.download);
	const completeDownload = useLocalBot((s) => s.completeDownload);
	const completeOnboarding = useLocalBot((s) => s.completeOnboarding);
	const models = useLocalBot((s) => s.models);
	const [scanning, setScanning] = (0, import_react.useState)(false);
	const [picked, setPicked] = (0, import_react.useState)(null);
	const [company, setCompany] = (0, import_react.useState)("Studio");
	const [department, setDepartment] = (0, import_react.useState)("Operations");
	const [employee, setEmployee] = (0, import_react.useState)("You");
	const [shared, setShared] = (0, import_react.useState)(false);
	const [botName, setBotName] = (0, import_react.useState)("Writer");
	const [botJob, setBotJob] = (0, import_react.useState)(TEMPLATES[0].job);
	const [color, setColor] = (0, import_react.useState)("sage");
	const cards = (0, import_react.useMemo)(() => hardware ? onboardingCards(hardware) : null, [hardware]);
	(0, import_react.useEffect)(() => {
		if (step !== "scan") return;
		setScanning(true);
		const t = window.setTimeout(() => {
			setHardware(scanBrowserHardware());
			setScanning(false);
		}, 1100);
		return () => window.clearTimeout(t);
	}, [step, setHardware]);
	const goDownload = (id) => {
		setPicked(id);
		setDownload({
			catalogId: id,
			status: "running",
			progress: 0,
			startedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		setStep("download");
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
					onPick: goDownload,
					onBack: () => setStep("scan")
				}),
				step === "download" && picked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DownloadStep, {
					catalogId: picked,
					job: download,
					setJob: setDownload,
					onDone: async () => {
						if (!models.some((m) => m.catalogId === picked)) await completeDownload(picked);
						setStep("agent");
					}
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
					onTemplate: (t) => {
						setBotName(t.name);
						setBotJob(t.job);
						setColor(t.color);
					},
					onBack: () => setStep("models"),
					onFinish: () => {
						const modelId = picked ?? useLocalBot.getState().models[0]?.catalogId ?? "gemma4-e2b-q4";
						completeOnboarding({
							companyName: company,
							departmentName: department,
							employeeName: employee,
							botName,
							botJob,
							color,
							modelId,
							sharedRoot: shared
						});
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
				children: "LocalBot sizes the model catalog from RAM, GPU, and disk — never by asking you to guess."
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
						["Free disk", scanning ? "…" : hardware ? `${hardware.freeDiskGb} GB` : "—"]
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
			hardware?.ramSource === "assumed-desktop" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-xs leading-relaxed text-muted",
				children: "Browsers cap reported RAM at 8 GB. This looks like a desktop, so LocalBot treats it as a 16 GB class machine for recommendations."
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
					children: ["See models", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" })]
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
				children: "Pick a model"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-xl text-sm text-muted",
				children: "Ungated GGUF files only. Grey cards will not load on this machine."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6 grid gap-3 md:grid-cols-3",
				children: items.map(({ key, title, model }) => {
					if (!model) return null;
					const fit = cards.fits[model.id];
					const disabled = !fit?.fits;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled,
						onClick: () => onPick(model.id),
						className: "flex flex-col rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[transform,background-color] duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] tracking-wider text-subtle uppercase",
									children: title
								}), key === "recommended" && fit?.fits && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent",
									children: "Best fit"
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
								children: fit?.reason
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
function DownloadStep({ catalogId, job, setJob, onDone }) {
	const paused = job?.status === "paused";
	(0, import_react.useEffect)(() => {
		let p = useLocalBot.getState().download?.progress ?? 0;
		let finished = false;
		const tick = window.setInterval(() => {
			if (finished) return;
			const cur = useLocalBot.getState().download;
			if (!cur || cur.catalogId !== catalogId) return;
			if (cur.status === "paused") return;
			if (cur.status === "done" || cur.status === "verifying") return;
			p = Math.min(1, p + .04 + Math.random() * .025);
			if (p >= 1) {
				finished = true;
				window.clearInterval(tick);
				setJob({
					...cur,
					status: "verifying",
					progress: 1
				});
				window.setTimeout(() => {
					onDone();
				}, 400);
				return;
			}
			setJob({
				...cur,
				status: "running",
				progress: p
			});
		}, 80);
		return () => window.clearInterval(tick);
	}, [catalogId]);
	const pct = Math.round((job?.progress ?? 0) * 100);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "stagger-in flex flex-1 flex-col justify-center py-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase",
				children: "Models"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-3xl font-medium tracking-tight",
				children: "Downloading GGUF"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted",
				children: "Saved under LocalBot home / models. Checksum verified before the file is marked ready."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-xs text-muted",
							children: catalogId
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "tabular-nums text-fg",
							children: [pct, "%"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 h-2 overflow-hidden rounded-full bg-raised",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full rounded-full bg-accent transition-[width] duration-150",
							style: { width: `${pct}%` }
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xs text-muted",
						children: job?.status === "verifying" ? "Verifying checksum…" : paused ? "Paused" : "Writing into ~/.localbot/models"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4",
						children: paused ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "secondary",
							size: "sm",
							onClick: () => job && setJob({
								...job,
								status: "running"
							}),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-3.5" }), "Resume"]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "secondary",
							size: "sm",
							disabled: job?.status === "verifying",
							onClick: () => job && setJob({
								...job,
								status: "paused"
							}),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-3.5" }), "Pause"]
						})
					})
				]
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
				children: "This writes the company tree on disk. The agent’s computer is its workspace folder."
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
						}), "Company root is a shared drive"]
					})
				]
			}),
			props.shared ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-muted",
				children: "Point both installs at the same folder. LocalBot does not sync on its own — the folder is the bus."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs text-muted",
				children: "Shared departments require a shared folder path."
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
				className: "mt-5 font-mono text-[11px] leading-relaxed text-subtle",
				children: `/Documents/LocalBot/${props.company || "Studio"}/departments/${props.department || "Operations"}/people/${props.employee || "You"}/bots/${props.botName || "Writer"}/`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 flex gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					onClick: props.onBack,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), "Back"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: props.onFinish,
					disabled: !props.botName.trim(),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }), "Open chat"]
				})]
			})
		]
	});
}
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
var runHarnessTurn = createServerFn({ method: "POST" }).validator((input) => input).handler(createSsrRpc("6532b4f18cc5bcc2361d69f45f2f84e2d4d87ad9ed8a519945f97f3260b8e7bc"));
function buildSystemPrompt(s, bot) {
	const ctx = resolveBot(s, bot.id);
	if (!ctx) return "You are a LocalBot agent.";
	const modelName = getCatalogModel(bot.modelId)?.name ?? bot.modelId;
	let memory = "";
	try {
		memory = readFile(s.files, `${bot.memoryPath}/notes.md`);
	} catch {
		memory = "";
	}
	let standing = "";
	try {
		standing = readFile(s.files, `${bot.path}/AGENTS.md`);
	} catch {
		standing = bot.standingInstructions;
	}
	const shared = bot.grants.includes("shared") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared") : null;
	const outbox = bot.grants.includes("outbox") ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox") : null;
	const tree = prettyTree(s.files, bot.path, 60);
	const sharedTree = shared ? prettyTree(s.files, shared, 40) : "(not granted)";
	return `You are ${bot.name}, a LocalBot agent running on the employee's computer.
Job: ${bot.job}
Local model (identity): ${modelName}
Employee: ${ctx.employee.displayName}
Department: ${ctx.department.name}
Company: ${ctx.company.name}

You do real work by calling tools. Prefer write_file / str_replace / list_dir over talking about work. When the user asks you to create something, actually write it into output/ or workspace/. Put finished deliverables in output/ AND copy a final version into the employee outbox when it is granted.

Paths you may use:
- workspace: ${bot.workspacePath}
- output: ${bot.outputPath}
- memory: ${bot.memoryPath}
${shared ? `- department shared: ${shared}` : "- department shared: not granted"}
${outbox ? `- outbox: ${outbox}` : ""}

Current workspace tree:
${tree}

Shared folder:
${sharedTree}

Standing instructions:
${standing}

Memory:
${memory}

Rules:
- Never claim you cannot write files. You can. Use tools.
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
* Isolation layer: the UI talks to this adapter, never to model plugins.
* Desktop builds point the model plugin at http://127.0.0.1:18789/v1.
* This web workspace uses the same event shape.
*/
function parseArgs(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
function executeTool(botId, call) {
	const s = useLocalBot.getState();
	switch (call.name) {
		case "read_file": {
			const path = String(call.args.path ?? "");
			const r = s.readBotFile(botId, path);
			return r.ok ? r.content : r.error;
		}
		case "write_file": {
			const path = String(call.args.path ?? "");
			const content = String(call.args.content ?? "");
			const r = s.writeBotFile(botId, path, content);
			return r.ok ? `Wrote ${path} (${content.length} chars)` : r.error;
		}
		case "str_replace": {
			const path = String(call.args.path ?? "");
			const r = s.replaceBotFile(botId, path, String(call.args.old_string ?? ""), String(call.args.new_string ?? ""));
			return r.ok ? `Edited ${path}` : r.error;
		}
		case "list_dir": {
			const path = String(call.args.path ?? "");
			const r = s.listBotDir(botId, path);
			return r.ok ? r.listing : r.error;
		}
		case "delete_file": {
			const path = String(call.args.path ?? "");
			const r = s.deleteBotFile(botId, path);
			return r.ok ? `Deleted ${path}` : r.error;
		}
		case "run_command": {
			const command = String(call.args.command ?? "");
			const r = s.shellBot(botId, command);
			if (!r.ok) return r.error;
			return [r.stdout, r.stderr].filter(Boolean).join("\n") || `(exit ${r.code})`;
		}
		case "web_search": return "Network is gated. Enable web search in Settings to use this tool on the desktop runtime.";
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
	const messages = [{
		role: "system",
		content: buildSystemPrompt(useLocalBot.getState(), ctx.bot) + `\n\nOther agents:\n${rosterBlurb(useLocalBot.getState())}`
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
			persistTranscript(opts.botId);
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
	persistTranscript(opts.botId);
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
	const output = executeTool(botId, call);
	const denied = output.startsWith("Denied");
	events.onChipUpdate(chipId, { status: denied ? "denied" : "ok" });
	return output;
}
function persistTranscript(botId) {
	const s = useLocalBot.getState();
	const bot = s.bots.find((b) => b.id === botId);
	if (!bot) return;
	const sess = s.sessions[botId];
	if (!sess) return;
	const path = `${s.localbotHome}/sessions/${botId}/transcript.json`;
	const body = JSON.stringify({
		botId,
		name: bot.name,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		messages: sess.messages.map((m) => ({
			role: m.role,
			content: m.content,
			createdAt: m.createdAt
		}))
	}, null, 2);
	s.applyVfs((vfs) => writeFile(vfs, path, body));
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
	const model = getCatalogModel(bot.modelId);
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
			const result = handoffTask(bot.id, name, trimmed);
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
		const r = writeBotFile(bot.id, path, text);
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
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "truncate text-[11px] text-muted",
							children: [
								bot.job,
								" · ",
								model?.name ?? bot.modelId
							]
						})]
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
	const files = useLocalBot((s) => s.files);
	const bots = useLocalBot((s) => s.bots);
	const bot = bots.find((b) => b.id === selected) ?? null;
	const previewPath = useLocalBot((s) => s.ui.previewPath);
	const company = useLocalBot((s) => s.company);
	const employees = useLocalBot((s) => s.employees);
	const departments = useLocalBot((s) => s.departments);
	const show = useLocalBot((s) => s.ui.showComputer);
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
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-3.5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "output",
						root: bot.outputPath,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "size-3.5" })
					}),
					shared && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "shared",
						root: shared,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Share2, { className: "size-3.5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeSection, {
						title: "outbox",
						root: outbox,
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inbox, { className: "size-3.5" })
					}),
					previewPath && files[normalizePath(previewPath)]?.kind === "file" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-1 truncate font-mono text-[10px] text-subtle",
							children: posixBasename(previewPath)
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
							className: "max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap",
							children: filePreview(files, previewPath, 2500)
						})]
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
function TreeSection({ title, root, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mb-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-wider text-subtle uppercase",
			children: [icon, title]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileTree, {
			path: root,
			depth: 0
		})]
	});
}
function FileTree({ path, depth }) {
	const files = useLocalBot((s) => s.files);
	const setUi = useLocalBot((s) => s.setUi);
	const preview = useLocalBot((s) => s.ui.previewPath);
	const [open, setOpen] = (0, import_react.useState)(depth < 2);
	const n = normalizePath(path);
	const node = files[n];
	const children = (0, import_react.useMemo)(() => {
		try {
			return node?.kind === "dir" ? listDir(files, n) : [];
		} catch {
			return [];
		}
	}, [
		files,
		n,
		node?.kind
	]);
	if (!node) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-2 py-1 text-[11px] text-subtle",
		children: "Folder not created yet."
	});
	if (node.kind === "file") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setUi({ previewPath: n }),
		className: `flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${preview === n ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"}`,
		style: { paddingLeft: 8 + depth * 10 },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "size-3 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "truncate",
			children: posixBasename(n)
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
				children: posixBasename(n)
			})
		]
	}), open && children.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileTree, {
		path: c.path,
		depth: depth + 1
	}, c.path))] });
}
function NewAgentDialog() {
	const open = useLocalBot((s) => s.ui.newAgentOpen);
	const setUi = useLocalBot((s) => s.setUi);
	const createBot = useLocalBot((s) => s.createBot);
	const models = useLocalBot((s) => s.models);
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
			modelId: models[0]?.catalogId ?? "gemma4-e2b-q4",
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
				label: "LocalBot home",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs text-muted",
					children: "~/.localbot · app config, models, sessions, logs"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "Uninstalling LocalBot does not delete the company root. Your files stay on disk."
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
	const models = useLocalBot((s) => s.models);
	const hardware = useLocalBot((s) => s.hardware);
	const setHardware = useLocalBot((s) => s.setHardware);
	const completeDownload = useLocalBot((s) => s.completeDownload);
	const importGguf = useLocalBot((s) => s.importGguf);
	const updateBot = useLocalBot((s) => s.updateBot);
	const selected = useLocalBot((s) => s.ui.selectedBotId);
	const fileRef = (0, import_react.useRef)(null);
	const cards = onboardingCards(hardware ?? scanBrowserHardware());
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-sm font-medium",
						children: "Downloaded"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						size: "sm",
						onClick: () => fileRef.current?.click(),
						children: "Import GGUF"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: fileRef,
						type: "file",
						accept: ".gguf",
						className: "hidden",
						onChange: (e) => {
							const f = e.target.files?.[0];
							if (f) importGguf(f.name, f.size);
							e.target.value = "";
						}
					})
				]
			}),
			models.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "No models yet."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2",
				children: models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between rounded-md bg-raised px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm",
						children: getCatalogModel(m.catalogId)?.name ?? m.filename
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-[11px] text-subtle",
						children: m.filename
					})] }), selected && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						variant: "secondary",
						onClick: () => updateBot(selected, { modelId: m.catalogId }),
						children: "Use on agent"
					})]
				}, m.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-sm font-medium",
				children: "Catalog"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-2",
				children: CATALOG.map((m) => {
					const fit = cards.fits[m.id];
					const have = models.some((d) => d.catalogId === m.id);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm",
							children: m.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted",
							children: fit?.reason
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "secondary",
							disabled: !fit?.fits || have,
							onClick: () => void completeDownload(m.id),
							children: have ? "Ready" : fit?.fits ? "Download" : "Won't fit"
						})]
					}, m.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				size: "sm",
				onClick: () => setHardware(scanBrowserHardware()),
				children: "Re-scan hardware"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted",
				children: "Ollama is not required. If it is already running on a desktop install, Settings can attach to it as an advanced option."
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
	const models = useLocalBot((s) => s.models);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
				label: "Company root",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs leading-relaxed text-muted",
					children: company?.root ?? "—"
				})
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
			!settings.companyRootIsShared && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted",
				children: "Shared departments require a shared folder path. Employee Two on another laptop will not see Employee One until both installs point at the same company root."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => createDepartment("Research"),
					children: "Add department"
				}), departments[0] && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => createEmployee(departments[0].id, "Teammate"),
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
						onChange: (e) => moveBotToEmployee(bot.id, e.target.value),
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
				onClick: () => createBot({
					name: `Agent ${bots.length + 1}`,
					job: "Generalist",
					color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length].id,
					modelId: models[0]?.catalogId ?? "gemma4-e2b-q4"
				}),
				children: "New agent"
			})
		]
	});
}
function RuntimePane() {
	const runtime = useLocalBot((s) => s.runtime);
	const bind = describeBind(runtime.bindHost, runtime.bindPort);
	const models = useLocalBot((s) => s.models);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Engine",
				v: runtime.engine
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Mode",
				v: runtime.mode
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Bind",
				v: `${bind.host}:${bind.port}`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Loopback only",
				v: bind.loopbackOnly ? "Yes" : "NO — blocked"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "LAN bind",
				v: bind.lanBind ? "Yes" : "No"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "OpenAI base",
				v: bind.url
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Status",
				v: runtime.ready || models.length > 0 ? "Ready" : "Waiting for a model"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
				k: "Provider keys",
				v: "None on the default path"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-muted",
				children: "UI talks to the LocalBot runtime. The runtime talks to the harness adapter. The adapter talks to the local OpenAI-compatible endpoint. The UI never calls the model directly."
			})
		]
	});
}
function SafetyPane() {
	const settings = useLocalBot((s) => s.settings);
	const updateSettings = useLocalBot((s) => s.updateSettings);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
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
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: "mt-1 size-4 accent-accent",
					checked: settings.useExistingOllama,
					onChange: (e) => updateSettings({ useExistingOllama: e.target.checked })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "block text-sm",
					children: "Use existing Ollama"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs text-muted",
					children: "Advanced. Not the default, and not required."
				})] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
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
						children: "Off. Turns off permission cards for shell. Full host control is not the default profile."
					})] })]
				})
			})
		]
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
			className: "font-mono text-xs text-fg",
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
	const models = useLocalBot((s) => s.models);
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
										onClick: () => duplicateBot(bot.id),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-3.5" }), " Duplicate"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => hideBot(bot.id, true),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "size-3.5" }), " Hide"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MenuItem, {
										onClick: () => deleteBot(bot.id),
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
					children: models[0] ? getCatalogModel(models[0].catalogId)?.name ?? "Local model ready" : "No model"
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
	(0, import_react.useEffect)(() => {
		const unsub = useLocalBot.persist.onFinishHydration(() => setReady(true));
		if (useLocalBot.persist.hasHydrated()) setReady(true);
		return unsub;
	}, []);
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
