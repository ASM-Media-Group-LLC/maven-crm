import type { TranslationKey } from "@/lib/i18n";

// LOS AVISOS DEL EQUIPO (webhook), del lado de la pantalla.
//
// Son un sistema APARTE de los webhooks del Messenger (Ajustes → API keys): la base
// los guarda en integracion_equipo_webhooks y la app los maneja con estas RPC, como
// la persona que mira (dueño o admin de la agencia; la base lo exige en cada una):
//   equipo_webhooks()                                → la lista de la agencia
//   equipo_webhook_crear(_api_key_id, _url, _eventos) → lo mismo + `secreto` (UNA vez)
//   equipo_webhook_cambiar(_id, pausar|reanudar|borrar)
//   equipo_webhook_probar(_id)                       → { entrega_id } (una cada 12 s)
//   equipo_webhook_entregas(_id, _limite)            → las últimas (hasta 100)
// Ver supabase/migrations/20261111190000_agencias_conectadas.sql (6.4) y
// docs/conectar-plataforma.md (§6). Los errores (el código va al principio del
// mensaje, «sin_permiso: …») se dicen en palabras en ./errores.ts.
//
// Nunca llega la URL entera (puede llevar un token) ni el secreto, salvo al crear.

export const SCOPE_EQUIPO = "equipo:write";

export const EVENTOS_EQUIPO = ["equipo.persona_entro", "equipo.persona_salio", "equipo.rol_cambio"] as const;
export type EventoEquipo = (typeof EVENTOS_EQUIPO)[number];
/** El de «Enviar prueba»: solo aparece en las entregas. */
export const EVENTO_PRUEBA = "webhook.test";

/** Qué dice cada aviso, en la pantalla y en las instrucciones que se copian. */
export const TEXTO_EVENTO: Record<EventoEquipo | typeof EVENTO_PRUEBA, TranslationKey> = {
  "equipo.persona_entro": "conexionEquipo.evento.persona_entro",
  "equipo.persona_salio": "conexionEquipo.evento.persona_salio",
  "equipo.rol_cambio": "conexionEquipo.evento.rol_cambio",
  "webhook.test": "conexionEquipo.evento.prueba",
};

/** Una prueba cada 12 s por webhook (la base lo vuelve a exigir: prueba_muy_seguida). */
export const PRUEBA_CADA_MS = 12_000;

