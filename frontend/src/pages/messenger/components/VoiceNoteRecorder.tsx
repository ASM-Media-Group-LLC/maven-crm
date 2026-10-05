import { useState, useRef, useCallback, useEffect } from "react";
import { Square, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import NotaDeVoz from "./NotaDeVoz";
import { useLanguage } from "@/hooks/useLanguage";

const MAX_DURATION_SEC = 300; // 5 minutes max

interface VoiceNoteRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
}

function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export default function VoiceNoteRecorder({ onSend, onCancel, isRecording, onStartRecording }: VoiceNoteRecorderProps) {
  const { t } = useLanguage();
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);
  const startedRef = useRef(false);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Auto-start recording when component mounts
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      toast.error(t("messenger.voice.noSoporta"));
      onCancel();
      return;
    }

    let cancelled = false;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start(100);
      setDuration(0);
      durationRef.current = 0;
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= MAX_DURATION_SEC) {
          clearInterval(timerRef.current);
          recorder.stop();
          toast.info(t("messenger.voice.limite"));
        }
      }, 1000);
      onStartRecording();
    }).catch((err: any) => {
      if (cancelled) return;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        toast.error(t("messenger.voice.permisoDenegado"));
      } else if (err?.name === "NotFoundError") {
        toast.error(t("messenger.voice.sinMicrofono"));
      } else {
        toast.error(t("messenger.voice.errorMicrofono"));
      }
      onCancel();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      stopStream();
    };
  }, [stopStream]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleCancel = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setAudioBlob(null);
    setDuration(0);
    durationRef.current = 0;
    onCancel();
  }, [onCancel, stopStream, previewUrl]);

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onSend(audioBlob, durationRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setAudioBlob(null);
      setDuration(0);
      durationRef.current = 0;
    }
  }, [audioBlob, onSend, previewUrl]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 flex-1 bg-destructive/5 rounded-2xl px-3 py-1.5 animate-fade-in">
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={handleCancel} aria-label={t("rec.cancelRecording")}>
        <X className="h-4 w-4" />
      </Button>

      {!audioBlob ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono text-destructive">{formatTime(duration)}</span>
            <span className="text-xs text-muted-foreground">{t("messenger.voice.grabando")}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 bg-destructive/10 text-destructive rounded-full" onClick={stopRecording} aria-label={t("messenger.voice.detener")}>
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-mono text-foreground">{formatTime(duration)}</span>
            {/* El nativo NO sirve acá: es el mismo .webm de MediaRecorder que en
                el chat, sin duración en la cabecera, así que la barra saldría
                clavada al final. */}
            {previewUrl && <NotaDeVoz src={previewUrl} />}
          </div>
          <Button size="icon" className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground" onClick={handleSend} aria-label={t("rec.sendVoice")}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
