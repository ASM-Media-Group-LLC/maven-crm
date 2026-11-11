// El despachador de los avisos del EQUIPO (equipo.persona_entro, equipo.persona_salio,
// equipo.rol_cambio y las pruebas): lo que corre cuando el cron equipo-webhooks-tick
// despierta a esta edge con ?tarea=equipo.
//
// Por qué vive aquí y no en una función nueva: es el mismo envío (la URL se vuelve a
// mirar en cada envío, la conexión va a la IP verificada, sin redirecciones) y la misma
// firma Standard Webhooks que los timbres del Messenger (_shared/webhook-salida.ts),
// sin los supuestos del Messenger (un timbre por llave, una sola agencia, el feed).
// Las tablas, el orden y los reintentos son de la migración 20261111190000.
//
// El contrato con la base:
//   * equipo_webhooks_reclamar devuelve, por suscripción, la entrega más vieja que ya
//     toca (en orden: una que falla frena a las de atrás) con su URL, su cuerpo y su
//     secreto (de Vault). ANTES de devolverla ya anotó el intento y la próxima espera:
//     si esta corrida se muere a mitad del envío, el turno siguiente espera;
//   * después de mandar, UNA escritura: equipo_webhooks_anotar con el reclamo que
//     devolvió reclamar. 'perdio' = la pausaron, la detuvieron o venció el reclamo:
//     carrera perdida, no un fallo;
//   * 2xx → entregada; 410 → se detiene (receiver_gone); una URL que ya no se acepta →
//     se detiene (config_error); cualquier otra cosa → reintentar (con Retry-After si
//     vino). 72 h fallando, la base la detiene sola.
//
// ⚠️ Los logs llevan SOLO ids, acciones, clases, códigos y milisegundos (lineaDeLog,
// con tipos cerrados). Nunca la URL, el cuerpo, los encabezados ni el secreto.

import { decidir, encabezadosFirmados, enviarWebhook, PLAZO_ENVIO_MS } from "../_shared/webhook-salida.ts";

/** Cuántas entregas por corrida (una por suscripción) y por cuánto tiempo se reclaman. */
export const RECLAMO_MAX_EQUIPO = 10;
export const RECLAMO_S_EQUIPO = 60;
export const EN_PARALELO_EQUIPO = 4;
/** No se manda con menos que esto: la entrega queda para el turno siguiente. */
export const MINIMO_PARA_MANDAR_MS = 3_000;

/** Lo que devuelve equipo_webhooks_reclamar (los instantes, como texto de PostgREST). */
export interface EntregaReclamada {
  id: string;
  webhook_id: string;
  tenant_id: string;
  evento: string;
  url: string;
  cuerpo: string;
  intento: number;
  /** null si el secreto no está en Vault: no se puede firmar (config_error). */
  secreto: string | null;
  /** lease_until tal como vino: texto opaco, se devuelve tal cual al anotar. */
  reclamo: string;
}

export type AccionDeAnotar = "entregado" | "reintentar" | "detener";

export interface Anotacion {
  id: string;
  reclamo: string;
  accion: AccionDeAnotar;
  codigo: number | null;
  error: string | null;
  incierto: boolean;
  reintentarEnS: number | null;
  latenciaMs: number | null;
  motivo: "receiver_gone" | "config_error" | null;
}

export interface DatosEquipo {
  /** equipo_webhooks_reclamar(max, segundos); null si falló. */
  reclamar(max: number, segundos: number): Promise<EntregaReclamada[] | null>;
  /** equipo_webhooks_anotar(...); null si falló. */
  anotar(a: Anotacion): Promise<"ok" | "perdio" | null>;
}

export type AccionLogEquipo = "reclamo" | "entregado" | "reintentar" | "detenido" | "perdio" | "sin_tiempo" | "error";
export type ClaseLogEquipo = "secreto" | "anotacion" | "receiver_gone" | "config_error";

const ID_LOG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLASE_LOG = /^[a-z0-9_]{1,40}$/;
const idLog = (v: string) => (ID_LOG.test(v) ? v : "?");
const claseLog = (v: string) => (CLASE_LOG.test(v) ? v : "?");
const numeroLog = (v: number) => (Number.isFinite(v) ? String(Math.round(v)) : "?");

/** El único armado de una línea de log de esta tarea. */
export function lineaDeLogEquipo(
  entrega: string | null,
  accion: AccionLogEquipo,
  d: { clase?: ClaseLogEquipo; envio?: number | string | null; intento?: number; ms?: number } = {},
): string {
  let l = `[messenger-webhooks equipo] ${entrega === null ? "-" : idLog(entrega)} ${claseLog(accion)}`;
  if (d.clase) l += ` ${claseLog(d.clase)}`;
  if (d.intento !== undefined) l += ` intento ${numeroLog(d.intento)}`;
  if (d.envio !== undefined && d.envio !== null) l += ` ${typeof d.envio === "number" ? numeroLog(d.envio) : claseLog(d.envio)}`;
  if (d.ms !== undefined) l += ` ${numeroLog(d.ms)}ms`;
  return l;
}

