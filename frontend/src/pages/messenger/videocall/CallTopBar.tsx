import { useState, useEffect, type ReactNode } from "react";
import { Link2, LayoutGrid, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

interface CallTopBarProps {
  roomName: string;
  participantCount: number;
  isEncrypted?: boolean;
  onOpenAdjustView: () => void;
  shareLink: string;
  hideShareLink?: boolean;
  compact?: boolean;
  /** Compacto porque es un TELÉFONO, no porque esté en una ventanita. El
   *  cronómetro vuelve solo en ese caso: en 340px no hay lugar, en un teléfono
   *  sí — y saber cuánto lleva la llamada es de lo más básico. */
  tactil?: boolean;
  /** Algo más al lado del nombre (Cowork pone acá el selector de sesión: sobre
   *  el video tapaba el nombre de la gente). */
  extra?: ReactNode;
  /** Botones extra a la derecha (antes de «Copiar enlace»). */
  acciones?: ReactNode;
}

export default function CallTopBar({
  roomName, participantCount, isEncrypted, onOpenAdjustView, shareLink, hideShareLink, compact, tactil, extra, acciones,
}: CallTopBarProps) {
  const { t } = useLanguage();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success(t("messenger.topbar.enlaceCopiado"));
  };

  return (
    <div className={cn("shrink-0 flex items-center justify-between bg-background", compact ? "px-2 py-1" : "px-4 py-2")}>
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
        {/* Con selector de sesiones/salas, el selector VA EN LUGAR del nombre:
            el selector ya dice dónde estás, y en el Supervisor Hub el nombre
            además se repetía con el título de la ventanita, uno debajo del otro
            (Jhon, 10/09). Sin selector —un Meet, una videollamada— el nombre. */}
        {/* EN VIVO (Estudio Acero): la sala está transmitiendo. */}
        {!compact && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse motion-reduce:animate-none" />{t("messenger.call.enVivo")}
          </span>
        )}
        {extra ?? (
          <span className={cn("font-medium text-foreground", compact ? "text-xs truncate max-w-[120px]" : "text-sm")}>{roomName}</span>
        )}
        {/* Cronómetro en caja, tipo marcador de transmisión. */}
        {(!compact || tactil) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse motion-reduce:animate-none" />
            <span className="font-mono text-xs tabular-nums tracking-wide text-foreground">{formatTime(elapsed)}</span>
          </div>
        )}
        {isEncrypted && (
          <div className="flex items-center gap-1 text-success">
            <Shield className="h-3 w-3" />
            <span className="text-[10px] font-medium">E2E</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className={cn("text-muted-foreground mr-1", compact ? "text-[10px]" : "text-xs mr-2")}>
          {participantCount === 1 ? t("messenger.topbar.unParticipante") : t("messenger.metrics.nParticipantes", { n: participantCount })}
        </span>
        {acciones}
        {!hideShareLink && !compact && (
          <button
            onClick={copyLink}
            title={t("messenger.topbar.copiarEnlace")}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-card/40 text-xs text-foreground hover:bg-card transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("messenger.topbar.copiarEnlace")}</span>
          </button>
        )}
        {!compact && (
          <button
            onClick={onOpenAdjustView}
            title={t("messenger.call.ajustarVista")}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-card/40 text-xs text-foreground hover:bg-card transition-colors"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("messenger.call.ajustarVista")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
