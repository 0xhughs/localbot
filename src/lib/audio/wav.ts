/**
 * Stage 9 — RIFF/WAVE PCM16 mono 16 kHz, hand-built and hand-parsed.
 *
 * Pure functions on Uint8Array / DataView so the same code runs in the
 * renderer (encode the microphone capture) and in the sidecar (gate what
 * `sttTranscribe` accepts). No MediaRecorder, no ffmpeg, no codecs: the
 * renderer already has Float32 PCM from the Web Audio graph, and whisper-cli
 * reads plain WAV. The parser walks RIFF chunks (a `LIST` chunk between
 * `fmt ` and `data`, as in whisper.cpp's own jfk.wav, is fine) and refuses
 * anything that is not the one shape whisper-cli is fed here.
 */

export const STT_SAMPLE_RATE = 16000;
export const STT_CHANNELS = 1;
export const STT_BITS = 16;
/** Hard ceilings for one hold-to-talk clip. 60 s of PCM16 mono 16 kHz is 1,920,000 B of samples. */
export const STT_MAX_SECONDS = 60;
export const STT_MAX_BYTES = 2 * 1024 * 1024;
export const WAV_HEADER_BYTES = 44;

export type WavInfo = {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataBytes: number;
  seconds: number;
};

export type WavCheck = { ok: true; info: WavInfo } | { ok: false; error: string };

function ascii(u8: Uint8Array, at: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(u8[at + i] ?? 0);
  return s;
}

/** Parse a RIFF/WAVE header. Any structural problem is an error string, never a throw. */
export function inspectWav(bytes: Uint8Array): WavCheck {
  if (bytes.byteLength < WAV_HEADER_BYTES) return { ok: false, error: "Not a WAV file (too short)." };
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    return { ok: false, error: "Not a WAV file (missing RIFF/WAVE header)." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  let fmt: Omit<WavInfo, "dataOffset" | "dataBytes" | "seconds"> | null = null;
  let data: { offset: number; bytes: number } | null = null;
  while (pos + 8 <= bytes.byteLength) {
    const id = ascii(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.byteLength) return { ok: false, error: "WAV fmt chunk is malformed." };
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      const avail = bytes.byteLength - body;
      // A streaming writer may leave size as 0 / 0xFFFFFFFF; trust the bytes we have.
      const n = size === 0 || size === 0xffffffff || size > avail ? avail : size;
      data = { offset: body, bytes: n };
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt) return { ok: false, error: "WAV has no fmt chunk." };
  if (!data) return { ok: false, error: "WAV has no data chunk." };
  const bytesPerSecond = (fmt.sampleRate * fmt.channels * fmt.bitsPerSample) / 8;
  return {
    ok: true,
    info: {
      ...fmt,
      dataOffset: data.offset,
      dataBytes: data.bytes,
      seconds: bytesPerSecond > 0 ? data.bytes / bytesPerSecond : 0,
    },
  };
}

/**
 * The gate `sttTranscribe` applies before anything touches disk: RIFF/WAVE,
 * PCM (format 1), mono, 16 kHz, 16-bit, non-empty, under the size and
 * duration ceilings. Everything else is refused with the reason.
 */
export function validateSttWav(bytes: Uint8Array): WavCheck {
  if (bytes.byteLength > STT_MAX_BYTES) {
    return { ok: false, error: `Clip is ${bytes.byteLength.toLocaleString()} bytes; the limit is ${STT_MAX_BYTES.toLocaleString()}.` };
  }
  const parsed = inspectWav(bytes);
  if (!parsed.ok) return parsed;
  const i = parsed.info;
  if (i.format !== 1) return { ok: false, error: `WAV is not PCM (format ${i.format}).` };
  if (i.channels !== STT_CHANNELS) return { ok: false, error: `WAV must be mono (got ${i.channels} channels).` };
  if (i.sampleRate !== STT_SAMPLE_RATE) return { ok: false, error: `WAV must be ${STT_SAMPLE_RATE} Hz (got ${i.sampleRate}).` };
  if (i.bitsPerSample !== STT_BITS) return { ok: false, error: `WAV must be ${STT_BITS}-bit (got ${i.bitsPerSample}).` };
  if (i.dataBytes < 2) return { ok: false, error: "WAV has no samples." };
  if (i.seconds > STT_MAX_SECONDS) return { ok: false, error: `Clip is ${i.seconds.toFixed(1)} s; the limit is ${STT_MAX_SECONDS} s.` };
  return parsed;
}

/** Float32 [-1, 1] → Int16 with clipping. */
export function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Linear resampler; good enough for speech going to 16 kHz. Returns the input when rates match. */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

/** Concatenate captured Float32 blocks into one buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** 44-byte canonical header + little-endian PCM16 mono samples. */
export function encodeWavPcm16Mono(samples: Int16Array, sampleRate: number = STT_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) u8[at + i] = s.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, STT_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * STT_CHANNELS * STT_BITS) / 8, true);
  view.setUint16(32, (STT_CHANNELS * STT_BITS) / 8, true);
  view.setUint16(34, STT_BITS, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, samples[i] ?? 0, true);
  return u8;
}

/** Base64 without `Buffer` (the renderer has none); chunked so long clips do not blow the arg list. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(s);
}
