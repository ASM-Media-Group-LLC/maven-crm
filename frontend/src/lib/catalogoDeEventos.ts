// Catálogo de los eventos que Maven avisa DE VERDAD, agrupados por módulo, con
// los canales que aplican a cada uno. Es la fuente de la pestaña Eventos de
// Ajustes → Notificaciones y del filtro de la campana.
//
// `type` es la clave que se guarda en notification_preferences.notification_type
// y la que leen el servidor (notif_canal_activo) y los hooks del cliente. Los
// tipos son únicos en todo el catálogo: el servidor decide por tipo, sin mirar
// el módulo.
//
// Canales:
//   in_app → la campana (/notificaciones) y el aviso dentro de Maven (sonido,
//            tarjeta del navegador en escritorio).
//   push   → el celular con Maven cerrada (requiere activar el push en Canales).
//   email  → el correo de la cuenta. OPT-IN: viene apagado en todos los eventos
//            (Jhon, 06/09/2026). Solo lo que genera el servidor (los avisos que
//            pasan por push_notify_enqueue): no aplica a cada mensaje del chat,
//            al "correo nuevo" ni a lo que solo detecta el cliente.
// Un evento sin un canal es porque ese canal no existe para él (los mensajes de
// la bandeja de WhatsApp no entran a la campana; el correo nuevo solo se avisa
// al celular). Ahí la celda queda vacía, no "Pronto".
import { traducir, type TranslationKey } from "@/lib/i18n";
import { conEtiqueta } from "@/lib/etiquetaTraducida";

export type CanalDeAviso = "in_app" | "push" | "email";

/** Canales que vienen encendidos sin fila (el correo es opt-in). */
export const CANAL_ENCENDIDO_POR_DEFECTO: Record<CanalDeAviso, boolean> = { in_app: true, push: true, email: false };

export interface EventoDeAviso {
  type: string;
  /** Clave del nombre del evento: la pantalla hace t(e.labelKey). */
  labelKey: TranslationKey;
  /** El nombre, traducido al leerlo (ver lib/etiquetaTraducida.ts). */
  readonly label: string;
  descripcionKey?: TranslationKey;
  /** La descripción, traducida al leerla; undefined si el evento no tiene. */
  readonly descripcion?: string;
  canales: readonly CanalDeAviso[];
}

export interface ModuloDeAvisos {
  /** Nombre del módulo que se GUARDA en notification_preferences.module. Es dato:
   *  no se traduce. Para mostrarlo, `labelKey` / `label`. */
  modulo: string;
  /** Clave del nombre que se MUESTRA. */
  labelKey: TranslationKey;
  /** El nombre que se muestra, traducido al leerlo. */
  readonly label: string;
  /** Módulo del sistema de permisos que hace falta para ver la tarjeta; null = todos. */
  permiso: string | null;
  eventos: readonly EventoDeAviso[];
}

function evento(
  type: string,
  labelKey: TranslationKey,
  canales: readonly CanalDeAviso[],
  descripcionKey?: TranslationKey,
): EventoDeAviso {
  const e = conEtiqueta({ type, canales }, labelKey);
  if (!descripcionKey) return e;
  return Object.defineProperties(e, {
    descripcionKey: { value: descripcionKey, enumerable: true },
    descripcion: { get: () => traducir(descripcionKey), enumerable: true },
  });
}

function modulo(
  nombreGuardado: string,
  labelKey: TranslationKey,
  permiso: string | null,
  eventos: readonly EventoDeAviso[],
): ModuloDeAvisos {
  return conEtiqueta({ modulo: nombreGuardado, permiso, eventos }, labelKey);
}

export const CATALOGO_DE_EVENTOS: readonly ModuloDeAvisos[] = [
  modulo("Messenger", "int.events.module.messenger", null, [
    evento("chat_message", "int.events.chatMessage", ["in_app", "push"], "int.events.chatMessageDesc"),
    evento("chat_mention", "int.events.chatMention", ["in_app"], "int.events.chatMentionDesc"),
  ]),
  modulo("Correo", "int.events.module.correo", "Correo", [
    evento("correo_nuevo", "int.events.correoNuevo", ["push"]),
    // Distinto de "correo nuevo" a propósito: que te nombren pidiendo algo
    // no es lo mismo que recibir uno más, y se apaga por separado.
    evento("correo_mencion", "int.events.correoMencion", ["in_app", "push"]),
  ]),
  // Todos solo si soy host de la sesión. Los cuatro llamados son los kinds
  // que registra la edge cowork-session (camara, encuadre, luz, pantalla) y
  // el trigger push_cowork_llamado los manda como 'cowork_llamado_<kind>'.
  modulo("Cowork", "int.events.module.cowork", "Cowork", [
    evento("cowork_pedido_host", "int.events.coworkPedidoHost", ["in_app", "push", "email"], "int.events.coworkPedidoHostDesc"),
    evento("cowork_llamado_camara", "int.events.coworkCamara", ["push", "email"]),
    evento("cowork_llamado_encuadre", "int.events.coworkEncuadre", ["push", "email"]),
    evento("cowork_llamado_luz", "int.events.coworkLuz", ["push", "email"]),
    evento("cowork_llamado_pantalla", "int.events.coworkPantalla", ["push", "email"]),
  ]),
  modulo("Bandeja", "int.events.module.bandeja", "Bandeja", [
    evento("inbox_asignacion", "int.events.inboxAsignacion", ["push", "email"], "int.events.inboxAsignacionDesc"),
    evento("inbox_mensaje", "int.events.inboxMensaje", ["in_app"], "int.events.inboxMensajeDesc"),
  ]),
  modulo("Closers", "int.events.module.closers", "Closers", [
    evento("closer_assigned", "int.events.closerAssigned", ["in_app", "push", "email"]),
    evento("closer_contact_overdue", "int.events.closerOverdue", ["in_app", "push", "email"]),
    evento("closer_contact_decision", "int.events.closerDecision", ["in_app", "push", "email"], "int.events.closerDecisionDesc"),
  ]),
  modulo("Evaluador", "int.events.module.evaluador", "Evaluator", [
    evento("chatter_evaluation", "int.events.chatterEvaluation", ["in_app", "push", "email"]),
  ]),
  modulo("Creadoras", "int.events.module.creadoras", "Creadores", [
    evento("onboarding_inactivity", "int.events.onboardingInactivity", ["in_app", "push", "email"]),
    evento("onboarding_complete", "int.events.onboardingComplete", ["in_app", "push", "email"]),
    evento("verification_approved", "int.events.verificationApproved", ["in_app", "push", "email"]),
    evento("verification_rejected", "int.events.verificationRejected", ["in_app", "push", "email"]),
  ]),
];

const POR_TIPO: ReadonlyMap<string, { modulo: string; evento: EventoDeAviso }> = new Map(
  CATALOGO_DE_EVENTOS.flatMap((m) => m.eventos.map((e) => [e.type, { modulo: m.modulo, evento: e }] as const)),
);

/** Módulo del catálogo al que pertenece un tipo (null si no está catalogado). */
export function moduloDelTipo(type: string): string | null {
  return POR_TIPO.get(type)?.modulo ?? null;
}

export function eventoDelTipo(type: string): EventoDeAviso | null {
  return POR_TIPO.get(type)?.evento ?? null;
}
