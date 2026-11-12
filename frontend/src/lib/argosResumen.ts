// LO BUENO Y LO MALO DEL DÍA (Alvaro, 11/11/2026: «una frase que diga cómo va y
// por qué, en minutos», «lo bueno y lo malo, cada cosa con su hora»). Sale del
// turno minuto a minuto (lib/argosJornada.ts) y de los pantallazos que juzgó
// Argos. Funciones puras: las ata test/argos/argosResumen.test.ts.

import { enRango, type EstadoMinuto, type Jornada } from "@/lib/argosJornada";

export interface CapturaJuzgada {
  at: number;
  veredicto: string | null;
  /** Fuera de lugar y no perdonada. */
  flojo: boolean;
}

export type ClaveHecho = "tarde" | "aTiempo" | "seFue" | "falla" | "flojo" | "bienTramo" | "pausaOk";

export interface Hecho {
  at: number;
  hasta?: number;
  clave: ClaveHecho;
  estado?: EstadoMinuto;
  min?: number;
  /** La app donde lo vio Argos (en «flojo» y en las fallas de «distraído»). */
  app?: string | null;
}

/** La app que dijo Argos («Instagram / Navegador web · Navega…» → «Instagram / Navegador web»). */
export function appDe(veredicto: string | null): string | null {
  const v = (veredicto ?? "").trim();
  if (!v) return null;
  const i = v.indexOf(" · ");
  if (i > 0) return v.slice(0, i).trim();
  return v.split(/\s+/).slice(0, 4).join(" ");
}

const MIN = 60_000;
const BIEN_LARGO_MIN = 30;
const TOPE_MALO = 12;

/** Lo bueno y lo malo del día, cada cosa con su hora, en orden de hora. */
export function loBuenoYLoMalo(j: Jornada, capturas: CapturaJuzgada[]): { bueno: Hecho[]; malo: Hecho[]; masMalo: number } {
  const malo: Hecho[] = [];
  const bueno: Hecho[] = [];
  const flojas = capturas.filter((c) => c.flojo);
  const usadas = new Set<number>();

  const primero = j.tramos[0];
  const tarde = primero && primero.estado === "no_entro" && j.entro ? Math.round((primero.hasta - primero.desde) / MIN) : 0;
  if (tarde >= 1) malo.push({ at: j.entro as number, clave: "tarde", min: tarde });
  else if (j.entro) bueno.push({ at: j.entro, clave: "aTiempo" });

  for (const f of j.fallas) {
    const h: Hecho = { at: f.desde, hasta: f.hasta, clave: "falla", estado: f.estado, min: Math.round(f.seg / 60) };
    if (f.estado === "distraido") {
      const c = flojas.find((x) => enRango(x.at, f.desde - MIN, f.hasta));
      if (c) { h.app = appDe(c.veredicto); usadas.add(c.at); }
    }
    malo.push(h);
  }
  for (const c of flojas) if (!usadas.has(c.at)) malo.push({ at: c.at, clave: "flojo", app: appDe(c.veredicto) });

  for (const tr of j.tramos) {
    const min = Math.round((tr.hasta - tr.desde) / MIN);
    if (tr.estado === "se_fue" && min >= 1) malo.push({ at: tr.desde, clave: "seFue", min });
    if (tr.estado === "bien" && min >= BIEN_LARGO_MIN) bueno.push({ at: tr.desde, hasta: tr.hasta, clave: "bienTramo", min });
    if (tr.estado === "pausa" && min >= 5) bueno.push({ at: tr.desde, hasta: tr.hasta, clave: "pausaOk", min });
  }

  // Si hay demasiado, quedan las más grandes (un pantallazo flojo pesa como 5 min).
  const peso = (h: Hecho) => (h.clave === "flojo" ? 5 : h.min ?? 0);
  const recortado = malo.length > TOPE_MALO ? [...malo].sort((a, b) => peso(b) - peso(a)).slice(0, TOPE_MALO) : malo;
  const porHora = (a: Hecho, b: Hecho) => a.at - b.at;
  return { bueno: bueno.sort(porHora), malo: [...recortado].sort(porHora), masMalo: malo.length - recortado.length };
}

/** Las tres cosas malas más grandes (para la frase del día), en orden de hora. */
export function loPeor(malo: Hecho[], n = 3): Hecho[] {
  const peso = (h: Hecho) => (h.clave === "flojo" ? 5 : h.min ?? 0);
  return [...malo].sort((a, b) => peso(b) - peso(a)).slice(0, n).sort((a, b) => a.at - b.at);
}

/** Dónde pasó el tiempo: minutos aproximados por app, de los pantallazos que juzgó Argos. */
export function tiempoPorApp(capturas: CapturaJuzgada[], max = 6): { app: string; min: number }[] {
  const juzgadas = capturas.filter((c) => c.veredicto).sort((a, b) => a.at - b.at);
  const porApp = new Map<string, number>();
  juzgadas.forEach((c, i) => {
    const siguiente = juzgadas[i + 1]?.at;
    const dur = siguiente === undefined ? 5 * MIN : Math.min(siguiente - c.at, 10 * MIN);
    const app = appDe(c.veredicto) ?? "—";
    porApp.set(app, (porApp.get(app) ?? 0) + dur);
  });
  return [...porApp.entries()]
    .map(([app, ms]) => ({ app, min: Math.max(1, Math.round(ms / MIN)) }))
    .sort((a, b) => b.min - a.min)
    .slice(0, max);
}
