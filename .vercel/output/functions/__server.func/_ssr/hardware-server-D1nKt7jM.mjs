import fs from "node:fs";
import os from "node:os";
//#region node_modules/.nitro/vite/services/ssr/assets/hardware-server-D1nKt7jM.js
function freeDiskGbAt(dir) {
	try {
		const st = fs.statfsSync(dir);
		return Number(st.bavail) * Number(st.bsize) / 1024 ** 3;
	} catch {
		return 0;
	}
}
function gpuNameLinux() {
	try {
		if (fs.readdirSync("/dev/dri").length === 0) return null;
	} catch {}
	try {
		const model = fs.readFileSync("/proc/cpuinfo", "utf8").split("\n").find((l) => l.startsWith("model name"));
		if (model) return `CPU: ${model.split(":")[1]?.trim() ?? ""}`;
	} catch {}
	return null;
}
function scanServerHardwareFrom(sys, extra) {
	const totalRamGb = sys.totalmem() / 1024 ** 3;
	const availableRamGb = sys.freemem() / 1024 ** 3;
	const cpu0 = sys.cpus()[0]?.model ?? "";
	const appleSilicon = sys.arch() === "arm64" && sys.platform() === "darwin";
	const plat = sys.platform();
	const osName = plat === "darwin" ? "macOS" : plat === "win32" ? "Windows" : plat === "linux" ? "Linux" : plat;
	return {
		os: osName,
		arch: sys.arch(),
		platformLabel: `${osName} ${sys.arch()}`,
		totalRamGb,
		availableRamGb,
		ramSource: "os",
		gpuName: extra?.gpuName ?? (appleSilicon ? cpu0 || "Apple Silicon" : gpuNameLinux()),
		vramGb: appleSilicon ? null : null,
		appleSilicon,
		cores: sys.cpus().length,
		freeDiskGb: extra?.freeDiskGb ?? 0,
		isMobile: false,
		scannedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function scanServerHardware(root = process.cwd()) {
	return scanServerHardwareFrom(os, {
		freeDiskGb: freeDiskGbAt(root),
		gpuName: os.platform() === "darwin" ? os.cpus()[0]?.model ?? "Apple Silicon" : gpuNameLinux()
	});
}
//#endregion
export { scanServerHardware };
