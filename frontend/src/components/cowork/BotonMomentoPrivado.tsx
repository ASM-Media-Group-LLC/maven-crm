import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { pedirApagarPorPausa, pedirReanudarTrasPausa } from "@/lib/ordenesDePausa";
import {
  empezarMomentoPrivado, estaEnMomentoPrivado, momentoPrivadoGuardado, suscribirMomentoPrivado, terminarMomentoPrivado,
} from "@/lib/momentoPrivado";

// «MOMENTO PRIVADO» (Alvaro, 19/11/2026): ver lib/momentoPrivado.ts. Un toque
// apaga cámara, micrófono y pantalla; Argos no insiste mientras dure y se gasta
// de los minutos de gracia. «Volver» prende lo que estaba; si se acaba solo, no
// se prende nada y Argos vuelve a pedir la cámara.

/** mm:ss que falta. */
function falta(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function useMomentoPrivado(): { hasta: number | null; ahora: number } {
  const hasta = useSyncExternalStore(suscribirMomentoPrivado, momentoPrivadoGuardado, () => null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta === null) return;
    const id = window.setInterval(() => { setAhora(Date.now()); estaEnMomentoPrivado(); }, 1000);
    return () => window.clearInterval(id);
  }, [hasta]);
  return { hasta: hasta !== null && hasta > ahora ? hasta : null, ahora };
}

function useAccionesMomentoPrivado(minutos: number | null) {
  const { t } = useLanguage();
  const empezar = () => {
    if (minutos === null || minutos <= 0) {
      toast.warning(t("cowork.privado.sinGracia"));
      return;
    }
    if (!empezarMomentoPrivado(minutos)) return;
    pedirApagarPorPausa();
    toast(t("cowork.privado.empezo"), { description: t("cowork.privado.empezoDesc", { n: minutos }) });
  };
  const volver = () => {
    terminarMomentoPrivado();
    pedirReanudarTrasPausa();
  };
  return { empezar, volver };
}

/** Avisa cuando se acaba SOLO (no cuando la persona toca «Volver»), mientras
 *  la página de Cowork está abierta. */
export function useAvisoFinMomentoPrivado() {
  const { t } = useLanguage();
  const { hasta } = useMomentoPrivado();
  const ultimo = useRef<number | null>(null);
  useEffect(() => {
    if (hasta !== null) { ultimo.current = hasta; return; }
    const era = ultimo.current;
    ultimo.current = null;
    if (era !== null && Date.now() >= era - 1500) toast.warning(t("cowork.privado.termino"), { duration: 10000 });
  }, [hasta, t]);
}

/** En la barra de Cowork (escritorio). */
export function BotonMomentoPrivado({ minutos, deshabilitado }: { minutos: number | null; deshabilitado?: boolean }) {
  const { t } = useLanguage();
  const { hasta, ahora } = useMomentoPrivado();
  const { empezar, volver } = useAccionesMomentoPrivado(minutos);
  if (hasta !== null) {
    return (
      <Button variant="ghost" size="sm" onClick={volver} title={t("cowork.privado.volver")}
        className="gap-1.5 rounded-full text-warning hover:bg-warning/10 hover:text-warning/80">
        <EyeOff className="h-4 w-4" />
        <span>{t("cowork.privado.boton")} ·</span>
        <span className="tabular-nums">{falta(hasta - ahora)}</span>
      </Button>
    );
  }
  const sinMinutos = minutos === null || minutos <= 0;
  return (
    <Button variant="ghost" size="sm" onClick={empezar} disabled={deshabilitado}
      title={sinMinutos ? t("cowork.privado.sinGracia") : t("cowork.privado.ayuda", { n: minutos ?? 0 })}
      className={cn("gap-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", sinMinutos && "opacity-60")}>
      <EyeOff className="h-4 w-4" /> {t("cowork.privado.boton")}
    </Button>
  );
}

/** En el menú del celular. */
export function ItemMomentoPrivado({ minutos, deshabilitado }: { minutos: number | null; deshabilitado?: boolean }) {
  const { t } = useLanguage();
  const { hasta, ahora } = useMomentoPrivado();
  const { empezar, volver } = useAccionesMomentoPrivado(minutos);
  if (hasta !== null) {
    return (
      <DropdownMenuItem onClick={volver} className="text-warning">
        <EyeOff className="mr-2 h-4 w-4" />
        {t("cowork.privado.volver")} · <span className="ml-1 tabular-nums">{falta(hasta - ahora)}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onClick={empezar} disabled={deshabilitado}>
      <EyeOff className="mr-2 h-4 w-4" /> {t("cowork.privado.boton")}
    </DropdownMenuItem>
  );
}
