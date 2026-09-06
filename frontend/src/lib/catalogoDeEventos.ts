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
// Un evento sin un canal es porque ese canal no existe para él (los mensajes de
// la bandeja de WhatsApp no entran a la campana; el correo nuevo solo se avisa
// al celular). Ahí la celda queda vacía, no "Pronto".
export type CanalDeAviso = "in_app" | "push";

export interface EventoDeAviso {
  type: string;
  label: string;
  descripcion?: string;
  canales: readonly CanalDeAviso[];
}

export interface ModuloDeAvisos {
  /** Nombre que se muestra y que se guarda en `module`. */
  modulo: string;
  /** Módulo del sistema de permisos que hace falta para ver la tarjeta; null = todos. */
  permiso: string | null;
  eventos: readonly EventoDeAviso[];
}

export const CATALOGO_DE_EVENTOS: readonly ModuloDeAvisos[] = [
  {
    modulo: "Messenger",
    permiso: null,
    eventos: [
      {
        type: "chat_message",
        label: "Mensajes nuevos",
        descripcion: "Directos, menciones y grupos. Respeta los chats silenciados y el modo de cada chat.",
        canales: ["in_app", "push"],
      },
    ],
  },
  {
    modulo: "Correo",
    permiso: "Correo",
    eventos: [
      {
        type: "correo_nuevo",
        label: "Correo nuevo en la bandeja de entrada",
        canales: ["push"],
      },
    ],
  },
  {
    modulo: "Cowork",
    permiso: "Cowork",
    eventos: [
      {
        type: "cowork_llamado",
        label: "Llamado de atención en mi sala",
        descripcion: "Solo si soy host: cámara apagada, mal encuadre, sin luz o sin compartir pantalla.",
        canales: ["push"],
      },
      {
        type: "cowork_pedido_host",
        label: "Alguien pide supervisor",
        descripcion: "Solo si soy host de una sesión activa.",
        canales: ["in_app"],
      },
    ],
  },
  {
    modulo: "Bandeja",
    permiso: "Bandeja",
    eventos: [
      {
        type: "inbox_asignacion",
        label: "Me asignaron una conversación",
        descripcion: "WhatsApp y Telegram. Solo cuando la asigna otra persona.",
        canales: ["push"],
      },
      {
        type: "inbox_mensaje",
        label: "Mensaje nuevo de un contacto",
        descripcion: "WhatsApp y Telegram, en las conversaciones que veo.",
        canales: ["in_app"],
      },
    ],
  },
  {
    modulo: "Closers",
    permiso: "Closers",
    eventos: [
      { type: "closer_assigned", label: "Lead asignada", canales: ["in_app", "push"] },
      { type: "closer_contact_overdue", label: "Contacto vencido", canales: ["in_app", "push"] },
      {
        type: "closer_contact_decision",
        label: "Decisión pendiente",
        descripcion: "Después de 6 contactos hechos.",
        canales: ["in_app", "push"],
      },
    ],
  },
  {
    modulo: "Evaluador",
    permiso: "Evaluator",
    eventos: [
      { type: "chatter_evaluation", label: "Evaluación de chatter lista", canales: ["in_app", "push"] },
    ],
  },
  {
    modulo: "Creadoras",
    permiso: "Creadores",
    eventos: [
      { type: "onboarding_inactivity", label: "Inactividad en onboarding", canales: ["in_app", "push"] },
      { type: "onboarding_complete", label: "Onboarding completado", canales: ["in_app", "push"] },
      { type: "verification_approved", label: "Verificación aprobada", canales: ["in_app", "push"] },
      { type: "verification_rejected", label: "Verificación rechazada", canales: ["in_app", "push"] },
    ],
  },
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
