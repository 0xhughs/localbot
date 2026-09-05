/**
 * Stage 9 — microphone capture in the renderer (Stage 13: cap callback).
 *
 * getUserMedia (audio only) → AudioContext at 16 kHz → Float32 blocks →
 * PCM16 → RIFF/WAVE bytes, all in this process. No MediaRecorder (it gives
 * Opus/WebM, which whisper-cli would need ffmpeg to read), no ffmpeg, no
 * upload. The bytes go to the sidecar on loopback and nowhere else.
 *
 * The clip is capped at STT_MAX_SECONDS. Stage 13: when the cap is reached
 * `onCap` fires once so the caller can stop and transcribe instead of
 * silently discarding everything after the 60th second.
 */
import {
  STT_MAX_SECONDS,
  STT_SAMPLE_RATE,
  concatFloat32,
  encodeWavPcm16Mono,
  floatTo16BitPCM,
  resampleLinear,
} from "./wav.ts";
import { takeForCap } from "./voice-toggle.ts";

export type MicClip = { wav: Uint8Array; seconds: number; sampleRate: number };

export type MicRecorder = {
  /** Stop capturing and return the clip (capped at STT_MAX_SECONDS). */
  stop(): Promise<MicClip>;
  /** Stop capturing and throw the audio away. */
  cancel(): void;
};

/** True when this renderer can capture audio at all (secure context + mediaDevices + Web Audio). */
export function micSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const md = navigator.mediaDevices;
  const hasCtx = typeof (window as unknown as { AudioContext?: unknown }).AudioContext === "function";
  return Boolean(md && typeof md.getUserMedia === "function" && hasCtx);
}

export function micUnavailableReason(): string | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "No browser audio in this context.";
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return window.isSecureContext === false
      ? "Microphone needs a secure context (open the app on 127.0.0.1 or localhost)."
      : "This browser exposes no microphone (mediaDevices missing).";
  }
  if (typeof (window as unknown as { AudioContext?: unknown }).AudioContext !== "function") return "Web Audio is not available here.";
  return null;
}

/**
 * Start capturing. Resolves once the graph is live; call `stop()` on release.
 * Uses a ScriptProcessorNode: deprecated but present in every Chromium
 * LocalBot runs in, and it needs no separate worklet module URL.
 */
export async function startMicCapture(opts: { maxSeconds?: number; onCap?: () => void } = {}): Promise<MicRecorder> {
  const maxSeconds = opts.maxSeconds ?? STT_MAX_SECONDS;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: STT_SAMPLE_RATE });
  } catch {
    // Some devices refuse a fixed rate; capture at the default and resample on stop.
    ctx = new AudioContext();
  }
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;

  const chunks: Float32Array[] = [];
  let captured = 0;
  const cap = Math.ceil(maxSeconds * ctx.sampleRate);
  let live = true;

  let capFired = false;

  processor.onaudioprocess = (e) => {
    if (!live) return;
    const input = e.inputBuffer.getChannelData(0);
    const r = takeForCap({ captured, incoming: input.length, cap });
    if (r.take === 0) return;
    chunks.push(new Float32Array(input.subarray(0, r.take)));
    captured = r.captured;
    if (r.reachedCap && !capFired) {
      // Stage 13: the 60 s cap stops the clip and hands it to the caller (→ stop() → transcribe).
      capFired = true;
      opts.onCap?.();
    }
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);
  if (ctx.state === "suspended") await ctx.resume();

  const teardown = () => {
    live = false;
    try {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      sink.disconnect();
    } catch {
      /* already torn down */
    }
    for (const t of stream.getTracks()) t.stop();
    void ctx.close().catch(() => undefined);
  };

  return {
    async stop() {
      teardown();
      const raw = concatFloat32(chunks);
      const at16k = resampleLinear(raw, ctx.sampleRate, STT_SAMPLE_RATE);
      const pcm = floatTo16BitPCM(at16k);
      return { wav: encodeWavPcm16Mono(pcm, STT_SAMPLE_RATE), seconds: pcm.length / STT_SAMPLE_RATE, sampleRate: STT_SAMPLE_RATE };
    },
    cancel() {
      teardown();
      chunks.length = 0;
    },
  };
}
