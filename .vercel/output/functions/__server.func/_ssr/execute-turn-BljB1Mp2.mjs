import { loadConfig } from "./disk-Ch6iovlC.mjs";
import { runLocalTurn } from "./local-engine-5e_UwL5c.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/execute-turn-BljB1Mp2.js
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
			description: "Run a workspace shell command. Always requires permission.",
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
/** Only called when the explicit hosted-demo switch is ON in server config. */
async function runHostedTurn(data) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: false,
		error: "Hosted demo is on, but no API key is set."
	};
	const tools = data.allowNetwork ? TOOLS : TOOLS.filter((t) => t.function.name !== "web_search");
	const messages = data.messages.map((m) => {
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
	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: "grok-4.5",
			max_tokens: 1600,
			temperature: .5,
			tools,
			tool_choice: "auto",
			messages
		})
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		return {
			ok: false,
			error: `Hosted demo error ${res.status}${body ? `: ${body.slice(0, 240)}` : ""}`
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
/** Default path is local GGUF. Hosted grok-4.5 only if allowHostedDemo is on. */
async function executeTurn(data) {
	if (loadConfig().allowHostedDemo) return runHostedTurn(data);
	return runLocalTurn(data);
}
//#endregion
export { executeTurn };
