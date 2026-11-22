import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripHorizontal, Maximize2, Pin, PinOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio, type AccionMiniaturaLlamada, type EstadoMiniaturaLlamada } from "@/lib/escritorio";

export function useMiniaturaLlamada(activa: boolean) {
  const [estado, setEstado] = useState<EstadoMiniaturaLlamada | null>(null);
  useEffect(() => {
    const app = escritorio();
    if (!activa || !app?.miniaturaLlamada || !app.alCambiarMiniaturaLlamada) {
      setEstado(null);
      return;
    }

    let vigente = true;
    let huboEvento = false;
    const cancelar = app.alCambiarMiniaturaLlamada((nuevo) => {
      huboEvento = true;
      if (vigente) setEstado(nuevo);
    });
    void app.miniaturaLlamada("estado").then((inicial) => {
      if (vigente && !huboEvento) setEstado(inicial);
    }).catch(() => {});
    return () => {
      vigente = false;
      cancelar();
    };
  }, [activa]);
  return activa ? estado : null;
}

export default function BarraMiniaturaLlamada({ nombre, anclada }: { nombre: string; anclada: boolean }) {
  const { t } = useLanguage();
  const puntero = useRef<number | null>(null);
  const cuadro = useRef<number | null>(null);
  const arrastrar = escritorio()?.arrastrarMiniaturaLlamada;
  const terminar = (evento: PointerEvent) => {
    if (evento.pointerId !== puntero.current) return;
    puntero.current = null;
    if (cuadro.current !== null) {
      cancelAnimationFrame(cuadro.current);
      cuadro.current = null;
    }
    arrastrar?.("fin");
  };
  useEffect(() => () => {
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    if (puntero.current !== null) arrastrar?.("fin");
  }, [arrastrar]);
  const accionar = (accion: AccionMiniaturaLlamada) => {
    void escritorio()?.miniaturaLlamada?.(accion).catch(() => {});
  };
  const anclaje = t(anclada ? "messenger.miniatura.desanclar" : "messenger.miniatura.anclar");
  const btn = "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-xs hover:bg-muted";

  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1">
      <div
        className="flex h-8 min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-1.5 px-1.5 text-sm font-medium active:cursor-grabbing"
        onPointerDown={(evento) => {
          if (!arrastrar || evento.button !== 0 || puntero.current !== null) return;
          evento.currentTarget.setPointerCapture(evento.pointerId);
          puntero.current = evento.pointerId;
          arrastrar("inicio");
        }}
        onPointerMove={(evento) => {
          if (!arrastrar || evento.pointerId !== puntero.current || cuadro.current !== null) return;
          cuadro.current = requestAnimationFrame(() => {
            cuadro.current = null;
            arrastrar("mover");
          });
        }}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onLostPointerCapture={terminar}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{nombre}</span>
      </div>
      <button type="button" className={btn} aria-label={anclaje} title={anclaje} onClick={() => accionar("anclaje")}>
        {anclada ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button type="button" className={btn} onClick={() => accionar("expandir")}>
        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        {t("messenger.miniatura.expandir")}
      </button>
    </header>
  );
}
