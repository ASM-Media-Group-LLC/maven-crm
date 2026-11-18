import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import type { TranslationKey } from "@/lib/i18n";
import { semaforo, tocaAvisar, type Cosa, type MuestraDelEquipo, type Semaforo } from "@/lib/medidorEquipo";

// El medidor de la app (lib/medidorEquipo.ts): una muestra cada 20 s, el aviso
// a la persona si algo sigue en rojo (máximo uno cada 30 min por cosa) y una
// fila en equipo_salud cada 5 min para su Expediente de Argos.

const CADA_MS = 20_000;
const GUARDAR_CADA_MS = 5 * 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

async function medirPing(): Promise<number | null> {
  const t0 = performance.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok && r.status >= 500) return null;
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

async function tomarMuestra(): Promise<MuestraDelEquipo> {
  const con = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  const [ping, mem] = await Promise.all([medirPing(), escritorio()?.memoria?.().catch(() => null) ?? null]);
  return {
    en_linea: navigator.onLine,
    ping_ms: ping,
    bajada_mbps: typeof con?.downlink === "number" && con.downlink > 0 ? con.downlink : null,
    equipo_gb: mem?.equipo_gb ?? null,
    libre_gb: mem?.libre_gb ?? null,
    app_mb: mem?.app_mb ?? null,
    cpu_equipo_pct: mem?.cpu_equipo_pct ?? null,
    cpu_app_pct: mem?.cpu_app_pct ?? null,
    mac: escritorio()?.plataforma === "mac",
  };
}

/** El detalle del medidor está abierto (no se avisa por encima). */
const detalleAbierto = { current: false };
export function marcarDetalleAbierto(abierto: boolean) { detalleAbierto.current = abierto; }

export function useMedidorEquipo(): { muestra: MuestraDelEquipo | null; luces: Semaforo | null } {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [muestra, setMuestra] = useState<MuestraDelEquipo | null>(null);
  const anterior = useRef<Semaforo | null>(null);
  const avisos = useRef<Partial<Record<Cosa, number>>>({});
  const ultimaGuardada = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!escritorio()) return;
    let vivo = true;
    const ronda = async () => {
      const m = await tomarMuestra();
      if (!vivo) return;
      setMuestra(m);
      const luces = semaforo(m);
      const ahora = Date.now();
      // Un solo aviso con todo lo que siguió en rojo (nada encimado), y nunca
      // con el detalle del medidor abierto: ahí ya se ve.
      const toca = (["internet", "memoria", "computador"] as Cosa[])
        .filter((c) => tocaAvisar(c, luces, anterior.current, avisos.current[c], ahora));
      if (toca.length > 0 && !detalleAbierto.current) {
        for (const c of toca) avisos.current[c] = ahora;
        const titulo = toca.length === 1
          ? tRef.current(`pwa.medidor.aviso.${toca[0]}.titulo` as TranslationKey)
          : tRef.current("pwa.medidor.aviso.varios");
        toast.warning(titulo, {
          id: "medidor-equipo",
          description: toca.map((c) => tRef.current(`pwa.medidor.consejo.${c}.rojo` as TranslationKey)).join(" "),
          duration: 15_000,
        });
      }
      anterior.current = luces;
      if (user && ahora - ultimaGuardada.current >= GUARDAR_CADA_MS) {
        ultimaGuardada.current = ahora;
        void sinTipar.from("equipo_salud").insert({ user_id: user.id, datos: { ...m, ...luces } }).then(() => {}, () => {});
      }
    };
    void ronda();
    const id = window.setInterval(() => { void ronda(); }, CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user]);

  return { muestra, luces: muestra ? semaforo(muestra) : null };
}
