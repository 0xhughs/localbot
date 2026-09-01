/**
 * LocalBot inference and harness bind loopback only.
 * The preview web server is a separate process and is not this bind.
 */
export const LOOPBACK_HOST = "127.0.0.1" as const;
export const LOOPBACK_PORT = 18789 as const;
export const OPENAI_BASE_PATH = "/v1" as const;

export const LOCAL_OPENAI_BASE_URL = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}${OPENAI_BASE_PATH}`;

export type BindCheck = {
  host: string;
  port: number;
  loopbackOnly: boolean;
  lanBind: boolean;
  url: string;
};

export function describeBind(
  host: string = LOOPBACK_HOST,
  port: number = LOOPBACK_PORT,
): BindCheck {
  const loopbackOnly = host === "127.0.0.1" || host === "localhost" || host === "::1";
  const lanBind = host === "0.0.0.0" || host === "::" || host === "*";
  return {
    host,
    port,
    loopbackOnly,
    lanBind,
    url: `http://${host}:${port}${OPENAI_BASE_PATH}`,
  };
}

export function assertLoopbackOnly(host: string = LOOPBACK_HOST): void {
  const check = describeBind(host);
  if (!check.loopbackOnly || check.lanBind) {
    throw new Error(`Refusing non-loopback bind: ${host}`);
  }
}

export const DEFAULT_RUNTIME_KEYS: Record<string, never> = {};

export function hasProviderKeys(env: Record<string, string | undefined> = {}): boolean {
  const names = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "GROQ_API_KEY",
    "TOGETHER_API_KEY",
  ];
  return names.some((n) => Boolean(env[n]));
}
