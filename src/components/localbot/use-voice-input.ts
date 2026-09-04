/**
 * Stage 9 — hold-to-talk state for the chat composer.
 *
 * press → `startMicCapture` → release → WAV → `sttTranscribe` (sidecar,
 * whisper-cli on this computer) → `onText(transcript)`. The caller appends
 * the text to the composer; the employee still presses Enter. This hook never
 * sends a message and never touches the Harness.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToBase64 } from "@/lib/audio/wav";
import { micSupported, micUnavailableReason, startMicCapture, type MicRecorder } from "@/lib/audio/mic-capture";
import { sttStatus, sttTranscribe } from "@/lib/runtime/stt-server";
import { MIN_CLIP_SECONDS } from "@/lib/audio/voice-text";

export type VoiceState = "idle" | "listening" | "transcribing";
export type SttStatusInfo = Awaited<ReturnType<typeof sttStatus>>;

export type VoiceInput = {
  state: VoiceState;
  /** Why the Mic is disabled, or null when it can be used. */
  disabledReason: string | null;
  /** Last error or notice (cleared on the next press). */
  note: string | null;
  status: SttStatusInfo | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

export function useVoiceInput(opts: { enabled: boolean; onText: (text: string) => void }): VoiceInput {
  const [state, setState] = useState<VoiceState>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<SttStatusInfo | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [micReason, setMicReason] = useState<string | null>("Checking microphone…");
  const recorder = useRef<MicRecorder | null>(null);
  const starting = useRef<Promise<void> | null>(null);
  const releasedWhileStarting = useRef(false);
  const onTextRef = useRef(opts.onText);
  onTextRef.current = opts.onText;

  useEffect(() => {
    setSupported(micSupported());
    setMicReason(micUnavailableReason());
    let stale = false;
    sttStatus()
      .then((s) => {
        if (!stale) setStatus(s);
      })
      .catch(() => {
        if (!stale) setStatus(null);
      });
    return () => {
      stale = true;
    };
  }, []);

  const disabledReason = !opts.enabled
    ? "Wait for the current turn to finish."
    : !supported
      ? micReason ?? "Microphone not available."
      : status && !status.supported
        ? status.reason ?? "Voice input is NOT BUILT on this host."
        : state === "transcribing"
          ? "Transcribing the last clip…"
          : null;

  const cancel = useCallback(() => {
    releasedWhileStarting.current = true;
    recorder.current?.cancel();
    recorder.current = null;
    setState("idle");
  }, []);

  const start = useCallback(() => {
    if (disabledReason || recorder.current || starting.current) return;
    setNote(null);
    releasedWhileStarting.current = false;
    setState("listening");
    starting.current = startMicCapture()
      .then((rec) => {
        if (releasedWhileStarting.current) {
          // Finger already lifted before the mic came up: nothing to transcribe.
          rec.cancel();
          setState("idle");
          return;
        }
        recorder.current = rec;
      })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : "";
        setNote(
          name === "NotAllowedError"
            ? "Microphone permission was denied."
            : name === "NotFoundError"
              ? "No microphone found."
              : `Microphone error: ${err instanceof Error ? err.message : String(err)}`,
        );
        setState("idle");
      })
      .finally(() => {
        starting.current = null;
      });
  }, [disabledReason]);

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (!rec) {
      // Released before getUserMedia resolved: the start() continuation sees
      // the flag and discards the recorder. A second release (pointer capture
      // lost after pointerup) while transcribing changes nothing.
      if (starting.current) releasedWhileStarting.current = true;
      return;
    }
    recorder.current = null;
    setState("transcribing");
    void (async () => {
      try {
        const clip = await rec.stop();
        if (clip.seconds < MIN_CLIP_SECONDS) {
          setNote("Hold the Mic while you speak.");
          return;
        }
        const res = await sttTranscribe({ data: { wavBase64: bytesToBase64(clip.wav), language: "en" } });
        if (!res.ok) {
          setNote(res.error);
          return;
        }
        if (!res.text) {
          setNote("Nothing heard.");
          return;
        }
        onTextRef.current(res.text);
        setNote(`Heard ${clip.seconds.toFixed(1)} s · ${res.model} · ${res.ms} ms`);
      } catch (err) {
        setNote(`Voice input failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setState("idle");
      }
    })();
  }, []);

  useEffect(() => () => recorder.current?.cancel(), []);

  return { state, disabledReason, note, status, start, stop, cancel };
}
