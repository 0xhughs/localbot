async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("SHA-256 is not available in this environment");
  }

  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ggufBlob(params: {
  id: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
}): string {
  const header = "GGUF";
  const meta = JSON.stringify({
    localbot: 1,
    id: params.id,
    filename: params.filename,
    sizeBytes: params.sizeBytes,
    catalogSha256: params.sha256,
  });
  return `${header}\n${meta}\n`;
}

export async function checksumBlob(blob: string): Promise<string> {
  return sha256Hex(blob);
}

export async function verifyChecksum(
  blob: string,
  expected: string,
): Promise<{ ok: boolean; actual: string; expected: string }> {
  const actual = await checksumBlob(blob);
  return { ok: actual === expected, actual, expected };
}
