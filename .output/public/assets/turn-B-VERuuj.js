import { t as createServerFn } from "../index.js";
import { t as createServerRpc } from "./createServerRpc-A6pJPYTF.js";
//#region src/lib/runtime/turn.ts?tss-serverfn-split
var getAiStatus_createServerFn_handler = createServerRpc({
	id: "4d014b7d5695cf271ecb6d606e4830cf820e40735c07c63b45eca84471656734",
	name: "getAiStatus",
	filename: "src/lib/runtime/turn.ts"
}, (opts) => getAiStatus.__executeServer(opts));
var getAiStatus = createServerFn({ method: "POST" }).handler(getAiStatus_createServerFn_handler, async () => {
	const { loadConfig } = await import("./disk-DHDludua.js");
	const { engineStatus } = await import("./local-engine-DhYP15os.js");
	const cfg = loadConfig();
	const local = engineStatus();
	if (!cfg.allowHostedDemo) return {
		available: local.ready,
		model: local.model || "local",
		engine: local.engine,
		ggufPath: local.ggufPath,
		loopback: local.loopback,
		ramEstimate: local.ramEstimate,
		badge: local.badge,
		allowHostedDemo: false
	};
	const hostedOn = Boolean(process.env.XAI_API_KEY);
	return {
		available: hostedOn,
		model: "grok-4.5",
		engine: "hosted-grok-4.5",
		ggufPath: local.ggufPath,
		loopback: local.loopback,
		ramEstimate: local.ramEstimate,
		badge: hostedOn ? "Hosted grok-4.5 (demo)" : "Hosted demo — no key",
		allowHostedDemo: true
	};
});
var runHarnessTurn_createServerFn_handler = createServerRpc({
	id: "6532b4f18cc5bcc2361d69f45f2f84e2d4d87ad9ed8a519945f97f3260b8e7bc",
	name: "runHarnessTurn",
	filename: "src/lib/runtime/turn.ts"
}, (opts) => runHarnessTurn.__executeServer(opts));
var runHarnessTurn = createServerFn({ method: "POST" }).validator((input) => input).handler(runHarnessTurn_createServerFn_handler, async ({ data }) => {
	const { executeTurn } = await import("./execute-turn-BEA7JgIG.js");
	return executeTurn(data);
});
//#endregion
export { getAiStatus_createServerFn_handler, runHarnessTurn_createServerFn_handler };
