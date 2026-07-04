// Barra de grabación de nota de voz estilo WhatsApp: ondas de sonido en vivo
// (Web Audio API + AnalyserNode sobre el stream del micrófono), timer, y botones
// para cancelar / pausar-reanudar / enviar. Se monta cuando arranca la grabación
// y, al terminar, llama onSend(blob, durSec) o onCancel(). Toda la complejidad de
// MediaRecorder + AudioContext vive acá (encapsulada) para no ensuciar InboxPage.
import { useEffect, useRef, useState } from "react";
import { Trash2, Pause, Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

interface AudioRecorderBarProps {
  onSend: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function AudioRecorderBar({ onSend, onCancel }: AudioRecorderBarProps) {
  const { t } = useLanguage();
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendRef = useRef(false);
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);

  // Arranca: micrófono + MediaRecorder + analyser para las ondas.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const dur = Math.max(1, elapsedRef.current);
        if (sendRef.current && blob.size > 0) onSend(blob, dur);
        else onCancel();
      };
      rec.start();
      setReady(true);

      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 128;
        src.connect(an);
        analyserRef.current = an;
        const buf = new Uint8Array(an.frequencyBinCount);
        const render = () => {
          rafRef.current = requestAnimationFrame(render);
          const canvas = canvasRef.current;
          const analyser = analyserRef.current;
          if (!canvas || !analyser) return;
          analyser.getByteFrequencyData(buf);
          const c = canvas.getContext("2d");
          if (!c) return;
          const W = canvas.width, H = canvas.height;
          c.clearRect(0, 0, W, H);
          const bars = buf.length;
          const bw = W / bars;
          c.fillStyle = pausedRef.current ? "rgba(148,163,184,0.55)" : "rgba(96,165,250,0.95)";
          for (let i = 0; i < bars; i++) {
            const h = Math.max(2, (buf[i] / 255) * H);
            c.fillRect(i * bw + 0.5, (H - h) / 2, bw - 1.5, h);
          }
        };
        render();
      } catch { /* sin ondas: igual graba */ }
    }).catch(() => { if (!cancelled) setError(t("rec.micError")); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { ctxRef.current?.close(); } catch { /* */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer (1s); no avanza en pausa.
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) { elapsedRef.current += 1; setElapsed((e) => e + 1); }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (pausedRef.current) {
      try { rec.resume(); } catch { /* */ }
      ctxRef.current?.resume();
      pausedRef.current = false; setPaused(false);
    } else {
      try { rec.pause(); } catch { /* */ }
      ctxRef.current?.suspend();
      pausedRef.current = true; setPaused(true);
    }
  };

  const finish = (send: boolean) => {
    sendRef.current = send;
    cancelAnimationFrame(rafRef.current);
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { onCancel(); }
    } else {
      onCancel();
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-destructive">
        🎤 {error}.
        <button type="button" className="ml-auto rounded px-2 py-1 text-muted-foreground hover:text-foreground" onClick={onCancel}>
          {t("rec.close")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-3">
      <button
        type="button"
        onClick={() => finish(false)}
        className="shrink-0 rounded-full p-2 text-destructive transition hover:bg-destructive/10"
        title={t("rec.cancelRecording")}
        aria-label={t("rec.cancel")}
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full bg-red-500", !paused && "animate-pulse")} />
        {fmt(elapsed)}
      </span>
      <canvas ref={canvasRef} width={600} height={36} className="h-9 min-w-0 flex-1 rounded bg-muted/30" />
      <button
        type="button"
        onClick={togglePause}
        disabled={!ready}
        className="shrink-0 rounded-full p-2 transition hover:bg-muted disabled:opacity-50"
        title={paused ? t("rec.resume") : t("rec.pause")}
        aria-label={paused ? t("rec.resume") : t("rec.pause")}
      >
        {paused ? <Mic className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={() => finish(true)}
        disabled={!ready}
        className="shrink-0 rounded-full bg-primary p-2 text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        title={t("rec.sendVoice")}
        aria-label={t("rec.send")}
      >
        <Send className="h-5 w-5" />
      </button>
    </div>
  );
}
