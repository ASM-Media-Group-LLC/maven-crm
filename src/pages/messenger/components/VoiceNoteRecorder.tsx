import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceNoteRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
}

export default function VoiceNoteRecorder({ onSend, onCancel, isRecording, onStartRecording }: VoiceNoteRecorderProps) {
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      onStartRecording();
    } catch {
      // Permission denied or no mic
    }
  }, [onStartRecording]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  const handleCancel = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    setAudioBlob(null);
    setDuration(0);
    onCancel();
  }, [onCancel]);

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onSend(audioBlob, duration);
      setAudioBlob(null);
      setDuration(0);
    }
  }, [audioBlob, duration, onSend]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!isRecording && !audioBlob) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
        onClick={startRecording}
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 bg-destructive/5 rounded-2xl px-3 py-1.5 animate-fade-in">
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={handleCancel}>
        <X className="h-4 w-4" />
      </Button>

      {!audioBlob ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono text-destructive">{formatTime(duration)}</span>
            <span className="text-xs text-muted-foreground">Grabando...</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 bg-destructive/10 text-destructive rounded-full" onClick={stopRecording}>
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-mono text-foreground">{formatTime(duration)}</span>
            <audio src={URL.createObjectURL(audioBlob)} controls className="h-8 flex-1 max-w-[200px]" />
          </div>
          <Button size="icon" className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground" onClick={handleSend}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
