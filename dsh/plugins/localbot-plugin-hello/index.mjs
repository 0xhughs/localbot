/**
 * localbot-plugin-hello — a Cordis plugin that proves the plugin pipeline.
 *
 * Loaded by the row `localbot-hello` (see cordis.patch.yml) once the bundle
 * is in `{DSH_HOME}/profiles/acp/package.json` → `dsh.profile.bundles`. It
 * touches no filesystem, registers no tool and opens no socket: it writes a
 * single marker line to stderr so a proof can see the composition actually
 * booted with it. stdout belongs to ACP and is never written.
 */
export const name = "localbot-hello";

export const MARKER = "[localbot-plugin-hello] loaded";

export function apply(ctx) {
  process.stderr.write(`${MARKER} pid=${process.pid}\n`);
  ctx.on?.("dispose", () => {
    process.stderr.write("[localbot-plugin-hello] disposed\n");
  });
}
