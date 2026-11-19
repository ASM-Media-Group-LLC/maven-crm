// EL HISTORIAL DEL HUB POR SUPERVISOR (Alvaro, 19/11/2026: «quiero saber si lo
// apagan a propósito o si falla el sistema»). Lo que devuelve hub_historial
// (supabase/migrations/20261119014500_hub_historial_supervisores.sql) en la
// forma de la pestaña «Historial del Hub» de Argos, y de cada movimiento: qué
// pasó, por qué y si fue a propósito, una falla o no se sabe.
import type { TranslationKey } from "@/lib/i18n";

export type TipoEventoHub = "pantalla" | "camara" | "hub";

export interface EventoHub {
  id: number;
  userId: string;
  nombre: string;
  tipo: TipoEventoHub;
  /** pantalla: compartiendo | sin_pantalla · camara: prendida | apagada · hub: entro | salio */
  valor: string;
  causa: string | null;
  /** ms desde la época */
  creado: number;
}

export interface ResumenHub {
  userId: string;
  nombre: string;
  movimientos: number;
  pantallaQuitada: number;
  pantallaFalla: number;
  camaraApagada: number;
  salidas: number;
  salidasPropias: number;
  salidasFalla: number;
  minSinPantalla: number;
  minSinCamara: number;
  minFuera: number;
}

export interface HistorialHub {
  eventos: EventoHub[];
  resumen: ResumenHub[];
}

const TIPOS = new Set<string>(["pantalla", "camara", "hub"]);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0) || 0;
const nombreCorto = (v: unknown, id: string) =>
  typeof v === "string" && v.trim() ? v.trim().split(/\s+/).slice(0, 2).join(" ") : id.slice(0, 8);

/** Lee la respuesta. Lo que no tiene forma lanza: un fallo nunca es «sin movimientos». */
export function leerHistorialHub(data: unknown): HistorialHub {
  if (!data || typeof data !== "object") throw new Error("respuesta inesperada");
  const d = data as { eventos?: unknown; resumen?: unknown };
  if (!Array.isArray(d.eventos) || !Array.isArray(d.resumen)) throw new Error("respuesta inesperada");
  const eventos: EventoHub[] = [];
  for (const e of d.eventos as Array<Record<string, unknown>>) {
    if (!e || typeof e.user_id !== "string" || typeof e.tipo !== "string" || !TIPOS.has(e.tipo) || typeof e.valor !== "string") continue;
    const creado = typeof e.creado === "string" ? Date.parse(e.creado) : NaN;
    if (!Number.isFinite(creado)) continue;
    eventos.push({
      id: num(e.id),
      userId: e.user_id,
      nombre: nombreCorto(e.nombre, e.user_id),
      tipo: e.tipo as TipoEventoHub,
      valor: e.valor,
      causa: typeof e.causa === "string" ? e.causa : null,
      creado,
    });
  }
  eventos.sort((a, b) => b.creado - a.creado || b.id - a.id);
  const resumen: ResumenHub[] = [];
  for (const r of d.resumen as Array<Record<string, unknown>>) {
    if (!r || typeof r.user_id !== "string") continue;
    resumen.push({
      userId: r.user_id,
      nombre: nombreCorto(r.nombre, r.user_id),
      movimientos: num(r.movimientos),
      pantallaQuitada: num(r.pantalla_quitada),
      pantallaFalla: num(r.pantalla_falla),
      camaraApagada: num(r.camara_apagada),
      salidas: num(r.salidas),
      salidasPropias: num(r.salidas_propias),
      salidasFalla: num(r.salidas_falla),
      minSinPantalla: num(r.min_sin_pantalla),
      minSinCamara: num(r.min_sin_camara),
      minFuera: num(r.min_fuera),
    });
  }
  // Primero quien más cosas quitó a propósito; después el que más se movió.
  resumen.sort((a, b) =>
    (b.pantallaQuitada + b.camaraApagada + b.salidasPropias) - (a.pantallaQuitada + a.camaraApagada + a.salidasPropias)
    || b.movimientos - a.movimientos || a.nombre.localeCompare(b.nombre));
  return { eventos, resumen };
}

/** ¿Lo hizo él, falló el sistema o no se sabe? Lo que el dueño quiere saber. */
export type QuienFue = "proposito" | "falla" | "dudoso" | "bien";

export function quienFue(e: Pick<EventoHub, "tipo" | "valor" | "causa">): QuienFue {
  if (e.tipo === "pantalla") {
    if (e.valor === "compartiendo") return "bien";
    if (e.causa === "apagada") return "proposito";
    if (e.causa === "negra" || e.causa === "permiso" || e.causa === "falla") return "falla";
    return "dudoso";
  }
  if (e.tipo === "camara") {
    if (e.valor === "prendida") return "bien";
    return e.causa === "pausa" ? "dudoso" : "proposito";
  }
  if (e.valor === "entro") return "bien";
  if (e.causa === "salio") return "proposito";
  if (e.causa === "app_caida" || e.causa === "conexion") return "falla";
  return "dudoso";
}

/** El texto de qué pasó. */
export function claveDeEvento(e: Pick<EventoHub, "tipo" | "valor">): TranslationKey {
  if (e.tipo === "pantalla") return e.valor === "compartiendo" ? "hr.hubHist.ev.pantallaOn" : "hr.hubHist.ev.pantallaOff";
  if (e.tipo === "camara") return e.valor === "prendida" ? "hr.hubHist.ev.camaraOn" : "hr.hubHist.ev.camaraOff";
  return e.valor === "entro" ? "hr.hubHist.ev.entro" : "hr.hubHist.ev.salio";
}

const CAUSAS: Record<string, TranslationKey> = {
  // pantalla
  "pantalla:apagada": "hr.hubHist.causa.pantalla_apagada",
  "pantalla:negra": "hr.hubHist.causa.pantalla_negra",
  "pantalla:permiso": "hr.hubHist.causa.permiso_pantalla",
  "pantalla:falla": "hr.hubHist.causa.pantalla_falla",
  "pantalla:sin_pedir": "hr.hubHist.causa.pantalla_sin_pedir",
  // cámara
  "camara:apagada": "hr.hubHist.causa.camara_apagada",
  "camara:pausa": "hr.hubHist.causa.camara_pausa",
  // Hub
  "hub:salio": "hr.hubHist.causa.salio",
  "hub:app_caida": "hr.hubHist.causa.app_caida",
  "hub:conexion": "hr.hubHist.causa.conexion",
  "hub:equipo_dormido": "hr.hubHist.causa.equipo_dormido",
  "hub:sin_senal": "hr.hubHist.causa.sin_senal",
};

/** El porqué en palabras (el mismo de hub_texto_causa); null si no aplica. */
export function claveDeCausaDeEvento(e: Pick<EventoHub, "tipo" | "causa">): TranslationKey | null {
  if (!e.causa) return null;
  return CAUSAS[`${e.tipo}:${e.causa}`] ?? null;
}

/** El día en Bogotá (AAAA-MM-DD), corrido `dias` hacia atrás. */
export function diaBogota(ahora: Date = new Date(), dias = 0): string {
  const d = new Date(ahora.getTime() - dias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
