/**
 * Stage 9 — voice input state for the chat composer; Stage 13 — click-to-toggle.
 *
 * start → `startMicCapture` → stop → WAV → `sttTranscribe` (sidecar,
 * whisper-cli on this computer) → `onText(transcript)`. The caller appends
 * the text to the composer; the employee still presses Enter. This hook never
 * sends a message and never touches the Harness.
 *
 * Stage 13 adds: `toggle()` (idle → start, listening → stop), a live
 * `elapsedSeconds` timer while listening, Escape → `cancel()` (the clip is
 * discarded, nothing is transcribed), and the 60 s cap in mic-capture calls
 * `stop()` so the employee gets a transcript instead of a silent cut-off.
 * The engine is unchanged: same WAV, same sttTranscribe, same whisper-cli.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToBase64 } from "@/lib/audio/wav";
import { micSupported, micUnavailableReason, startMicCapture, type MicRecorder } from "@/lib/audio/mic-capture";
import { sttStatus, sttTranscribe } from "@/lib/runtime/stt-server";
import { MIN_CLIP_SECONDS } from "@/lib/audio/voice-text";
import { elapsedSeconds as elapsedSince, micToggleAction, type VoiceState } from "@/lib/audio/voice-toggle";

export type { VoiceState };
export type SttStatusInfo = Awaited<ReturnType<typeof sttStatus>>;

export type VoiceInput = {
  state: VoiceState;
  /** Why the Mic is disabled, or null when it can be used. */
  disabledReason: string | null;
  /** Last error or notice (cleared on the next start). */
  note: string | null;
  status: SttStatusInfo | null;
  /** Whole seconds listened so far; 0 unless listening. */
  elapsedSeconds: number;
  start: () => void;
  /** Stop and transcribe (the second click, the end of a hold, or the 60 s cap). */
  stop: () => void;
  /** Stop and throw the clip away: Escape. Nothing is transcribed. */
  cancel: () => void;
  /** Click / Space / Enter: idle → start, listening → stop. */
  toggle: () => void;
};

export function useVoiceInput(opts: { enabled: boolean; onText: (text: string) => void }): VoiceInput {
  const [state, setState] = useState<VoiceState>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<SttStatusInfo | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [micReason, setMicReason] = useState<string | null>("Checking microphone…");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recorder = useRef<MicRecorder | null>(null);
  const starting = useRef<Promise<void> | null>(null);
  const releasedWhileStarting = useRef(false);
  const listeningSince = useRef<number | null>(null);
  const stateRef = useRef<VoiceState>("idle");
  stateRef.current = state;
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
    const had = recorder.current !== null || starting.current !== null;
    recorder.current?.cancel();
    recorder.current = null;
    listeningSince.current = null;
    setElapsedSeconds(0);
    if (had) setNote("Cancelled — nothing transcribed.");
    setState("idle");
  }, []);

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (!rec) {
      // Released before getUserMedia resolved: the start() continuation sees
      // the flag and discards the recorder. A second stop while transcribing
      // changes nothing.
      if (starting.current) releasedWhileStarting.current = true;
      return;
    }
    recorder.current = null;
    listeningSince.current = null;
    setState("transcribing");
    void (async () => {
      try {
        const clip = await rec.stop();
        if (clip.seconds < MIN_CLIP_SECONDS) {
          setNote("Nothing heard — click the Mic, speak, then click again.");
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
        setElapsedSeconds(0);
        setState("idle");
      }
    })();
  }, []);

  const start = useCallback(() => {
    if (disabledReason || recorder.current || starting.current) return;
    setNote(null);
    releasedWhileStarting.current = false;
    listeningSince.current = Date.now();
    setElapsedSeconds(0);
    setState("listening");
    // The 60 s cap in mic-capture ends the clip through the same stop() as the second click.
    starting.current = startMicCapture({ onCap: () => stop() })
      .then((rec) => {
        if (releasedWhileStarting.current) {
          // Stopped / cancelled before the mic came up: nothing to transcribe.
          rec.cancel();
          listeningSince.current = null;
          setElapsedSeconds(0);
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
        listeningSince.current = null;
        setElapsedSeconds(0);
        setState("idle");
      })
      .finally(() => {
        starting.current = null;
      });
  }, [disabledReason, stop]);

  const toggle = useCallback(() => {
    const action = micToggleAction(stateRef.current);
    if (action === "start") start();
    else if (action === "stop") stop();
  }, [start, stop]);

  // Stage 13: the live timer. Ticks while listening; 0 otherwise.
  useEffect(() => {
    if (state !== "listening") return;
    const tick = () => {
      const since = listeningSince.current;
      setElapsedSeconds(since === null ? 0 : elapsedSince(since, Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [state]);

  // Stage 13: Escape while listening cancels — the clip is discarded, nothing
  // is transcribed, nothing is sent. Bound on window so it works wherever the
  // focus is (composer, button, roster).
  useEffect(() => {
    if (state !== "listening") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, cancel]);

  useEffect(() => () => recorder.current?.cancel(), []);

  return { state, disabledReason, note, status, elapsedSeconds, start, stop, cancel, toggle };
}