export type EstadoWebhookEquipo = "active" | "paused" | "disabled";
export type WebhookEquipo = {
  id: string;
  api_key_id: string;
  url_host: string;
  eventos: string[];
  status: EstadoWebhookEquipo;
  disabled_reason: string | null;
  disabled_at: string | null;
  secret_last4: string;
  consecutive_failures: number;
  failing_since: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  /** Avisos que todavía no salieron. */
  pendientes: number;
};
export type WebhookCreado = WebhookEquipo & { secreto: string };
export type EntregaEquipo = {
  id: string;
  evento: string;
  state: "pending" | "delivered" | "dropped";
  drop_reason: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  latency_ms: number | null;
  uncertain: boolean;
  created_at: string;
  delivered_at: string | null;
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// ── La URL ──────────────────────────────────────────────────────────────────

/** La URL como la pide la base: `new URL(x).href`, solo https. null si no sirve. */
export function normalizarUrl(x: string): string | null {
  try {
    const u = new URL(x.trim());
    return u.protocol === "https:" && !!u.hostname ? u.href : null;
  } catch {
    return null;
  }
}

/** Los eventos para crear: null = los tres (lo que la base toma por defecto). */
export function eventosParaCrear(elegidos: readonly string[]): string[] | null {
  const validos = EVENTOS_EQUIPO.filter((e) => elegidos.includes(e));
  return validos.length === EVENTOS_EQUIPO.length ? null : validos;
}

// ── Cómo está ───────────────────────────────────────────────────────────────

const MOTIVOS_DETENIDO: Record<string, TranslationKey> = {
  receiver_gone: "conexionEquipo.wh.detenido.receiver_gone",
  receiver_failing: "conexionEquipo.wh.detenido.receiver_failing",
  key_revoked: "conexionEquipo.wh.detenido.key_revoked",
  key_expired: "conexionEquipo.wh.detenido.key_expired",
  scope_removed: "conexionEquipo.wh.detenido.scope_removed",
  person_inactive: "conexionEquipo.wh.detenido.person_inactive",
  config_error: "conexionEquipo.wh.detenido.config_error",
};
/** Motivos que «Reanudar» no arregla: la llave ya no sirve (hay que crear otra). */
const SIN_VUELTA = new Set(["key_revoked", "key_expired", "scope_removed"]);

export function textoDelDetenido(motivo: string | null, t: T): string {
  return motivo && MOTIVOS_DETENIDO[motivo] ? t(MOTIVOS_DETENIDO[motivo]) : t("conexionEquipo.wh.detenido.otro");
}

export type Semaforo = { texto: TranslationKey; tono: "bien" | "ojo" | "mal" | "apagado" };

export function semaforoDe(w: WebhookEquipo): Semaforo {
  if (w.status === "paused") return { texto: "conexionEquipo.wh.estado.pausado", tono: "apagado" };
  if (w.status === "disabled") return { texto: "conexionEquipo.wh.estado.detenido", tono: "mal" };
  if (w.consecutive_failures > 0) return { texto: "conexionEquipo.wh.estado.fallando", tono: "ojo" };
  return { texto: "conexionEquipo.wh.estado.activo", tono: "bien" };
}

/** Qué se puede hacer con él ahora. */
export function accionesDe(w: WebhookEquipo) {
  return {
    probar: w.status === "active",
    pausar: w.status === "active",
    reanudar: w.status === "paused" || (w.status === "disabled" && !SIN_VUELTA.has(w.disabled_reason ?? "")),
    borrar: true,
  };
}

const DESCARTES: Record<string, TranslationKey> = {
  receiver_gone: "conexionEquipo.wh.descarte.receiver_gone",
  receiver_failing: "conexionEquipo.wh.descarte.receiver_failing",
  endpoint_paused: "conexionEquipo.wh.descarte.endpoint_paused",
  endpoint_disabled: "conexionEquipo.wh.descarte.endpoint_disabled",
  test_failed: "conexionEquipo.wh.descarte.test_failed",
};

/** Una entrega en palabras: entregada (con el código), esperando o descartada (y por qué). */
export function textoDeLaEntrega(e: EntregaEquipo, t: T): { texto: string; tono: Semaforo["tono"] } {
  if (e.state === "delivered") {
    return { texto: t("conexionEquipo.wh.entrega.entregada", { codigo: e.last_status_code ?? "2xx" }), tono: "bien" };
  }
  if (e.state === "dropped") {
    return { texto: e.drop_reason && DESCARTES[e.drop_reason] ? t(DESCARTES[e.drop_reason]) : t("conexionEquipo.wh.entrega.descartada"), tono: "mal" };
  }
  return e.attempts > 0
    ? { texto: t("conexionEquipo.wh.entrega.reintentando", { n: e.attempts }), tono: "ojo" }
    : { texto: t("conexionEquipo.wh.entrega.esperando"), tono: "apagado" };
}

// ── La llave ────────────────────────────────────────────────────────────────

type LlaveMinima = {
  id: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  created_at: string;
};

/** La llave de la plataforma de equipo: la activa con equipo:write. Si hay más de
 *  una, la que ya tiene webhook del equipo; si no, la más nueva. Sin activa, la última
 *  que hubo (vencida o revocada), para poder decir «ya no sirve». */
export function llaveDelEquipo<K extends LlaveMinima>(
  llaves: readonly K[], conWebhook: ReadonlySet<string> = new Set(),
): { llave: K | null; activa: boolean } {
  const delEquipo = llaves.filter((k) => k.scopes.includes(SCOPE_EQUIPO));
  const masNueva = (a: K, b: K) => Date.parse(b.created_at) - Date.parse(a.created_at);
  const activas = delEquipo.filter((k) => k.status === "active").sort(masNueva);
  if (activas.length) return { llave: activas.find((k) => conWebhook.has(k.id)) ?? activas[0], activa: true };
  const otras = [...delEquipo].sort(masNueva);
  return { llave: otras[0] ?? null, activa: false };
}
