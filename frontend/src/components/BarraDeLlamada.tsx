// LA BARRA DE LA LLAMADA EN CURSO (Alvaro, 18/11/2026: «se escondió la llamada
// y no encontraba dónde colgar»). Mientras hay una llamada abierta en otra
// pestaña o ventana, Maven muestra arriba «En llamada con Grace · 00:42 ·
// Volver · Colgar». Ver lib/llamadaEnCurso.ts.
import { useEffect, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  abrirCanalDeLlamada, aplicarMensaje, duracion, esMensajeDeLlamada, llamadasVivas,
  type LlamadaVista, type MensajeLlamada,
} from "@/lib/llamadaEnCurso";

export function BarraDeLlamada() {
  const { t } = useLanguage();
  const [llamadas, setLlamadas] = useState<Record<string, LlamadaVista>>({});
  const [ahora, setAhora] = useState(() => Date.now());
  const [canal, setCanal] = useState<BroadcastChannel | null>(null);

  useEffect(() => {
    const c = abrirCanalDeLlamada();
    if (!c) return;
    setCanal(c);
    c.onmessage = (e) => {
      const m: unknown = e.data;
      if (esMensajeDeLlamada(m)) setLlamadas((antes) => aplicarMensaje(antes, m, Date.now()));
    };
    return () => { c.close(); setCanal(null); };
  }, []);

  const vivas = llamadasVivas(llamadas, ahora);
  const hay = vivas.length > 0;
  useEffect(() => {
    if (!hay && Object.keys(llamadas).length === 0) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hay, llamadas]);

  if (!hay) return null;
  const llamada = vivas[0];
  const pedir = (m: MensajeLlamada) => { try { canal?.postMessage(m); } catch { /* canal cerrado */ } };

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 rounded-2xl border border-success/40 bg-success/15 px-3 py-1.5 text-sm text-foreground"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
        <Phone className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {t("shared.barraLlamada.enLlamadaCon", { name: llamada.nombre })}
        <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">{duracion(ahora - llamada.desde)}</span>
      </span>
      <button
        type="button"
        onClick={() => pedir({ tipo: "mostrar", sala: llamada.sala })}
        className="inline-flex h-8 items-center rounded-full border border-border/60 bg-card/60 px-3 text-xs font-medium hover:bg-card"
      >
        {t("shared.barraLlamada.volver")}
      </button>
      <button
        type="button"
        onClick={() => pedir({ tipo: "colgar", sala: llamada.sala })}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
      >
        <PhoneOff className="h-3.5 w-3.5" /> {t("shared.barraLlamada.colgar")}
      </button>
    </div>
  );
}
