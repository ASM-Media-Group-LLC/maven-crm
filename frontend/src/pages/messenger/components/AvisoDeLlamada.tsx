// El rastro de una llamada en la conversación (18/11/2026, llamadas tipo
// Skype): «Llamada perdida», «Llamada rechazada», «Llamada de video · 12 min».
// Lo escribe la base al cerrarse la llamada (llamada_al_chat) y aquí se dibuja
// en el idioma de cada quien.
import { Phone, PhoneMissed, PhoneOff, Video } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface DatosDeLlamada {
  estado: "perdida" | "rechazada" | "terminada";
  tipo?: "audio" | "video";
  segundos?: number | null;
}

export function datosDeLlamada(rico: unknown): DatosDeLlamada | null {
  const l = (rico as { llamada?: DatosDeLlamada } | null | undefined)?.llamada;
  if (!l || !["perdida", "rechazada", "terminada"].includes(l.estado)) return null;
  return l;
}

export function textoDeLlamada(l: DatosDeLlamada, t: (k: TranslationKey, v?: Record<string, string | number>) => string): string {
  if (l.estado === "perdida") return t("messenger.llamada.perdida");
  if (l.estado === "rechazada") return t("messenger.llamada.rechazada");
  const min = Math.max(1, Math.round((l.segundos ?? 0) / 60));
  return t(l.tipo === "audio" ? "messenger.llamada.deVoz" : "messenger.llamada.deVideo", { min });
}

export default function AvisoDeLlamada({ llamada, hora }: { llamada: DatosDeLlamada; hora?: string }) {
  const { t } = useLanguage();
  const fallida = llamada.estado !== "terminada";
  const Icono = llamada.estado === "perdida" ? PhoneMissed : llamada.estado === "rechazada" ? PhoneOff : llamada.tipo === "audio" ? Phone : Video;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        fallida ? "border-destructive/30 text-destructive" : "border-border/60 text-muted-foreground",
      )}
    >
      <Icono className="h-3.5 w-3.5" />
      {textoDeLlamada(llamada, t)}
      {hora && <span className="text-muted-foreground/70">· {hora}</span>}
    </span>
  );
}
