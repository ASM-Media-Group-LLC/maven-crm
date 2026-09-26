// El cronómetro del participante: "Hoy 3h 42m", corriendo, o detenido con el
// motivo. Se ve en la barra de Cowork todo el tiempo — que la persona vea el
// reloj parado es lo que hace que se corrija sola, sin que nadie la llame.
import { useEffect, useState } from "react";
import { Timer, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { suscribirReloj, leerReloj } from "@/lib/coworkLatido";
import { segundosMostrados, formatoReloj, type RelojCowork as Reloj } from "@/lib/coworkReloj";
import { useLanguage } from "@/hooks/useLanguage";
import { claveMotivoDetenido } from "./textosCowork";

/** Estado del reloj propio, con un tic por segundo mientras corre. */
export function useRelojPropio(): { reloj: Reloj | null; segundos: number } {
  const [reloj, setReloj] = useState<Reloj | null>(() => leerReloj());
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => suscribirReloj(setReloj), []);
  useEffect(() => {
    if (reloj?.estado !== "activo" && reloj?.estado !== "meet") return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [reloj?.estado]);
  return { reloj, segundos: segundosMostrados(reloj, reloj?.estado === "activo" || reloj?.estado === "meet" ? ahora : Date.now()) };
}

export default function RelojCowork({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const { reloj, segundos } = useRelojPropio();
  const { t } = useLanguage();
  if (!reloj) return null; // todavía no llegó el primer latido
  const corre = reloj.estado === "activo" || reloj.estado === "meet";
  const claveMotivo = claveMotivoDetenido(reloj.estado);
  const motivo = claveMotivo ? t(claveMotivo) : null;
  return (
    <span
      data-testid="reloj-cowork"
      data-estado={reloj.estado}
      title={corre ? t("cowork.clock.runningHint") : t("cowork.clock.stoppedHint", { reason: motivo ?? "", time: formatoReloj(segundos) })}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium tabular-nums shrink-0 transition-colors",
        corre
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-warning",
        className,
      )}
    >
      {corre ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
      ) : (
        <Pause className="h-3 w-3 shrink-0" />
      )}
      {!compacto && <Timer className="h-3 w-3 shrink-0 opacity-70" />}
      <span>{compacto ? "" : `${t("cowork.clock.today")} `}{formatoReloj(segundos)}</span>
      {!corre && !compacto && motivo && <span className="hidden lg:inline font-normal opacity-80">· {motivo}</span>}
    </span>
  );
}