export interface EntornoEquipo {
  datos: DatosEquipo;
  /** Cuándo vence el presupuesto de la corrida (ms). */
  fin: number;
  enviar?: typeof enviarWebhook;
  ahora?: () => number;
  log?: (linea: string) => void;
}

export interface InformeEquipo {
  estado: number;
  cuerpo: { ok: boolean; motivo?: "reclamo"; resultados?: { id: string; accion: AccionLogEquipo }[] };
}

/** Una corrida. Nunca tira: todo termina en un informe (solo ids y acciones). */
export async function despacharEquipo(e: EntornoEquipo): Promise<InformeEquipo> {
  const ahora = e.ahora ?? Date.now;
  const log = e.log ?? ((l: string) => console.log(l));
  const enviar = e.enviar ?? enviarWebhook;
  const anotarLog = (id: string | null, accion: AccionLogEquipo, d?: Parameters<typeof lineaDeLogEquipo>[2]) => {
    log(lineaDeLogEquipo(id, accion, d));
    return accion;
  };

  let reclamadas: EntregaReclamada[] | null;
  try {
    reclamadas = await e.datos.reclamar(RECLAMO_MAX_EQUIPO, RECLAMO_S_EQUIPO);
  } catch {
    reclamadas = null;
  }
  if (reclamadas === null) {
    anotarLog(null, "reclamo");
    return { estado: 503, cuerpo: { ok: false, motivo: "reclamo" } };
  }

  const anotar = async (a: Anotacion): Promise<"ok" | "perdio" | null> => {
    try {
      return await e.datos.anotar(a);
    } catch {
      return null;
    }
  };

  const resultados = await enParalelo(reclamadas, EN_PARALELO_EQUIPO, async (r) => {
    const base = { id: r.id, reclamo: r.reclamo };
    if (!r.secreto) {
      // Sin el secreto no hay firma: se detiene (lo arregla volver a registrarla).
      const hecho = await anotar({
        ...base, accion: "detener", codigo: null, error: "config_error", incierto: false, reintentarEnS: null, latenciaMs: null,
        motivo: "config_error",
      });
      return { id: r.id, accion: hecho === null ? anotarLog(r.id, "error", { clase: "anotacion" }) : anotarLog(r.id, "detenido", { clase: "secreto" }) };
    }
    const restante = e.fin - ahora();
    if (restante < MINIMO_PARA_MANDAR_MS) {
      // El intento ya quedó anotado con su espera: sale en un turno siguiente.
      return { id: r.id, accion: anotarLog(r.id, "sin_tiempo", { intento: r.intento }) };
    }
    let encabezados: Record<string, string>;
    try {
      encabezados = await encabezadosFirmados(r.secreto, r.id, r.cuerpo, ahora());
    } catch {
      const hecho = await anotar({
        ...base, accion: "detener", codigo: null, error: "config_error", incierto: false, reintentarEnS: null, latenciaMs: null,
        motivo: "config_error",
      });
      return { id: r.id, accion: hecho === null ? anotarLog(r.id, "error", { clase: "anotacion" }) : anotarLog(r.id, "detenido", { clase: "secreto" }) };
    }
    const resultado = await enviar({
      href: r.url, cuerpo: r.cuerpo, encabezados, plazoMs: Math.min(PLAZO_ENVIO_MS, restante - 1_000),
    });
    const d = decidir(resultado);
    const latenciaMs = resultado.latenciaMs;
    let a: Anotacion;
    if (d.accion === "entregado") {
      a = { ...base, accion: "entregado", codigo: d.codigo, error: null, incierto: false, reintentarEnS: null, latenciaMs, motivo: null };
    } else if (d.accion === "detener") {
      a = { ...base, accion: "detener", codigo: d.codigo, error: d.error, incierto: false, reintentarEnS: null, latenciaMs, motivo: d.motivo };
    } else {
      a = { ...base, accion: "reintentar", codigo: d.codigo, error: d.error, incierto: d.incierto, reintentarEnS: d.retryAfterS, latenciaMs, motivo: null };
    }
    const hecho = await anotar(a);
    const envio = d.codigo ?? (d.error ?? null);
    if (hecho === null) return { id: r.id, accion: anotarLog(r.id, "error", { clase: "anotacion", envio }) };
    if (hecho === "perdio") return { id: r.id, accion: anotarLog(r.id, "perdio", { envio }) };
    const accion: AccionLogEquipo = a.accion === "entregado" ? "entregado" : a.accion === "detener" ? "detenido" : "reintentar";
    return {
      id: r.id,
      accion: anotarLog(r.id, accion, { intento: r.intento, envio, ms: latenciaMs, ...(a.motivo ? { clase: a.motivo } : {}) }),
    };
  });
  return { estado: 200, cuerpo: { ok: true, resultados } };
}

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(xs.length);
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < xs.length) {
      const i = siguiente++;
      salida[i] = await f(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, trabajar));
  return salida;
}
