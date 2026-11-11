import type { TranslationKey } from "@/lib/i18n";

// LOS AVISOS DEL EQUIPO (webhook) — el adaptador entre la pantalla y el sistema de
// webhooks que ya existe (Ajustes → API keys, manage-api-keys: webhook_create,
// webhook_test, webhook_pause, webhook_delete, webhook_deliveries).
//
// SUPUESTO (11/11/2026, el backend se construye en paralelo): los avisos del equipo
// viajan por ESE MISMO sistema. Un webhook por llave, y lo que recibe lo decide el
// permiso de la llave:
//   · messenger:read → messages.created (lo de siempre);
//   · equipo:write   → equipo.persona_entro, equipo.persona_salio, equipo.rol_cambio.
// Si el backend lo resuelve con otro permiso, se cambia SCOPES_CON_WEBHOOK y nada más:
// la tabla de API keys, el diálogo del webhook y Conectar tu plataforma leen de aquí.

export const SCOPE_MESSENGER = "messenger:read";
export const SCOPE_EQUIPO = "equipo:write";

/** Los permisos que dejan registrar un webhook en una llave. */
export const SCOPES_CON_WEBHOOK: readonly string[] = [SCOPE_MESSENGER, SCOPE_EQUIPO];

export const EVENTOS_EQUIPO = ["equipo.persona_entro", "equipo.persona_salio", "equipo.rol_cambio"] as const;
export type EventoEquipo = (typeof EVENTOS_EQUIPO)[number];

/** Qué dice cada aviso, en la pantalla y en las instrucciones que se copian. */
export const TEXTO_EVENTO: Record<EventoEquipo, TranslationKey> = {
  "equipo.persona_entro": "conexionEquipo.evento.persona_entro",
  "equipo.persona_salio": "conexionEquipo.evento.persona_salio",
  "equipo.rol_cambio": "conexionEquipo.evento.rol_cambio",
};

/** ¿Esta llave puede tener webhook? */
export function admiteWebhook(scopes: readonly string[]): boolean {
  return scopes.some((s) => SCOPES_CON_WEBHOOK.includes(s));
}

/** ¿Su webhook avisa los mensajes del Messenger? (La casilla «no avisar lo que yo
 *  mando» solo tiene sentido ahí.) */
export function avisaMensajes(scopes: readonly string[]): boolean {
  return scopes.includes(SCOPE_MESSENGER);
}

/** ¿Su webhook avisa los cambios del equipo? */
export function avisaEquipo(scopes: readonly string[]): boolean {
  return scopes.includes(SCOPE_EQUIPO);
}

/** Los eventos que recibe el webhook de una llave con estos permisos. */
export function eventosDeLaLlave(scopes: readonly string[]): string[] {
  return [
    ...(avisaMensajes(scopes) ? ["messages.created"] : []),
    ...(avisaEquipo(scopes) ? [...EVENTOS_EQUIPO] : []),
  ];
}

type LlaveMinima = {
  id: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  created_at: string;
  webhook?: unknown;
};

/** La llave de la plataforma de equipo: la activa con equipo:write. Si hay más de
 *  una, la que ya tiene webhook; si no, la más nueva. Sin activa, la última que hubo
 *  (vencida o revocada), para poder decir «ya no sirve». */
export function llaveDelEquipo<K extends LlaveMinima>(llaves: readonly K[]): { llave: K | null; activa: boolean } {
  const delEquipo = llaves.filter((k) => avisaEquipo(k.scopes));
  const masNueva = (a: K, b: K) => Date.parse(b.created_at) - Date.parse(a.created_at);
  const activas = delEquipo.filter((k) => k.status === "active").sort(masNueva);
  if (activas.length) {
    return { llave: activas.find((k) => !!k.webhook) ?? activas[0], activa: true };
  }
  const otras = [...delEquipo].sort(masNueva);
  return { llave: otras[0] ?? null, activa: false };
}
