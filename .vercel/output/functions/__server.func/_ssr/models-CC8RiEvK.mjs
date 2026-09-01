import { n as __exportAll$1 } from "../_runtime.mjs";
import { defaultModelsDir, loadConfig, patchConfig } from "./disk-Ch6iovlC.mjs";
import { i as hubUrl, r as getCatalogModel, t as CATALOG } from "./catalog-BxVbn8tK.mjs";
import nodeHTTP from "node:http";
import nodeHTTPS from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
//#region node_modules/.nitro/vite/services/ssr/assets/models-CC8RiEvK.js
var models_CC8RiEvK_exports = /* @__PURE__ */ __exportAll$1({
	n: () => models_exports,
	t: () => findReadyModel
});
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var models_exports = /* @__PURE__ */ __exportAll({
	findReadyModel: () => findReadyModel,
	getDownloadStatus: () => getDownloadStatus,
	importGguf: () => importGguf,
	listModelsOnDisk: () => listModelsOnDisk,
	modelPathFor: () => modelPathFor,
	modelsDir: () => modelsDir,
	pauseDownload: () => pauseDownload,
	resumeDownload: () => resumeDownload,
	sha256File: () => sha256File,
	startDownload: () => startDownload,
	streamHubDownload: () => streamHubDownload,
	verifyModel: () => verifyModel
});
var state = {
	catalogId: null,
	status: "idle",
	bytesDone: 0,
	bytesTotal: 0,
	error: null,
	dest: null,
	abort: null
};
function modelsDir() {
	return loadConfig().modelsDir || defaultModelsDir();
}
function modelPathFor(model) {
	return path.join(modelsDir(), model.filename);
}
function getDownloadStatus() {
	const { abort: _a, ...rest } = state;
	return { ...rest };
}
function isGgufMagic(buf) {
	return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "GGUF";
}
function listModelsOnDisk() {
	const dir = modelsDir();
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir).filter((n) => n.endsWith(".gguf") && !n.endsWith(".partial")).map((name) => {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		const cat = CATALOG.find((m) => m.filename === name) ?? null;
		return {
			filename: name,
			path: p,
			size: st.size,
			catalogId: cat?.id ?? null
		};
	});
}
function verifyModel(catalogId) {
	const model = getCatalogModel(catalogId);
	if (!model) return {
		ok: false,
		error: `Unknown catalog id ${catalogId}`
	};
	const dest = modelPathFor(model);
	if (!fs.existsSync(dest)) return {
		ok: false,
		error: `No file at ${dest}`
	};
	const size = fs.statSync(dest).size;
	if (model.sizeBytes > 0 && size !== model.sizeBytes) return {
		ok: false,
		error: `Size mismatch: got ${size}, expected ${model.sizeBytes}`
	};
	const fd = fs.openSync(dest, "r");
	const head = Buffer.alloc(8);
	fs.readSync(fd, head, 0, 8, 0);
	fs.closeSync(fd);
	if (!isGgufMagic(head)) return {
		ok: false,
		error: "File is not a GGUF (missing magic)"
	};
	let sha256;
	if (model.sha256 && model.sha256.length === 64) {
		sha256 = sha256File(dest);
		if (sha256 !== model.sha256) return {
			ok: false,
			error: `sha256 mismatch: ${sha256}`,
			sha256
		};
	}
	patchConfig({
		activeModelId: model.id,
		activeModelPath: dest
	});
	return {
		ok: true,
		path: dest,
		sha256
	};
}
function sha256File(filePath) {
	const hash = crypto.createHash("sha256");
	const fd = fs.openSync(filePath, "r");
	const buf = Buffer.alloc(8388608);
	try {
		let n = 0;
		while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
	} finally {
		fs.closeSync(fd);
	}
	return hash.digest("hex");
}
function importGguf(absolutePath, catalogId) {
	const src = path.resolve(absolutePath.trim());
	if (!src.endsWith(".gguf")) return {
		ok: false,
		error: "Path must be a .gguf file"
	};
	if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return {
		ok: false,
		error: `No file at ${src}`
	};
	const head = Buffer.alloc(8);
	const fd = fs.openSync(src, "r");
	fs.readSync(fd, head, 0, 8, 0);
	fs.closeSync(fd);
	if (!isGgufMagic(head)) return {
		ok: false,
		error: "File is not a GGUF (missing magic)"
	};
	const dir = modelsDir();
	fs.mkdirSync(dir, { recursive: true });
	const dest = path.join(dir, path.basename(src));
	if (path.resolve(src) !== path.resolve(dest)) fs.copyFileSync(src, dest);
	const model = catalogId ? getCatalogModel(catalogId) : CATALOG.find((m) => m.filename === path.basename(src));
	patchConfig({
		activeModelId: model?.id ?? catalogId ?? path.basename(src),
		activeModelPath: dest
	});
	return {
		ok: true,
		path: dest
	};
}
function streamHubDownload(url, destPartial, startAt, onProgress, signal) {
	return new Promise((resolve, reject) => {
		const req = (url.startsWith("https:") ? nodeHTTPS : nodeHTTP).get(url, { headers: {
			"User-Agent": "LocalBot/1.0",
			...startAt > 0 ? { Range: `bytes=${startAt}-` } : {}
		} }, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				res.resume();
				streamHubDownload(res.headers.location, destPartial, startAt, onProgress, signal).then(resolve).catch(reject);
				return;
			}
			if (!res.statusCode || res.statusCode >= 400) {
				reject(/* @__PURE__ */ new Error(`Hub HTTP ${res.statusCode ?? 0}`));
				res.resume();
				return;
			}
			const totalHeader = Number(res.headers["content-length"] ?? 0);
			const total = res.statusCode === 206 ? startAt + totalHeader : totalHeader || startAt + totalHeader;
			const flags = startAt > 0 && res.statusCode === 206 ? "a" : "w";
			const out = fs.createWriteStream(destPartial, { flags });
			let done = flags === "a" ? startAt : 0;
			res.on("data", (chunk) => {
				done += chunk.length;
				onProgress(done, total || done);
			});
			res.pipe(out);
			out.on("finish", () => resolve());
			out.on("error", reject);
			res.on("error", reject);
			signal.addEventListener("abort", () => {
				req.destroy();
				res.destroy();
				out.close();
				reject(Object.assign(/* @__PURE__ */ new Error("paused"), { paused: true }));
			});
		});
		req.on("error", reject);
		signal.addEventListener("abort", () => req.destroy());
	});
}
async function startDownload(catalogId) {
	const model = getCatalogModel(catalogId);
	if (!model) {
		state.status = "error";
		state.error = `Unknown catalog id ${catalogId}`;
		return getDownloadStatus();
	}
	if (!model.downloadable) {
		state.status = "error";
		state.error = `${model.name} is listed but not downloadable in this build.`;
		return getDownloadStatus();
	}
	if (state.status === "running") return getDownloadStatus();
	const dir = modelsDir();
	fs.mkdirSync(dir, { recursive: true });
	const dest = modelPathFor(model);
	const partial = dest + ".partial";
	if (fs.existsSync(dest) && fs.statSync(dest).size === model.sizeBytes) {
		state.catalogId = catalogId;
		state.status = "done";
		state.bytesDone = model.sizeBytes;
		state.bytesTotal = model.sizeBytes;
		state.dest = dest;
		state.error = null;
		patchConfig({
			activeModelId: model.id,
			activeModelPath: dest
		});
		return getDownloadStatus();
	}
	const startAt = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
	const ac = new AbortController();
	state.abort = ac;
	state.catalogId = catalogId;
	state.status = "running";
	state.bytesDone = startAt;
	state.bytesTotal = model.sizeBytes;
	state.dest = dest;
	state.error = null;
	streamHubDownload(hubUrl(model), partial, startAt, (done, total) => {
		state.bytesDone = done;
		state.bytesTotal = total || model.sizeBytes;
	}, ac.signal).then(() => {
		if (!fs.existsSync(partial)) throw new Error("Download produced no file");
		fs.renameSync(partial, dest);
		const verified = verifyModel(catalogId);
		if (!verified.ok) {
			state.status = "error";
			state.error = verified.error ?? "verify failed";
			return;
		}
		state.status = "done";
		state.bytesDone = fs.statSync(dest).size;
		state.dest = dest;
	}).catch((err) => {
		if (err.paused || ac.signal.aborted) {
			state.status = "paused";
			state.error = null;
			return;
		}
		state.status = "error";
		state.error = err.message || "Download failed";
	});
	return getDownloadStatus();
}
function pauseDownload() {
	state.abort?.abort();
	if (state.status === "running") state.status = "paused";
	return getDownloadStatus();
}
async function resumeDownload() {
	if (!state.catalogId) return getDownloadStatus();
	return startDownload(state.catalogId);
}
function findReadyModel() {
	const cfg = loadConfig();
	if (cfg.activeModelPath && fs.existsSync(cfg.activeModelPath)) {
		const model = cfg.activeModelId ? getCatalogModel(cfg.activeModelId) : void 0;
		return {
			catalogId: cfg.activeModelId ?? path.basename(cfg.activeModelPath),
			path: cfg.activeModelPath,
			name: model?.name ?? path.basename(cfg.activeModelPath)
		};
	}
	for (const m of CATALOG) {
		const p = modelPathFor(m);
		if (fs.existsSync(p) && (m.sizeBytes === 0 || fs.statSync(p).size === m.sizeBytes)) {
			patchConfig({
				activeModelId: m.id,
				activeModelPath: p
			});
			return {
				catalogId: m.id,
				path: p,
				name: m.name
			};
		}
	}
	const disk = listModelsOnDisk()[0];
	if (disk) {
		patchConfig({
			activeModelId: disk.catalogId,
			activeModelPath: disk.path
		});
		return {
			catalogId: disk.catalogId ?? disk.filename,
			path: disk.path,
			name: disk.filename
		};
	}
	return null;
}
//#endregion
export { models_CC8RiEvK_exports as n, findReadyModel as t };
