import { useState, useRef, useCallback, useEffect } from "react";

export interface CaptionEntry {
  id: number;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

const CAPTION_RETENTION_MS = 8000;

export function useSpeechCaptions() {
  const [isActive, setIsActive] = useState(false);
  const [language, setLanguage] = useState("es-ES");
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const idCounterRef = useRef(0);
  const restartingRef = useRef(false);
  const activeRef = useRef(false);

  // Clean old captions
  useEffect(() => {
    if (captions.length === 0) return;
    const timer = setInterval(() => {
      setCaptions((prev) =>
        prev.filter((c) => Date.now() - c.timestamp < CAPTION_RETENTION_MS)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [captions.length]);

  const stopRecognition = useCallback(() => {
    activeRef.current = false;
    restartingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    setInterimText("");
  }, []);

  const startRecognition = useCallback(
    (lang: string) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setIsSupported(false);
        return;
      }

      stopRecognition();

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text) {
              const id = ++idCounterRef.current;
              setCaptions((prev) => [
                ...prev.slice(-10),
                { id, text, timestamp: Date.now(), isFinal: true },
              ]);
            }
            setInterimText("");
          } else {
            interim += result[0].transcript;
          }
        }
        if (interim) setInterimText(interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        console.warn("[Captions] Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        // Auto-restart if still active
        if (activeRef.current && !restartingRef.current) {
          restartingRef.current = true;
          setTimeout(() => {
            if (activeRef.current) {
              restartingRef.current = false;
              startRecognition(lang);
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
      activeRef.current = true;

      try {
        recognition.start();
      } catch (e) {
        console.warn("[Captions] Failed to start recognition:", e);
      }
    },
    [stopRecognition]
  );

  const toggle = useCallback(() => {
    if (isActive) {
      stopRecognition();
      setIsActive(false);
      setCaptions([]);
    } else {
      setIsActive(true);
      startRecognition(language);
    }
  }, [isActive, language, startRecognition, stopRecognition]);

  const changeLanguage = useCallback(
    (lang: string) => {
      setLanguage(lang);
      if (isActive) {
        stopRecognition();
        setTimeout(() => startRecognition(lang), 200);
      }
    },
    [isActive, startRecognition, stopRecognition]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      stopRecognition();
    };
  }, [stopRecognition]);

  return {
    isActive,
    isSupported,
    language,
    captions,
    interimText,
    toggle,
    changeLanguage,
  };
}

export const CAPTION_LANGUAGES = [
  { code: "es-ES", label: "Español" },
  { code: "en-US", label: "English" },
  { code: "pt-BR", label: "Português" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "zh-CN", label: "中文" },
  { code: "ru-RU", label: "Русский" },
  { code: "ar-SA", label: "العربية" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "pl-PL", label: "Polski" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "sv-SE", label: "Svenska" },
  { code: "da-DK", label: "Dansk" },
  { code: "nb-NO", label: "Norsk" },
  { code: "fi-FI", label: "Suomi" },
  { code: "el-GR", label: "Ελληνικά" },
  { code: "cs-CZ", label: "Čeština" },
  { code: "ro-RO", label: "Română" },
  { code: "hu-HU", label: "Magyar" },
  { code: "th-TH", label: "ไทย" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "id-ID", label: "Bahasa Indonesia" },
  { code: "ms-MY", label: "Bahasa Melayu" },
  { code: "uk-UA", label: "Українська" },
  { code: "ca-ES", label: "Català" },
  { code: "hr-HR", label: "Hrvatski" },
];
