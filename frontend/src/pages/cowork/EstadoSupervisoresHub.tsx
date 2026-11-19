// CÓMO ESTÁ CADA SUPERVISOR, EN VIVO, ARRIBA DEL HUB DEL DUEÑO (Alvaro,
// 18/11/2026: «llego y no están, y nadie me dijo si es que no quieren o que
// falló el sistema»). Un chip por supervisor en su turno: bien, fuera del Hub,
// sin cámara, sin pantalla o con la pantalla en negro, con la CAUSA (salió,
// se le cayó el internet, la app se cayó, el permiso del Mac…). La base decide
// (hub_estado_supervisores, la misma regla del aviso de los 2 minutos).
//
// Un fallo NO es «todos bien»: se dice y se ofrece reintentar.
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { claveDeCausaDelHub, claveDeEstadoDelHub, leerEstadoDelHub, type EstadoSupervisorHub } from "@/lib/estadoSupervisoresHub";

const CADA_MS = 20_000;

const sinTipar = supabase as unknown as {
  rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export default function EstadoSupervisoresHub() {
  const { t } = useLanguage();
  const [filas, setFilas] = useState<EstadoSupervisorHub[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const leer = useCallback(async () => {
    try {
      const { data, error } = await sinTipar.rpc("hub_estado_supervisores");
      if (error) throw new Error(error.message);
      setFilas(leerEstadoDelHub(data));
      setFallo(false);
    } catch (e) {
      console.warn("[hub] no pude leer el estado de los supervisores", e);
      setFallo(true);
    }
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    void leer();
    const id = window.setInterval(() => { void leer(); }, CADA_MS);
    return () => window.clearInterval(id);
  }, [leer]);

  if (fallo) {
    return (
      <div role="alert" className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-warning">
        <span>{t("cowork.hubEstado.error")}</span>
        <button type="button" onClick={() => { void leer(); }} className="inline-flex items-center gap-1 underline underline-offset-2">
          <RefreshCw className="h-3 w-3" aria-hidden /> {t("cowork.hubEstado.reintentar")}
        </button>
      </div>
    );
  }
  if (!filas || filas.length === 0) return null;

  return (
    <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("cowork.hubEstado.titulo")}</span>
      {filas.map((f) => {
        const mal = f.problema !== "ok";
        const min = f.desde ? Math.max(0, Math.floor((ahora - f.desde) / 60_000)) : null;
        return (
          <span
            key={f.userId}
            title={f.texto ?? undefined}
            className={cn(
              "vidrio shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
              mal ? "text-foreground ring-1 ring-destructive/40" : "text-muted-foreground",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", mal ? "bg-destructive" : "bg-success")} aria-hidden />
            <span className="font-medium">{f.nombre}</span>
            <span className="opacity-80">· {t(claveDeEstadoDelHub(f))}</span>
            {mal && f.causa && <span className="opacity-70">· {t(claveDeCausaDelHub(f.causa))}</span>}
            {mal && min != null && <span className="opacity-60">· {t("cowork.hubEstado.hace", { n: min })}</span>}
          </span>
        );
      })}
    </div>
  );
}
