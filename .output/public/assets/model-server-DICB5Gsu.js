import { t as createServerFn } from "../index.js";
import { t as createServerRpc } from "./createServerRpc-A6pJPYTF.js";
//#region src/lib/runtime/model-server.ts?tss-serverfn-split
var fsScanServerHardware_createServerFn_handler = createServerRpc({
	id: "a10030064aa8cb2d1a66e8c1ba637b73d5b3dc705a6289627c80f7758fc1f92f",
	name: "fsScanServerHardware",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => fsScanServerHardware.__executeServer(opts));
var fsScanServerHardware = createServerFn({ method: "POST" }).handler(fsScanServerHardware_createServerFn_handler, async () => {
	const { scanServerHardware } = await import("./hardware-server-D1nKt7jM.js");
	return scanServerHardware();
});
var modelDownloadStart_createServerFn_handler = createServerRpc({
	id: "c6f65c16d8da84d6a4ad2ff8034e14b91f3ebd421fc676c72895f8752bbccfde",
	name: "modelDownloadStart",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelDownloadStart.__executeServer(opts));
var modelDownloadStart = createServerFn({ method: "POST" }).validator((input) => input).handler(modelDownloadStart_createServerFn_handler, async ({ data }) => {
	const { startDownload } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return startDownload(data.catalogId);
});
var modelDownloadStatus_createServerFn_handler = createServerRpc({
	id: "0cfb78988111782633ceeb01ab5f9e0736aa02b2cd724cbbd61bb54dc9b98909",
	name: "modelDownloadStatus",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelDownloadStatus.__executeServer(opts));
var modelDownloadStatus = createServerFn({ method: "POST" }).handler(modelDownloadStatus_createServerFn_handler, async () => {
	const { getDownloadStatus } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return getDownloadStatus();
});
var modelDownloadPause_createServerFn_handler = createServerRpc({
	id: "40e6e177fdc1ea80b599d36b38c9289f1b9ed31408636fad28e2df4f98f06f9f",
	name: "modelDownloadPause",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelDownloadPause.__executeServer(opts));
var modelDownloadPause = createServerFn({ method: "POST" }).handler(modelDownloadPause_createServerFn_handler, async () => {
	const { pauseDownload } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return pauseDownload();
});
var modelDownloadResume_createServerFn_handler = createServerRpc({
	id: "21aeebc0ab0a4911fb4efe3f4690e0b2b215b90c1f7bd5174b9de93b5ae81277",
	name: "modelDownloadResume",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelDownloadResume.__executeServer(opts));
var modelDownloadResume = createServerFn({ method: "POST" }).handler(modelDownloadResume_createServerFn_handler, async () => {
	const { resumeDownload } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return resumeDownload();
});
var modelVerify_createServerFn_handler = createServerRpc({
	id: "aa0cf80feb628d830e818e3bfd93b3aa2bbecce6a5055b7096c5fd2e72464032",
	name: "modelVerify",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelVerify.__executeServer(opts));
var modelVerify = createServerFn({ method: "POST" }).validator((input) => input).handler(modelVerify_createServerFn_handler, async ({ data }) => {
	const { verifyModel } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return verifyModel(data.catalogId);
});
var modelList_createServerFn_handler = createServerRpc({
	id: "420cd8996fd4a20743089920e3ef7620d1193a44f16c1b84c8dc056db1d497d0",
	name: "modelList",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelList.__executeServer(opts));
var modelList = createServerFn({ method: "POST" }).handler(modelList_createServerFn_handler, async () => {
	const { listModelsOnDisk } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	const { loadConfig, defaultModelsDir } = await import("./disk-DHDludua.js");
	return {
		models: listModelsOnDisk(),
		modelsDir: loadConfig().modelsDir || defaultModelsDir()
	};
});
var modelImport_createServerFn_handler = createServerRpc({
	id: "0c465437edd45d3f2bd2924494b9097eb2b16378c8acc1e1c0af4ce50fe26b81",
	name: "modelImport",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelImport.__executeServer(opts));
var modelImport = createServerFn({ method: "POST" }).validator((input) => input).handler(modelImport_createServerFn_handler, async ({ data }) => {
	const { importGguf } = await import("./models-CJyvMDtF.js").then((n) => n.n);
	return importGguf(data.absolutePath, data.catalogId);
});
var modelSetHostedDemo_createServerFn_handler = createServerRpc({
	id: "216280aab065baa2c1570dec8fec91a193841d36f6d16c0753d315d8170f14ff",
	name: "modelSetHostedDemo",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelSetHostedDemo.__executeServer(opts));
var modelSetHostedDemo = createServerFn({ method: "POST" }).validator((input) => input).handler(modelSetHostedDemo_createServerFn_handler, async ({ data }) => {
	const { patchConfig } = await import("./disk-DHDludua.js");
	return patchConfig({ allowHostedDemo: data.allow });
});
var modelSetOllama_createServerFn_handler = createServerRpc({
	id: "8a65b429183ddd80c22c497da1b0bb7df13f24c14d8fdf07f0f217f9270350ef",
	name: "modelSetOllama",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelSetOllama.__executeServer(opts));
var modelSetOllama = createServerFn({ method: "POST" }).validator((input) => input).handler(modelSetOllama_createServerFn_handler, async ({ data }) => {
	const { patchConfig } = await import("./disk-DHDludua.js");
	return patchConfig({ useExistingOllama: data.use });
});
var modelEngineStatus_createServerFn_handler = createServerRpc({
	id: "1c9e314be70d5595ab05707502096bb9cfe6d4a037e7825b225ae227799fb911",
	name: "modelEngineStatus",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelEngineStatus.__executeServer(opts));
var modelEngineStatus = createServerFn({ method: "POST" }).handler(modelEngineStatus_createServerFn_handler, async () => {
	const { engineStatus } = await import("./local-engine-DhYP15os.js");
	return engineStatus();
});
var modelEnsureEngine_createServerFn_handler = createServerRpc({
	id: "1f289b3c13d0e081998b37de1b19fc322edfa4a1fb6a5ca1febc01cc8248b102",
	name: "modelEnsureEngine",
	filename: "src/lib/runtime/model-server.ts"
}, (opts) => modelEnsureEngine.__executeServer(opts));
var modelEnsureEngine = createServerFn({ method: "POST" }).handler(modelEnsureEngine_createServerFn_handler, async () => {
	const { ensureLlamaBinary, ensureLocalServer } = await import("./local-engine-DhYP15os.js");
	const bin = await ensureLlamaBinary();
	if (!bin.ok) return bin;
	return ensureLocalServer();
});
//#endregion
export { fsScanServerHardware_createServerFn_handler, modelDownloadPause_createServerFn_handler, modelDownloadResume_createServerFn_handler, modelDownloadStart_createServerFn_handler, modelDownloadStatus_createServerFn_handler, modelEngineStatus_createServerFn_handler, modelEnsureEngine_createServerFn_handler, modelImport_createServerFn_handler, modelList_createServerFn_handler, modelSetHostedDemo_createServerFn_handler, modelSetOllama_createServerFn_handler, modelVerify_createServerFn_handler };
