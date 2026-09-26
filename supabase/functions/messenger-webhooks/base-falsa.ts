// Una base en memoria para probar el despachador: imita lo que importa de los
// triggers y CHECKs de las migraciones 20260926120000 y 20260926160000, y devuelve
// los instantes como PostgREST (microsegundos, fracción sin ceros al final, "+00:00")
// aunque se hayan escrito en otro formato. Las guardas comparan por VALOR: si el
// despachador pasara un instante por Date (y perdiera los microsegundos), las
// escrituras tocarían 0 filas, igual que en prod.
//
// Solo para tests (no lo importa nada que se despliegue).

import type { PaginaDelFeed, PedidoDelFeed } from "./feed.ts";
import type { DatosDespacho, Endpoint, Escrito, Fase, Guarda, LlaveDespacho, Timbre } from "./despachador.ts";

// ─── instantes como enteros de microsegundos ─────────────────────────────────

const INSTANTE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

export function aMicros(s: string, ahoraUs: number): number {
  if (s === "now") return ahoraUs;
  const m = s.match(INSTANTE);
  if (!m) throw new Error(`instante inválido: ${s}`);
  const zona = m[4] === "Z" ? "Z" : m[4].length === 3 ? `${m[4]}:00` : m[4].includes(":") ? m[4] : `${m[4].slice(0, 3)}:${m[4].slice(3)}`;
  const ms = Date.parse(`${m[1]}T${m[2]}${zona}`);
  return ms * 1000 + Number((m[3] ?? "").padEnd(6, "0"));
}

