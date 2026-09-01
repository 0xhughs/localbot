import { t as createServerFn } from "./ssr.mjs";
import { t as createServerRpc } from "./createServerRpc-A6pJPYTF.mjs";
import fs from "node:fs";
import path from "node:path";
//#region node_modules/.nitro/vite/services/ssr/assets/server-3EPd05Vz.js
function dataDir() {
	return path.resolve(process.cwd(), "data");
}
function configPath() {
	return path.join(dataDir(), "localbot-config.json");
}
function slugName(name) {
	return name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ") || "Untitled";
}
function defaultCompanyRoot(companyName = "Studio") {
	return path.join(dataDir(), "LocalBot", slugName(companyName) || "Studio");
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
function loadConfig() {
	try {
		const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
		if (raw.companyRoot && typeof raw.companyRoot === "string") {
			const companyRoot = path.resolve(raw.companyRoot);
			return {
				companyRoot,
				previewWritesToProjectData: isUnderProjectData(companyRoot)
			};
		}
	} catch {}
	return {
		companyRoot: defaultCompanyRoot(),
		previewWritesToProjectData: true
	};
}
function saveConfig(companyRoot) {
	const abs = path.resolve(companyRoot.trim() || defaultCompanyRoot());
	fs.mkdirSync(dataDir(), { recursive: true });
	fs.mkdirSync(abs, { recursive: true });
	const cfg = {
		companyRoot: abs,
		previewWritesToProjectData: isUnderProjectData(abs)
	};
	fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
	return cfg;
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
function json(value) {
	return JSON.stringify(value, null, 2) + "\n";
}
function seedCompanyTreeOnDisk(args) {
	const { companyRoot, company, department, employee, bots } = args;
	diskMkdir(companyRoot, company.root);
	diskWrite(companyRoot, path.join(company.root, "company.json"), json({
		name: company.name,
		catalogPin: company.catalogPin,
		defaultDepartment: department.name
	}));
	diskMkdir(companyRoot, path.join(company.root, "shared"));
	diskMkdir(companyRoot, path.join(company.root, "departments"));
	seedDepartmentOnDisk(companyRoot, department);
	seedEmployeeOnDisk(companyRoot, department, employee);
	for (const bot of bots) seedBotFolderOnDisk(companyRoot, bot, department, employee);
}
function seedDepartmentOnDisk(companyRoot, department) {
	diskMkdir(companyRoot, department.path);
	diskWrite(companyRoot, path.join(department.path, "department.json"), json({ name: department.name }));
	diskMkdir(companyRoot, path.join(department.path, "shared"));
	diskMkdir(companyRoot, path.join(department.path, "people"));
}
function seedEmployeeOnDisk(companyRoot, department, employee) {
	diskMkdir(companyRoot, employee.path);
	diskWrite(companyRoot, path.join(employee.path, "employee.json"), json({
		displayName: employee.displayName,
		department: department.name,
		defaultModel: employee.defaultModelId
	}));
	diskMkdir(companyRoot, path.join(employee.path, "inbox"));
	diskMkdir(companyRoot, path.join(employee.path, "outbox"));
	diskMkdir(companyRoot, path.join(employee.path, "bots"));
	diskWrite(companyRoot, path.join(employee.path, "outbox", ".keep"), `Finished deliverables for ${employee.displayName} land here.\n`);
	diskWrite(companyRoot, path.join(department.path, "shared", ".keep"), `Department shared folder for ${department.name}.\nAny granted bot may read and write here.\n`);
}
function seedBotFolderOnDisk(companyRoot, bot, department, employee) {
	diskMkdir(companyRoot, bot.path);
	diskMkdir(companyRoot, path.join(bot.path, "memory"));
	diskMkdir(companyRoot, path.join(bot.path, "workspace"));
	diskMkdir(companyRoot, path.join(bot.path, "output"));
	diskWrite(companyRoot, path.join(bot.path, "bot.json"), json({
		name: bot.name,
		job: bot.job,
		modelId: bot.modelId,
		color: bot.color,
		grants: bot.grants,
		createdAt: bot.createdAt
	}));
	diskWrite(companyRoot, path.join(bot.path, "AGENTS.md"), `# ${bot.name}\n\n${bot.job}\n\n${bot.standingInstructions}\n`);
	diskWrite(companyRoot, path.join(bot.path, "memory", "notes.md"), `# Memory\n\nStanding context for ${bot.name}.\n`);
}
function rootOf(companyRoot) {
	return companyRoot?.trim() ? companyRoot : loadConfig().companyRoot;
}
var fsGetCompanyRoot_createServerFn_handler = createServerRpc({
	id: "11857cc008c32a0141f9ebfffa9ce5384d5fea775130cefdbef972ae6603405f",
	name: "fsGetCompanyRoot",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsGetCompanyRoot.__executeServer(opts));
var fsGetCompanyRoot = createServerFn({ method: "POST" }).handler(fsGetCompanyRoot_createServerFn_handler, async () => {
	return {
		...loadConfig(),
		defaultRoot: defaultCompanyRoot()
	};
});
var fsSetCompanyRoot_createServerFn_handler = createServerRpc({
	id: "a56685740e9d84f84e4b0c69ed6ac965de2d8bb265b32495470135422431bb18",
	name: "fsSetCompanyRoot",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsSetCompanyRoot.__executeServer(opts));
var fsSetCompanyRoot = createServerFn({ method: "POST" }).validator((input) => input).handler(fsSetCompanyRoot_createServerFn_handler, async ({ data }) => {
	return saveConfig(data.absolutePath);
});
var fsList_createServerFn_handler = createServerRpc({
	id: "2e81004d9c157d79dcd862c83ab950685065a5fcff9a8e8194734eebb3e985ae",
	name: "fsList",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsList.__executeServer(opts));
var fsList = createServerFn({ method: "POST" }).validator((input) => input).handler(fsList_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			entries: diskList(rootOf(data.companyRoot), data.path, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsRead_createServerFn_handler = createServerRpc({
	id: "7d1e3233596efa615b20640ed4065b14038fb7ac8de34a64e963a93c0ab2dbfd",
	name: "fsRead",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsRead.__executeServer(opts));
var fsRead = createServerFn({ method: "POST" }).validator((input) => input).handler(fsRead_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			content: diskRead(rootOf(data.companyRoot), data.path, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsWrite_createServerFn_handler = createServerRpc({
	id: "b977a74c3349a02ed3377147a0dc0c34994631b8b57c284a89cff7aa90b49228",
	name: "fsWrite",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsWrite.__executeServer(opts));
var fsWrite = createServerFn({ method: "POST" }).validator((input) => input).handler(fsWrite_createServerFn_handler, async ({ data }) => {
	try {
		diskWrite(rootOf(data.companyRoot), data.path, data.content, data.allowedRoots);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsMkdir_createServerFn_handler = createServerRpc({
	id: "0fa999f4c5f50f97f50e396c72d22bac509e66fe9a51a0668a0866c0788bcc3e",
	name: "fsMkdir",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsMkdir.__executeServer(opts));
var fsMkdir = createServerFn({ method: "POST" }).validator((input) => input).handler(fsMkdir_createServerFn_handler, async ({ data }) => {
	try {
		diskMkdir(rootOf(data.companyRoot), data.path, data.allowedRoots);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsDelete_createServerFn_handler = createServerRpc({
	id: "1e164447cf5fb3b60e111085cb9d388b506dd4773dd0fc655d62f0794e230e88",
	name: "fsDelete",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsDelete.__executeServer(opts));
var fsDelete = createServerFn({ method: "POST" }).validator((input) => input).handler(fsDelete_createServerFn_handler, async ({ data }) => {
	try {
		diskDelete(rootOf(data.companyRoot), data.path, data.allowedRoots);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsExists_createServerFn_handler = createServerRpc({
	id: "7bd77591bf0ceac531fbc9d547755d3ba0595a450a9ee9aef216d83e71d41d71",
	name: "fsExists",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsExists.__executeServer(opts));
var fsExists = createServerFn({ method: "POST" }).validator((input) => input).handler(fsExists_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			exists: diskExists(rootOf(data.companyRoot), data.path, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsStat_createServerFn_handler = createServerRpc({
	id: "7f0c95b4d4230c67a1ee8278822c7daa6e0b5727086c1751d102f0d387bf7f3d",
	name: "fsStat",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsStat.__executeServer(opts));
var fsStat = createServerFn({ method: "POST" }).validator((input) => input).handler(fsStat_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			entry: diskStat(rootOf(data.companyRoot), data.path, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsReplace_createServerFn_handler = createServerRpc({
	id: "c6f58459f422d316538337864eb436e437c4ea69158d8d21fdb0a7142606da48",
	name: "fsReplace",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsReplace.__executeServer(opts));
var fsReplace = createServerFn({ method: "POST" }).validator((input) => input).handler(fsReplace_createServerFn_handler, async ({ data }) => {
	try {
		diskReplace(rootOf(data.companyRoot), data.path, data.oldString, data.newString, data.allowedRoots);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsMove_createServerFn_handler = createServerRpc({
	id: "4347559c4b74a5838aebefc5f983e45487402e7d6ffd715cfb0cf04562b19b9d",
	name: "fsMove",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsMove.__executeServer(opts));
var fsMove = createServerFn({ method: "POST" }).validator((input) => input).handler(fsMove_createServerFn_handler, async ({ data }) => {
	try {
		diskMove(rootOf(data.companyRoot), data.from, data.to, data.allowedRoots);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsTree_createServerFn_handler = createServerRpc({
	id: "5875d83adb820146b198e6ccc54ed8cb37e894f263a7b32db594774f6fe6323f",
	name: "fsTree",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsTree.__executeServer(opts));
var fsTree = createServerFn({ method: "POST" }).validator((input) => input).handler(fsTree_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			listing: diskPrettyTree(rootOf(data.companyRoot), data.path, data.max ?? 80, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsRunCommand_createServerFn_handler = createServerRpc({
	id: "a99cc9c9f05221311156adc2a5933b187cd1ae643e18705a1937324f8ba0247c",
	name: "fsRunCommand",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsRunCommand.__executeServer(opts));
var fsRunCommand = createServerFn({ method: "POST" }).validator((input) => input).handler(fsRunCommand_createServerFn_handler, async ({ data }) => {
	try {
		return {
			ok: true,
			...diskShell(rootOf(data.companyRoot), data.cwd, data.command, data.allowedRoots)
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsSeedCompanyTree_createServerFn_handler = createServerRpc({
	id: "3f9c85ded0c85b11ad85670089fd879179da2f48f457656eba9fdafb31750187",
	name: "fsSeedCompanyTree",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsSeedCompanyTree.__executeServer(opts));
var fsSeedCompanyTree = createServerFn({ method: "POST" }).validator((input) => input).handler(fsSeedCompanyTree_createServerFn_handler, async ({ data }) => {
	try {
		saveConfig(data.companyRoot);
		seedCompanyTreeOnDisk({
			companyRoot: data.companyRoot,
			company: {
				...data.company,
				root: data.companyRoot
			},
			department: data.department,
			employee: data.employee,
			bots: data.bots
		});
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsSeedBot_createServerFn_handler = createServerRpc({
	id: "7b60d75daa39e4a11a3ec50382dc778da66240eae85482fc038975b8e18c8822",
	name: "fsSeedBot",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsSeedBot.__executeServer(opts));
var fsSeedBot = createServerFn({ method: "POST" }).validator((input) => input).handler(fsSeedBot_createServerFn_handler, async ({ data }) => {
	try {
		seedBotFolderOnDisk(data.companyRoot, data.bot, data.department, data.employee);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsSeedDepartment_createServerFn_handler = createServerRpc({
	id: "7779bcdf5afea5c7528cfb1c0cc4c7f2d5a50a7d74a75f7be5fbcd6853f4b670",
	name: "fsSeedDepartment",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsSeedDepartment.__executeServer(opts));
var fsSeedDepartment = createServerFn({ method: "POST" }).validator((input) => input).handler(fsSeedDepartment_createServerFn_handler, async ({ data }) => {
	try {
		seedDepartmentOnDisk(data.companyRoot, data.department);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
var fsSeedEmployee_createServerFn_handler = createServerRpc({
	id: "dfb0a5cde55326e99915ceb245bd0283168759002f29a58000602ca49f147b8d",
	name: "fsSeedEmployee",
	filename: "src/lib/fs/server.ts"
}, (opts) => fsSeedEmployee.__executeServer(opts));
var fsSeedEmployee = createServerFn({ method: "POST" }).validator((input) => input).handler(fsSeedEmployee_createServerFn_handler, async ({ data }) => {
	try {
		seedEmployeeOnDisk(data.companyRoot, data.department, data.employee);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
});
//#endregion
export { fsDelete_createServerFn_handler, fsExists_createServerFn_handler, fsGetCompanyRoot_createServerFn_handler, fsList_createServerFn_handler, fsMkdir_createServerFn_handler, fsMove_createServerFn_handler, fsRead_createServerFn_handler, fsReplace_createServerFn_handler, fsRunCommand_createServerFn_handler, fsSeedBot_createServerFn_handler, fsSeedCompanyTree_createServerFn_handler, fsSeedDepartment_createServerFn_handler, fsSeedEmployee_createServerFn_handler, fsSetCompanyRoot_createServerFn_handler, fsStat_createServerFn_handler, fsTree_createServerFn_handler, fsWrite_createServerFn_handler };
