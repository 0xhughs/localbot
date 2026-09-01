import fs from "node:fs";
import "node:os";
import path from "node:path";
var llama_assets_default = {
	release: "b10749",
	notes: "Official ggml-org/llama.cpp release assets. Linux uses the ubuntu-x64 tarball; Windows uses the CPU zip (not CUDA). Do not assume Ubuntu-only.",
	targets: {
		"darwin-arm64": {
			"filename": "llama-b10749-bin-macos-arm64.tar.gz",
			"kind": "tar.gz",
			"binary": "llama-server",
			"url": "https://github.com/ggml-org/llama.cpp/releases/download/b10749/llama-b10749-bin-macos-arm64.tar.gz"
		},
		"darwin-x64": {
			"filename": "llama-b10749-bin-macos-x64.tar.gz",
			"kind": "tar.gz",
			"binary": "llama-server",
			"url": "https://github.com/ggml-org/llama.cpp/releases/download/b10749/llama-b10749-bin-macos-x64.tar.gz"
		},
		"win32-x64": {
			"filename": "llama-b10749-bin-win-cpu-x64.zip",
			"kind": "zip",
			"binary": "llama-server.exe",
			"url": "https://github.com/ggml-org/llama.cpp/releases/download/b10749/llama-b10749-bin-win-cpu-x64.zip"
		},
		"linux-x64": {
			"filename": "llama-b10749-bin-ubuntu-x64.tar.gz",
			"kind": "tar.gz",
			"binary": "llama-server",
			"url": "https://github.com/ggml-org/llama.cpp/releases/download/b10749/llama-b10749-bin-ubuntu-x64.tar.gz"
		}
	}
};
llama_assets_default.release;
var ASSETS = {
	"linux-x64": row("linux-x64"),
	"darwin-arm64": row("darwin-arm64"),
	"darwin-x64": row("darwin-x64"),
	"win32-x64": row("win32-x64")
};
function row(target) {
	const t = llama_assets_default.targets[target];
	return {
		target,
		url: t.url,
		filename: t.filename,
		kind: t.kind,
		binary: t.binary
	};
}
function llamaTarget(platform = process.platform, arch = process.arch) {
	const p = String(platform);
	const a = String(arch);
	if (p === "linux" && (a === "x64" || a === "x86_64")) return "linux-x64";
	if (p === "darwin" && (a === "arm64" || a === "aarch64")) return "darwin-arm64";
	if (p === "darwin") return "darwin-x64";
	if ((p === "win32" || p === "windows") && (a === "x64" || a === "x86_64")) return "win32-x64";
	return null;
}
function llamaAssetFor(platform, arch) {
	const t = llamaTarget(platform, arch);
	return t ? ASSETS[t] : null;
}
//#endregion
//#region src/lib/fs/disk.ts
function isElectronRuntime() {
	return process.env.LOCALBOT_ELECTRON === "1";
}
function dataDir() {
	if (process.env.LOCALBOT_DATA_DIR) return path.resolve(process.env.LOCALBOT_DATA_DIR);
	return path.resolve(process.cwd(), "data");
}
function configPath() {
	return path.join(dataDir(), "localbot-config.json");
}
function slugName(name) {
	return name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ") || "Untitled";
}
function defaultCompanyRoot(companyName = "Studio") {
	const name = slugName(companyName) || "Studio";
	if (process.env.LOCALBOT_DOCUMENTS_DIR) return path.join(process.env.LOCALBOT_DOCUMENTS_DIR, "LocalBot", name);
	return path.join(dataDir(), "LocalBot", name);
}
function isUnderDir(root, target) {
	const r = path.resolve(root);
	const t = path.resolve(target);
	if (t === r) return true;
	const rel = path.relative(r, t);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
function isUnderProjectData(p) {
	return isUnderDir(dataDir(), p) || path.resolve(p) === dataDir();
}
function defaultModelsDir() {
	if (isElectronRuntime()) return path.join(dataDir(), "models");
	return path.join(dataDir(), "LocalBot", "models");
}
function llamaBinRoot() {
	if (isElectronRuntime()) return path.join(dataDir(), "bin");
	return path.join(dataDir(), "LocalBot", "bin");
}
function llamaServerName() {
	return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}
function llamaBinDir() {
	const root = llamaBinRoot();
	const key = llamaTarget() ?? `${process.platform}-${process.arch}`;
	const preferred = path.join(root, key);
	const name = llamaServerName();
	const candidates = [
		preferred,
		path.join(root, "llama-b10749"),
		root
	];
	for (const dir of candidates) if (fs.existsSync(path.join(dir, name))) return dir;
	return preferred;
}
var DEFAULT_CFG_FIELDS = {
	activeModelId: null,
	activeModelPath: null,
	allowHostedDemo: false,
	useExistingOllama: false
};
function emptyConfig() {
	return {
		companyRoot: defaultCompanyRoot(),
		previewWritesToProjectData: true,
		modelsDir: defaultModelsDir(),
		...DEFAULT_CFG_FIELDS
	};
}
function loadConfig() {
	const fallback = emptyConfig();
	try {
		const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
		const companyRoot = raw.companyRoot ? path.resolve(raw.companyRoot) : fallback.companyRoot;
		const modelsDir = raw.modelsDir ? path.resolve(raw.modelsDir) : defaultModelsDir();
		return {
			companyRoot,
			previewWritesToProjectData: isUnderProjectData(companyRoot),
			modelsDir,
			activeModelId: raw.activeModelId ?? null,
			activeModelPath: raw.activeModelPath ? path.resolve(raw.activeModelPath) : null,
			allowHostedDemo: Boolean(raw.allowHostedDemo),
			useExistingOllama: Boolean(raw.useExistingOllama)
		};
	} catch {
		return fallback;
	}
}
function patchConfig(patch) {
	const cur = loadConfig();
	const companyRoot = path.resolve((patch.companyRoot ?? cur.companyRoot).trim() || defaultCompanyRoot());
	const modelsDir = path.resolve(patch.modelsDir ?? cur.modelsDir ?? defaultModelsDir());
	const next = {
		companyRoot,
		previewWritesToProjectData: isUnderProjectData(companyRoot),
		modelsDir,
		activeModelId: patch.activeModelId !== void 0 ? patch.activeModelId : cur.activeModelId,
		activeModelPath: patch.activeModelPath !== void 0 ? patch.activeModelPath ? path.resolve(patch.activeModelPath) : null : cur.activeModelPath,
		allowHostedDemo: patch.allowHostedDemo !== void 0 ? patch.allowHostedDemo : cur.allowHostedDemo,
		useExistingOllama: patch.useExistingOllama !== void 0 ? patch.useExistingOllama : cur.useExistingOllama
	};
	fs.mkdirSync(dataDir(), { recursive: true });
	fs.mkdirSync(next.modelsDir, { recursive: true });
	fs.mkdirSync(next.companyRoot, { recursive: true });
	fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
	return next;
}
function saveConfig(companyRoot) {
	return patchConfig({ companyRoot });
}
function assertInsideRoot(companyRoot, target) {
	const root = path.resolve(companyRoot);
	const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
	if (!isUnderDir(root, abs) && abs !== root) throw new Error(`Denied: ${abs} is outside company root ${root}`);
	return abs;
}
function grantAllowed(target, allowedRoots) {
	const abs = path.resolve(target);
	return allowedRoots.some((r) => {
		const root = path.resolve(r);
		return abs === root || isUnderDir(root, abs);
	});
}
function authorize(companyRoot, target, allowedRoots) {
	const abs = assertInsideRoot(companyRoot, target);
	if (allowedRoots && allowedRoots.length > 0 && !grantAllowed(abs, allowedRoots)) throw new Error(`Denied: ${abs} is outside this agent's grants.`);
	return abs;
}
function diskExists(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	return fs.existsSync(abs);
}
function diskMkdir(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	fs.mkdirSync(abs, { recursive: true });
}
function diskWrite(companyRoot, target, content, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content, "utf8");
}
function diskRead(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	if (!fs.existsSync(abs)) throw new Error(`No such file: ${abs}`);
	if (fs.statSync(abs).isDirectory()) throw new Error(`Not a file: ${abs}`);
	return fs.readFileSync(abs, "utf8");
}
function diskList(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	if (!fs.existsSync(abs)) throw new Error(`No such directory: ${abs}`);
	if (!fs.statSync(abs).isDirectory()) throw new Error(`Not a directory: ${abs}`);
	return fs.readdirSync(abs, { withFileTypes: true }).map((d) => {
		const p = path.join(abs, d.name);
		const kind = d.isDirectory() ? "dir" : "file";
		let size = 0;
		try {
			size = d.isFile() ? fs.statSync(p).size : 0;
		} catch {
			size = 0;
		}
		return {
			path: p,
			name: d.name,
			kind,
			size
		};
	}).sort((a, b) => a.kind !== b.kind ? a.kind === "dir" ? -1 : 1 : a.name.localeCompare(b.name));
}
function diskStat(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	if (!fs.existsSync(abs)) return null;
	const st = fs.statSync(abs);
	return {
		path: abs,
		name: path.basename(abs),
		kind: st.isDirectory() ? "dir" : "file",
		size: st.isFile() ? st.size : 0
	};
}
function diskDelete(companyRoot, target, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	if (abs === path.resolve(companyRoot)) throw new Error("Denied: cannot delete the company root");
	if (!fs.existsSync(abs)) throw new Error(`No such file: ${abs}`);
	fs.rmSync(abs, {
		recursive: true,
		force: true
	});
}
function diskReplace(companyRoot, target, oldString, newString, allowedRoots) {
	const current = diskRead(companyRoot, target, allowedRoots);
	if (!current.includes(oldString)) throw new Error(`Pattern not found in ${target}`);
	diskWrite(companyRoot, target, current.replace(oldString, newString), allowedRoots);
}
function diskMove(companyRoot, from, to, allowedRoots) {
	const src = authorize(companyRoot, from, allowedRoots);
	const dst = authorize(companyRoot, to, allowedRoots);
	if (!fs.existsSync(src)) throw new Error(`Nothing to move: ${src}`);
	fs.mkdirSync(path.dirname(dst), { recursive: true });
	fs.renameSync(src, dst);
}
function diskPrettyTree(companyRoot, target, max = 80, allowedRoots) {
	const abs = authorize(companyRoot, target, allowedRoots);
	const lines = [];
	const walk = (dir, depth) => {
		if (lines.length >= max) return;
		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const e of entries) {
			if (lines.length >= max) {
				lines.push("  …");
				return;
			}
			lines.push(`${"  ".repeat(depth)}${e.name}${e.isDirectory() ? "/" : ""}`);
			if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
		}
	};
	if (!fs.existsSync(abs)) return "(missing)";
	const st = fs.statSync(abs);
	lines.push(path.basename(abs) + (st.isDirectory() ? "/" : ""));
	if (st.isDirectory()) walk(abs, 1);
	return lines.join("\n");
}
function tokenize(command) {
	const out = [];
	let cur = "";
	let quote = null;
	for (const ch of command) {
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
function diskShell(companyRoot, cwd, command, allowedRoots) {
	const tokens = tokenize(command.trim());
	if (tokens.length === 0) return {
		stdout: "",
		stderr: "",
		code: 0
	};
	const [cmd, ...args] = tokens;
	const resolve = (p) => {
		return authorize(companyRoot, p.startsWith("/") ? p : path.join(cwd, p), allowedRoots);
	};
	try {
		switch (cmd) {
			case "pwd": return {
				stdout: cwd,
				stderr: "",
				code: 0
			};
			case "ls": {
				const target = args.find((a) => !a.startsWith("-")) ?? ".";
				const abs = resolve(target);
				if (!fs.existsSync(abs)) return {
					stdout: "",
					stderr: `ls: ${target}: no such file`,
					code: 1
				};
				if (fs.statSync(abs).isFile()) return {
					stdout: path.basename(abs),
					stderr: "",
					code: 0
				};
				const flagLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
				const entries = diskList(companyRoot, abs, allowedRoots);
				if (!flagLong) return {
					stdout: entries.map((e) => e.name + (e.kind === "dir" ? "/" : "")).join("\n"),
					stderr: "",
					code: 0
				};
				return {
					stdout: entries.map((e) => `${e.kind === "dir" ? "d" : "-"}  ${String(e.size).padStart(6)}  ${e.name}`).join("\n"),
					stderr: "",
					code: 0
				};
			}
			case "cat":
				if (!args[0]) return {
					stdout: "",
					stderr: "cat: missing file",
					code: 1
				};
				return {
					stdout: diskRead(companyRoot, resolve(args[0]), allowedRoots),
					stderr: "",
					code: 0
				};
			case "mkdir": {
				const p = args.filter((a) => a !== "-p")[0];
				if (!p) return {
					stdout: "",
					stderr: "mkdir: missing operand",
					code: 1
				};
				diskMkdir(companyRoot, resolve(p), allowedRoots);
				return {
					stdout: "",
					stderr: "",
					code: 0
				};
			}
			case "touch": {
				if (!args[0]) return {
					stdout: "",
					stderr: "touch: missing file",
					code: 1
				};
				const abs = resolve(args[0]);
				if (fs.existsSync(abs) && fs.statSync(abs).isFile()) fs.utimesSync(abs, /* @__PURE__ */ new Date(), /* @__PURE__ */ new Date());
				else diskWrite(companyRoot, abs, "", allowedRoots);
				return {
					stdout: "",
					stderr: "",
					code: 0
				};
			}
			case "rm": {
				const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
				const target = args.find((a) => !a.startsWith("-"));
				if (!target) return {
					stdout: "",
					stderr: "rm: missing operand",
					code: 1
				};
				const abs = resolve(target);
				if (!fs.existsSync(abs)) return {
					stdout: "",
					stderr: `rm: ${target}: no such file`,
					code: 1
				};
				if (fs.statSync(abs).isDirectory() && !recursive) return {
					stdout: "",
					stderr: `rm: ${target}: is a directory`,
					code: 1
				};
				diskDelete(companyRoot, abs, allowedRoots);
				return {
					stdout: "",
					stderr: "",
					code: 0
				};
			}
			case "echo": {
				const redir = args.indexOf(">");
				const append = args.indexOf(">>");
				if (redir >= 0 && args[redir + 1]) {
					diskWrite(companyRoot, resolve(args[redir + 1]), args.slice(0, redir).join(" ") + "\n", allowedRoots);
					return {
						stdout: "",
						stderr: "",
						code: 0
					};
				}
				if (append >= 0 && args[append + 1]) {
					const dest = resolve(args[append + 1]);
					diskWrite(companyRoot, dest, (fs.existsSync(dest) && fs.statSync(dest).isFile() ? diskRead(companyRoot, dest, allowedRoots) : "") + args.slice(0, append).join(" ") + "\n", allowedRoots);
					return {
						stdout: "",
						stderr: "",
						code: 0
					};
				}
				return {
					stdout: args.join(" "),
					stderr: "",
					code: 0
				};
			}
			case "mv":
			case "cp": {
				if (args.length < 2) return {
					stdout: "",
					stderr: `${cmd}: missing operand`,
					code: 1
				};
				const src = resolve(args[0]);
				diskWrite(companyRoot, resolve(args[1]), diskRead(companyRoot, src, allowedRoots), allowedRoots);
				if (cmd === "mv") diskDelete(companyRoot, src, allowedRoots);
				return {
					stdout: "",
					stderr: "",
					code: 0
				};
			}
			case "head": {
				const file = args.find((a) => !a.startsWith("-"));
				if (!file) return {
					stdout: "",
					stderr: "head: missing file",
					code: 1
				};
				const nFlag = args.find((a) => a.startsWith("-n"));
				const n = nFlag ? Number(nFlag.replace("-n", "") || args[args.indexOf(nFlag) + 1]) : 10;
				return {
					stdout: diskRead(companyRoot, resolve(file), allowedRoots).split("\n").slice(0, Number.isFinite(n) ? n : 10).join("\n"),
					stderr: "",
					code: 0
				};
			}
			default: return {
				stdout: "",
				stderr: `${cmd}: command not available in the workspace shell. Use read_file / write_file / list_dir.`,
				code: 1
			};
		}
	} catch (err) {
		return {
			stdout: "",
			stderr: err instanceof Error ? err.message : String(err),
			code: 1
		};
	}
}
//#endregion
export { defaultCompanyRoot, defaultModelsDir, diskDelete, diskExists, diskList, diskMkdir, diskMove, diskPrettyTree, diskRead, diskReplace, diskShell, diskStat, diskWrite, llamaBinDir, llamaServerName, loadConfig, patchConfig, saveConfig, llamaAssetFor as t };
