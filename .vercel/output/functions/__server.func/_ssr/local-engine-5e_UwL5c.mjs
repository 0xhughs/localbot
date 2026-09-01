import { llamaBinDir, loadConfig } from "./disk-Ch6iovlC.mjs";
import { o as requiredMemoryGb, r as getCatalogModel } from "./catalog-BxVbn8tK.mjs";
import { t as findReadyModel } from "./models-CC8RiEvK.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import childProcess from "node:child_process";
//#region node_modules/.nitro/vite/services/ssr/assets/local-engine-5e_UwL5c.js
/**
* LocalBot inference and harness bind loopback only.
* The preview web server is a separate process and is not this bind.
*/
var LOOPBACK_HOST = "127.0.0.1";
var LOOPBACK_PORT = 18789;
var LOCAL_OPENAI_BASE_URL = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/v1`;
function describeBind(host = LOOPBACK_HOST, port = LOOPBACK_PORT) {
	return {
		host,
		port,
		loopbackOnly: host === "127.0.0.1" || host === "localhost" || host === "::1",
		lanBind: host === "0.0.0.0" || host === "::" || host === "*",
		url: `http://${host}:${port}/v1`
	};
}
function assertLoopbackOnly(host = LOOPBACK_HOST) {
	const check = describeBind(host);
	if (!check.loopbackOnly || check.lanBind) throw new Error(`Refusing non-loopback bind: ${host}`);
}
var LLAMA_RELEASE = "b10749";
var TARBALL = {
	"linux-x64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-ubuntu-x64.tar.gz`,
	"darwin-arm64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-arm64.tar.gz`,
	"darwin-x64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-x64.tar.gz`
};
var child = null;
function platformKey() {
	const p = os.platform();
	const a = os.arch();
	if (p === "linux" && a === "x64") return "linux-x64";
	if (p === "darwin" && a === "arm64") return "darwin-arm64";
	if (p === "darwin") return "darwin-x64";
	return `${p}-${a}`;
}
function llamaServerBin() {
	return path.join(llamaBinDir(), "llama-server");
}
async function pingLocal(url = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/health`) {
	try {
		return (await fetch(url, { signal: AbortSignal.timeout(800) })).ok;
	} catch {
		return false;
	}
}
async function pingOllama() {
	try {
		return (await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(800) })).ok;
	} catch {
		return false;
	}
}
function engineStatus() {
	const ready = findReadyModel();
	if (ready) {
		const model = getCatalogModel(ready.catalogId);
		const ram = model ? `~${requiredMemoryGb(model).toFixed(1)} GB` : "—";
		return {
			ready: true,
			engine: "llama.cpp",
			model: ready.name,
			ggufPath: ready.path,
			loopback: LOCAL_OPENAI_BASE_URL,
			ramEstimate: ram,
			badge: `Local ${ready.name}`
		};
	}
	return {
		ready: false,
		engine: "none",
		model: "",
		ggufPath: null,
		loopback: null,
		ramEstimate: "—",
		badge: "Local model not ready",
		error: "No GGUF registered. Download or import a model."
	};
}
async function waitForHealth(ms = 6e4) {
	const start = Date.now();
	while (Date.now() - start < ms) {
		if (await pingLocal()) return true;
		await new Promise((r) => setTimeout(r, 400));
	}
	return false;
}
async function ensureLlamaBinary() {
	const bin = llamaServerBin();
	if (fs.existsSync(bin)) return {
		ok: true,
		bin
	};
	const key = platformKey();
	const url = TARBALL[key];
	if (!url) return {
		ok: false,
		error: `No llama.cpp binary for ${key}. Place llama-server in ${llamaBinDir()}.`
	};
	const dir = llamaBinDir();
	fs.mkdirSync(path.dirname(dir), { recursive: true });
	const tarPath = path.join(path.dirname(dir), `llama-${LLAMA_RELEASE}.tar.gz`);
	try {
		const res = await fetch(url, { redirect: "follow" });
		if (!res.ok) return {
			ok: false,
			error: `Failed to fetch llama.cpp binary (${res.status})`
		};
		const buf = Buffer.from(await res.arrayBuffer());
		fs.writeFileSync(tarPath, buf);
		const { execSync } = await import("node:child_process");
		execSync(`mkdir -p ${JSON.stringify(path.dirname(dir))} && tar --no-same-owner -xzf ${JSON.stringify(tarPath)} -C ${JSON.stringify(path.dirname(dir))}`, { stdio: "ignore" });
		if (!fs.existsSync(bin)) return {
			ok: false,
			error: `Extracted tarball but ${bin} is missing`
		};
		fs.chmodSync(bin, 493);
		return {
			ok: true,
			bin
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
async function ensureLocalServer() {
	assertLoopbackOnly(LOOPBACK_HOST);
	const ready = findReadyModel();
	if (!ready) return {
		ok: false,
		error: "Local model not ready. Download or import a GGUF first."
	};
	if (await pingLocal()) {
		ready.path;
		return {
			ok: true,
			url: LOCAL_OPENAI_BASE_URL
		};
	}
	const bin = await ensureLlamaBinary();
	if (!bin.ok) return bin;
	const model = getCatalogModel(ready.catalogId);
	const ctxCap = os.totalmem() / 1024 ** 3 < 8 ? 1024 : 4096;
	const ctx = Math.max(512, Math.min(ctxCap, (model?.contextK ?? 4) * 1024));
	const args = [
		"-m",
		ready.path,
		"--host",
		LOOPBACK_HOST,
		"--port",
		String(LOOPBACK_PORT),
		"-c",
		String(ctx),
		"-t",
		String(Math.max(1, Math.min(4, os.cpus().length))),
		"--n-gpu-layers",
		"0",
		"--jinja"
	];
	child = childProcess.spawn(bin.bin, args, {
		env: {
			...process.env,
			LD_LIBRARY_PATH: llamaBinDir()
		},
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	child.stderr?.on("data", () => void 0);
	child.on("exit", () => {
		child = null;
	});
	if (!await waitForHealth(9e4)) {
		child?.kill();
		child = null;
		return {
			ok: false,
			error: "llama-server failed to start. Local model not ready."
		};
	}
	ready.path;
	return {
		ok: true,
		url: LOCAL_OPENAI_BASE_URL
	};
}
var TOOLS = [
	{
		type: "function",
		function: {
			name: "read_file",
			description: "Read a UTF-8 file from the granted folders.",
			parameters: {
				type: "object",
				properties: { path: { type: "string" } },
				required: ["path"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "write_file",
			description: "Write a UTF-8 file, creating parent folders as needed.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string" },
					content: { type: "string" }
				},
				required: ["path", "content"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "str_replace",
			description: "Replace the first occurrence of old_string in a file.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string" },
					old_string: { type: "string" },
					new_string: { type: "string" }
				},
				required: [
					"path",
					"old_string",
					"new_string"
				]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "list_dir",
			description: "List a directory tree (granted folders only).",
			parameters: {
				type: "object",
				properties: { path: { type: "string" } },
				required: ["path"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "delete_file",
			description: "Delete a file or folder. Always requires user permission.",
			parameters: {
				type: "object",
				properties: { path: { type: "string" } },
				required: ["path"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "run_command",
			description: "Run a workspace shell command (ls, cat, mkdir, touch, rm, echo, mv, cp, head, pwd). Always requires permission.",
			parameters: {
				type: "object",
				properties: { command: { type: "string" } },
				required: ["command"]
			}
		}
	},
	{
		type: "function",
		function: {
			name: "web_search",
			description: "Search the web. Only when the user enabled network.",
			parameters: {
				type: "object",
				properties: { query: { type: "string" } },
				required: ["query"]
			}
		}
	}
];
function openaiMessages(data) {
	return data.messages.map((m) => {
		if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) return {
			role: "assistant",
			content: m.content || null,
			tool_calls: m.tool_calls.map((tc) => ({
				id: tc.id,
				type: "function",
				function: {
					name: tc.name,
					arguments: tc.arguments
				}
			}))
		};
		if (m.role === "tool") return {
			role: "tool",
			tool_call_id: m.tool_call_id,
			content: m.content
		};
		return {
			role: m.role,
			content: m.content
		};
	});
}
async function postChat(url, body) {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const t = await res.text().catch(() => "");
		return {
			ok: false,
			error: `Local engine HTTP ${res.status}${t ? `: ${t.slice(0, 240)}` : ""}`
		};
	}
	const message = (await res.json()).choices?.[0]?.message;
	const toolCalls = (message?.tool_calls ?? []).map((tc) => ({
		id: tc.id,
		name: tc.function.name,
		arguments: tc.function.arguments
	}));
	return {
		ok: true,
		content: message?.content ?? "",
		toolCalls
	};
}
async function runLocalTurn(data) {
	const cfg = loadConfig();
	const tools = data.allowNetwork ? TOOLS : TOOLS.filter((t) => t.function.name !== "web_search");
	const messages = openaiMessages(data);
	if (cfg.useExistingOllama && await pingOllama()) return postChat("http://127.0.0.1:11434/v1/chat/completions", {
		model: "llama3.2",
		max_tokens: 800,
		temperature: .4,
		tools,
		tool_choice: "auto",
		messages
	});
	const server = await ensureLocalServer();
	if (!server.ok) return {
		ok: false,
		error: server.error
	};
	return postChat(`${server.url}/chat/completions`, {
		model: "local",
		max_tokens: 800,
		temperature: .4,
		tools,
		tool_choice: "auto",
		messages
	});
}
//#endregion
export { engineStatus, ensureLlamaBinary, ensureLocalServer, runLocalTurn };