export function deMicros(us: number): string {
  const seg = Math.floor(us / 1_000_000);
  const frac = String(us - seg * 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return new Date(seg * 1000).toISOString().slice(0, 19) + (frac ? `.${frac}` : "") + "+00:00";
}

// ─── las filas ───────────────────────────────────────────────────────────────

export interface FilaEp {
  id: string; tenant_id: string; api_key_id: string; acts_as_user_id: string; url: string; exclude_own: boolean;
  status: "pending" | "active" | "paused" | "disabled"; disabled_reason: string | null; disabled_at: number | null;
  paused_at: number | null; paused_by: string | null;
  secret_cipher: string; secret_nonce: string; secret_key_version: number;
  cursor_at: number | null; cursor_id: string | null; lease_until: number | null; next_attempt_at: number;
  consecutive_failures: number; failing_since: number | null;
  last_attempt_at: number | null; last_success_at: number | null; last_status_code: number | null; last_error: string | null;
}

export interface FilaTimbre {
  id: string; endpoint_id: string; tenant_id: string; event_type: string; body: string; message_count: number | null;
  state: "pending" | "delivered" | "dropped"; drop_reason: string | null; attempts: number;
  last_attempt_at: number | null; last_status_code: number | null; last_error: string | null; latency_ms: number | null;
  uncertain: boolean; created_at: number; delivered_at: number | null;
}

const INSTANTES_EP = ["disabled_at", "paused_at", "cursor_at", "lease_until", "next_attempt_at", "failing_since", "last_attempt_at", "last_success_at"];
const INSTANTES_TIMBRE = ["last_attempt_at", "created_at", "delivered_at"];

type Metodo = keyof DatosDespacho;

export interface Opciones {
  agencias?: number | null;
  /** Qué métodos fallan: "error" = la base contesta error; "tira" = una excepción. */
  falla?: Partial<Record<Metodo, "error" | "tira">>;
  /** Algo que pasa JUSTO antes de un método (una pausa, un Resume, otra corrida). */
  antes?: Partial<Record<Metodo, (b: BaseFalsa) => void>>;
  /** Si el gate vería mensajes nuevos para ese endpoint (la parte de chat de con_trabajo). */
  hayMensajes?: (e: FilaEp) => boolean;
}

export type BaseFalsa = ReturnType<typeof crearBaseFalsa>;

export function crearBaseFalsa(inicioMs: number, o: Opciones = {}) {
  const reloj = { us: inicioMs * 1000 };
  const endpoints = new Map<string, FilaEp>();
  const timbres = new Map<string, FilaTimbre>();
  const llaves = new Map<string, LlaveDespacho>();
  const vigentes = new Map<string, boolean>();
  const llamadas: string[] = [];
  const cfg = { agencias: o.agencias === undefined ? 1 : o.agencias, falla: { ...(o.falla ?? {}) }, antes: { ...(o.antes ?? {}) }, hayMensajes: o.hayMensajes ?? (() => true) };

  const b = {
    reloj, endpoints, timbres, llaves, vigentes, llamadas, cfg,
    ahoraMs: () => Math.floor(reloj.us / 1000),
    pasar: (ms: number) => void (reloj.us += ms * 1000),
    datos: undefined as unknown as DatosDespacho,
    pendiente: (endpointId: string) => [...timbres.values()].find((t) => t.endpoint_id === endpointId && t.state === "pending" && t.event_type === "messages.created") ?? null,
  };

  const us = (v: unknown) => (typeof v === "string" ? aMicros(v, reloj.us) : (v as number | null));
  const fmt = (v: number | null) => (v === null ? null : deMicros(v));
  const aFila = (e: FilaEp): Endpoint => ({
    id: e.id, tenant_id: e.tenant_id, api_key_id: e.api_key_id, acts_as_user_id: e.acts_as_user_id, url: e.url,
    exclude_own: e.exclude_own, status: e.status, secret_cipher: e.secret_cipher, secret_nonce: e.secret_nonce,
    secret_key_version: e.secret_key_version, cursor_at: fmt(e.cursor_at)!, cursor_id: e.cursor_id!,
    lease_until: fmt(e.lease_until)!, consecutive_failures: e.consecutive_failures, failing_since: fmt(e.failing_since),
    last_error: e.last_error,
  });

  const entrada = (m: Metodo, fase?: Fase) => {
    llamadas.push(fase ? `${m}:${fase}` : m);
    cfg.antes[m]?.(b);
    const f = cfg.falla[m];
    if (f === "tira") throw new Error(`falla simulada en ${m}`);
    return f === "error";
  };

  const pasaLaGuarda = (e: FilaEp | undefined, g: Guarda) =>
    !!e && e.tenant_id === g.tenantId && e.lease_until !== null && e.lease_until === aMicros(g.reclamo, reloj.us) &&
    e.status === "active" && e.cursor_at !== null && e.cursor_at === aMicros(g.cursorAt, reloj.us) && e.cursor_id === g.cursorId;

  /** Lo que hace el trigger api_webhook_endpoints_cambio (lo que importa acá), y los CHECKs. */
  const aplicarEp = (e: FilaEp, cambios: Record<string, unknown>): boolean => {
    const nuevo: FilaEp = { ...e };
    for (const [k, v] of Object.entries(cambios)) {
      (nuevo as unknown as Record<string, unknown>)[k] = INSTANTES_EP.includes(k) ? us(v) : v;
    }
    if (e.status === "active" && nuevo.status === "active" && (nuevo.cursor_at !== e.cursor_at || nuevo.cursor_id !== e.cursor_id)) {
      const atras = nuevo.cursor_at! < e.cursor_at! || (nuevo.cursor_at === e.cursor_at && nuevo.cursor_id! < e.cursor_id!);
      if (atras || nuevo.cursor_at! > reloj.us + 5_000_000) return false; // P0001
    }
    if ((nuevo.status === "disabled") !== (nuevo.disabled_reason !== null) || (nuevo.status === "disabled") !== (nuevo.disabled_at !== null)) return false;
    if ((nuevo.status === "paused") !== (nuevo.paused_at !== null)) return false;
    if (nuevo.last_error !== null && nuevo.last_error.length > 60) return false;
    if (e.status === "active" && nuevo.status !== "active") {
      const t = b.pendiente(e.id);
      if (t) {
        t.state = "dropped";
        t.drop_reason = nuevo.status === "paused" ? "endpoint_paused"
          : ["receiver_gone", "receiver_failing"].includes(nuevo.disabled_reason ?? "") ? nuevo.disabled_reason : "endpoint_disabled";
      }
    }
    endpoints.set(e.id, nuevo);
    return true;
  };

  const datos: DatosDespacho = {
    agencias() {
      if (entrada("agencias")) return Promise.resolve(null);
      return Promise.resolve(cfg.agencias);
    },
    detenerPorAgencias() {
      if (entrada("detenerPorAgencias")) return Promise.resolve(false);
      for (const e of endpoints.values()) {
        if (e.status !== "disabled") aplicarEp(e, { status: "disabled", disabled_reason: "multi_agency", disabled_at: "now", paused_at: null, paused_by: null });
      }
      return Promise.resolve(true);
    },
    reclamar(max, segundos) {
      if (entrada("reclamar")) return Promise.resolve(null);
      if (cfg.agencias !== 1) return Promise.resolve([]);
      const listos = [...endpoints.values()]
        .filter((e) => e.status === "active" && (e.lease_until === null || e.lease_until <= reloj.us) && e.next_attempt_at <= reloj.us)
        .filter((e) => b.pendiente(e.id) !== null || cfg.hayMensajes(e))
        .sort((x, y) => x.next_attempt_at - y.next_attempt_at || (x.id < y.id ? -1 : 1))
        .slice(0, max);
      // El reclamo con microsegundos a propósito: un Date lo recortaría.
      for (const e of listos) e.lease_until = reloj.us + segundos * 1_000_000 + 123;
      return Promise.resolve(listos.map(aFila));
    },
    llave(id, tenantId) {
      if (entrada("llave")) return Promise.resolve({ ok: false });
      const k = llaves.get(id);
      return Promise.resolve({ ok: true, valor: k && k.tenant_id === tenantId ? k : null });
    },
    llaveVigente(id) {
      if (entrada("llaveVigente")) return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true, valor: vigentes.get(id) ?? true });
    },
    timbrePendiente(endpointId, tenantId) {
      if (entrada("timbrePendiente")) return Promise.resolve({ ok: false });
      const t = b.pendiente(endpointId);
      return Promise.resolve({ ok: true, valor: t && t.tenant_id === tenantId ? ({ id: t.id, body: t.body, attempts: t.attempts, uncertain: t.uncertain } as Timbre) : null });
    },
    timbrar(g, nuevo, timbre, limpiarError) {
      if (entrada("timbrar")) return Promise.resolve("error");
      const e = endpoints.get(g.id);
      if (!pasaLaGuarda(e, g)) return Promise.resolve("perdio");
      if (b.pendiente(g.id)) return Promise.resolve("ya_hay_uno");
      if (cfg.agencias !== 1) return Promise.resolve("error");
      if (!aplicarEp(e!, { cursor_at: nuevo.t, cursor_id: nuevo.i, ...(limpiarError ? { last_error: null } : {}) })) return Promise.resolve("error");
      timbres.set(timbre.id, {
        id: timbre.id, endpoint_id: g.id, tenant_id: g.tenantId, event_type: "messages.created", body: timbre.body,
        message_count: timbre.cantidad, state: "pending", drop_reason: null, attempts: 0, last_attempt_at: null,
        last_status_code: null, last_error: null, latency_ms: null, uncertain: false, created_at: reloj.us, delivered_at: null,
      });
      return Promise.resolve("ok");
    },
    actualizarEndpoint(g, cambios, fase): Promise<Escrito> {
      if (entrada("actualizarEndpoint", fase)) return Promise.resolve(null);
      const e = endpoints.get(g.id);
      if (!pasaLaGuarda(e, g)) return Promise.resolve(false);
      return Promise.resolve(aplicarEp(e!, cambios) ? true : null);
    },
    anotarTimbre(id, tenantId, cambios, fase): Promise<Escrito> {
      if (entrada("anotarTimbre", fase)) return Promise.resolve(null);
      const t = timbres.get(id);
      if (!t || t.tenant_id !== tenantId || t.state !== "pending") return Promise.resolve(false);
      const nuevo = { ...t } as FilaTimbre;
      for (const [k, v] of Object.entries(cambios)) {
        (nuevo as unknown as Record<string, unknown>)[k] = INSTANTES_TIMBRE.includes(k) ? us(v) : v;
      }
      // CHECKs de la migración.
      if ((nuevo.state === "dropped") !== (nuevo.drop_reason !== null)) return Promise.resolve(null);
      if ((nuevo.state === "delivered") !== (nuevo.delivered_at !== null)) return Promise.resolve(null);
      if (nuevo.state === "delivered" && !(nuevo.last_status_code !== null && nuevo.last_status_code >= 200 && nuevo.last_status_code < 300 && nuevo.attempts >= 1)) {
        return Promise.resolve(null);
      }
      if (nuevo.last_error !== null && nuevo.last_error.length > 60) return Promise.resolve(null);
      if (nuevo.body !== t.body || nuevo.message_count !== t.message_count) return Promise.resolve(null);
      timbres.set(id, nuevo);
      return Promise.resolve(true);
    },
    soltar(id, tenantId, reclamo) {
      entrada("soltar");
      const e = endpoints.get(id);
      if (e && e.tenant_id === tenantId && e.lease_until === aMicros(reclamo, reloj.us)) e.lease_until = null;
      return Promise.resolve();
    },
  };
  b.datos = datos;
  return b;
}

/** Un feed simulado: páginas en orden (o una función), anotando cada pedido. */
export function feedFalso(paginas: PaginaDelFeed[] | ((p: PedidoDelFeed, n: number) => PaginaDelFeed)) {
  const pedidos: PedidoDelFeed[] = [];
  const leer = (p: PedidoDelFeed): Promise<PaginaDelFeed> => {
    pedidos.push(p);
    const n = pedidos.length - 1;
    const pag = typeof paginas === "function" ? paginas(p, n) : paginas[Math.min(n, paginas.length - 1)];
    return Promise.resolve(pag);
  };
  return { leer, pedidos };
}
