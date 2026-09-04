import { createServerFn } from "@tanstack/react-start";
import { STT_MAX_BYTES } from "../audio/wav.ts";

/**
 * Stage 9 — hold-to-talk STT over the sidecar. The renderer posts one
 * base64 WAV; the sidecar runs whisper-cli once on this computer and returns
 * the text. Nothing is stored, nothing is logged, nothing leaves loopback.
 */
export const sttStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { sttStatus } = await import("./stt.ts");
  return sttStatus();
});

export const sttTranscribe = createServerFn({ method: "POST" })
  .validator((input: { wavBase64: string; language?: "en" }) => {
    if (!input || typeof input.wavBase64 !== "string") throw new Error("wavBase64 is required");
    // 4/3 base64 overhead plus padding; refuse before decoding anything larger.
    if (input.wavBase64.length > Math.ceil((STT_MAX_BYTES * 4) / 3) + 4) throw new Error("Clip is over the 2 MB limit.");
    return input;
  })
  .handler(async ({ data }) => {
    const { transcribeWav } = await import("./stt.ts");
    const bytes = Buffer.from(data.wavBase64, "base64");
    return transcribeWav(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
