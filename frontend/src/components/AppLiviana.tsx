import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { escritorio } from "@/lib/escritorio";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import { estaEnPausa } from "@/lib/coworkPausa";
import { hayAlgoAMedioEscribir } from "@/lib/recargaAlColgar";
import {
  CLAVE_ULTIMO_REFRESCO, MIRAR_MEMORIA_CADA_MS, debeRefrescarPorMemoria, equipoFlojo, marcarModoLiviano,
} from "@/lib/appLiviana";

// SOLO EN LA APP DE COMPUTADOR (ver lib/appLiviana.ts):
//  · modo liviano en equipos de 8 GB o menos;
//  · refresco solo si la app pasa del tope de memoria, en un momento quieto;
//  · anota en app_caidas cuando la app se cayó/congeló y se recuperó sola
//    (desktop/src/recuperarse.js) y cuando se refrescó por memoria.
// En el navegador no hace nada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };
const CLAVE_REFRESCO_PENDIENTE = "maven.app.refrescoPorMemoriaPendiente";

type Cierre = { at?: string; motivo?: string; codigo?: number | null; ram_app_mb?: number | null; ram_equipo_gb?: number | null; ram_libre_gb?: number | null; version?: string; plataforma?: string };

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribir(clave: string, valor: string | null): void {
  try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ }
}

async function anotarCaidas(filas: Cierre[]): Promise<void> {
  if (!filas.length) return;
  const { error } = await sinTipar.from("app_caidas").insert(filas.map((f) => ({
    ocurrio: f.at ?? null,
    motivo: String(f.motivo ?? "desconocido").slice(0, 60),
    codigo: typeof f.codigo === "number" ? f.codigo : null,
    ram_app_mb: typeof f.ram_app_mb === "number" ? Math.round(f.ram_app_mb) : null,
    ram_equipo_gb: typeof f.ram_equipo_gb === "number" ? f.ram_equipo_gb : null,
    ram_libre_gb: typeof f.ram_libre_gb === "number" ? f.ram_libre_gb : null,
    version: f.version ? String(f.version).slice(0, 40) : null,
    plataforma: f.plataforma === "mac" || f.plataforma === "windows" || f.plataforma === "linux" ? f.plataforma : null,
  })));
  if (error) console.warn("[app] no se pudo anotar la recuperación", error);
}

export function AppLiviana() {
  const { user } = useAuth();
  const conSesion = !!user;

  useEffect(() => {
    const app = escritorio();
    if (!app?.memoria || !conSesion) return;
    let vivo = true;

    // Lo que pasó antes de este arranque: caídas recuperadas y refresco por memoria.
    void (async () => {
      const filas: Cierre[] = [];
      try { filas.push(...(((await app.ultimoCierre?.()) ?? []) as Cierre[])); } catch { /* app vieja */ }
      const pendiente = leer(CLAVE_REFRESCO_PENDIENTE);
      if (pendiente) {
        try { filas.push(JSON.parse(pendiente) as Cierre); } catch { /* corrupto */ }
        escribir(CLAVE_REFRESCO_PENDIENTE, null);
      }
      if (vivo) await anotarCaidas(filas);
    })();

    const mirar = async () => {
      let m: { app_mb?: number; equipo_gb?: number; libre_gb?: number } | null = null;
      try { m = (await app.memoria?.()) as typeof m; } catch { m = null; }
      if (!vivo || !m) return;
      marcarModoLiviano(equipoFlojo(m.equipo_gb));
      const ultimo = Number(leer(CLAVE_ULTIMO_REFRESCO)) || null;
      if (debeRefrescarPorMemoria({
        ramAppMb: m.app_mb,
        enLlamada: hayLlamadaActiva(),
        enPausa: estaEnPausa(),
        escribiendo: hayAlgoAMedioEscribir(),
        ultimoRefresco: ultimo,
        ahora: Date.now(),
      })) {
        escribir(CLAVE_ULTIMO_REFRESCO, String(Date.now()));
        escribir(CLAVE_REFRESCO_PENDIENTE, JSON.stringify({
          at: new Date().toISOString(), motivo: "refresco_por_memoria", ram_app_mb: m.app_mb,
          ram_equipo_gb: m.equipo_gb, ram_libre_gb: m.libre_gb, plataforma: app.plataforma,
        } satisfies Cierre));
        window.location.reload();
      }
    };
    void mirar();
    const id = window.setInterval(() => { void mirar(); }, MIRAR_MEMORIA_CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [conSesion]);

  return null;
}

export default AppLiviana;
