import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { semaforo, tocaAvisar, type MuestraDelEquipo, type Semaforo } from "@/lib/medidorEquipo";

// El medidor de la app (lib/medidorEquipo.ts): una muestra cada 20 s, el aviso
// informativo si la conexión sigue en rojo (máximo uno cada 30 min) y una
// fila en equipo_salud cada 5 min para su Expediente de Argos.

const CADA_MS = 20_000;
const GUARDAR_CADA_MS = 5 * 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

async function medirPing(signal: AbortSignal): Promise<number | null> {
  if (!navigator.onLine) return null;
  const t0 = performance.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }, cache: "no-store", signal,
    });
    if (!r.ok && r.status >= 500) return null;
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

async function tomarMuestra(signal: AbortSignal): Promise<MuestraDelEquipo> {
  const con = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  // La respuesta nativa también tiene límite: una app ocupada no debe acumular
  // consultas de memoria mientras la anterior sigue esperando.
  let alAbortar: (() => void) | undefined;
  const cancelada = new Promise<null>((resolve) => {
    alAbortar = () => resolve(null);
    if (signal.aborted) resolve(null);
    else signal.addEventListener("abort", alAbortar, { once: true });
  });
  const [ping, mem] = await Promise.all([
    medirPing(signal),
    Promise.race([escritorio()?.memoria?.().catch(() => null) ?? null, cancelada]),
  ]).finally(() => { if (alAbortar) signal.removeEventListener("abort", alAbortar); });
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
  const ultimoAviso = useRef<number | undefined>(undefined);
  const ultimaGuardada = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const app = escritorio();
    if (!app || !user?.id) return;
    let vivo = true;
    let visibleNativa = true;
    let cambiosDeVisibilidad = 0;
    const escondida = () => document.hidden || !visibleNativa;
    let enCurso = false;
    let ultimaRonda = 0;
    let peticion: AbortController | null = null;
    anterior.current = null;
    ultimaGuardada.current = 0;
    const ronda = async () => {
      if (!vivo || enCurso) return;
      // En segundo plano conservamos el diagnóstico cada cinco minutos, sin
      // golpear Auth cada veinte segundos mientras la persona usa otra app.
      if (escondida() && ultimaRonda && Date.now() - ultimaRonda < GUARDAR_CADA_MS) return;
      enCurso = true;
      const inicioRonda = Date.now();
      ultimaRonda = inicioRonda;
      const ctrl = new AbortController();
      peticion = ctrl;
      const limite = window.setTimeout(() => ctrl.abort(), 8_000);
      let m: MuestraDelEquipo;
      try {
        m = await tomarMuestra(ctrl.signal);
      } catch {
        return;
      } finally {
        window.clearTimeout(limite);
        enCurso = false;
        if (peticion === ctrl) peticion = null;
      }
      if (!vivo) return;
      setMuestra(m);
      const luces = semaforo(m);
      const ahora = Date.now();
      // La carga del procesador y la RAM no interrumpen el trabajo. El detalle
      // sigue mostrando las mediciones, sin atribuir una causa a la lentitud.
      if (tocaAvisar("internet", luces, anterior.current, ultimoAviso.current, ahora) && !detalleAbierto.current) {
        ultimoAviso.current = ahora;
        toast.info(tRef.current(m.en_linea ? "pwa.medidor.aviso.internet.titulo" : "pwa.medidor.sinConexion"), {
          id: "medidor-equipo",
          description: tRef.current(m.en_linea ? "pwa.medidor.aviso.internet.detalle" : "pwa.medidor.aviso.internet.sinConexion"),
          duration: 8_000,
        });
      }
      anterior.current = luces;
      // La misma referencia de tiempo que el muestreo: si el segundo ping
      // tarda menos, medir desde el final saltaría un registro entero (10 min).
      if (user && inicioRonda - ultimaGuardada.current >= GUARDAR_CADA_MS) {
        ultimaGuardada.current = inicioRonda;
        void sinTipar.from("equipo_salud").insert({ user_id: user.id, datos: { ...m, ...luces } }).then(() => {}, () => {});
      }
    };
    void ronda();
    const id = window.setInterval(() => { void ronda(); }, CADA_MS);
    const alVolver = () => { if (!escondida()) void ronda(); };
    // Electron mantiene document.visible para no suspender el audio. Al
    // minimizar manda su propia señal, que también debe frenar este medidor.
    const soltarVisibilidad = app.alCambiarVisibilidad?.((visible) => {
      cambiosDeVisibilidad++;
      visibleNativa = visible;
      alVolver();
    });
    void app.visible?.().then((visible) => {
      if (vivo && cambiosDeVisibilidad === 0) visibleNativa = visible;
    }).catch(() => {});
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alVolver);
    return () => {
      vivo = false;
      peticion?.abort();
      soltarVisibilidad?.();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alVolver);
    };
  }, [user?.id]);

  return { muestra, luces: muestra ? semaforo(muestra) : null };
}
