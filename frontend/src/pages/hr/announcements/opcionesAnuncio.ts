import type { Language, TranslationKey } from "@/lib/i18n";
import type { AudienceTarget } from "./useAnnouncementsAdmin";

// Las opciones de los modales de anuncios. `value` es lo que se guarda en
// internal_announcements (y se compara contra la base): no se traduce. `clave`
// es cómo se ve.
type Opcion = { value: string; clave: TranslationKey };

export const TIPOS_ANUNCIO: readonly Opcion[] = [
  { value: "general", clave: "hrg.ann.type.general" },
  { value: "policy", clave: "hrg.ann.type.policy" },
  { value: "celebration", clave: "hrg.ann.type.celebration" },
  { value: "holiday", clave: "hrg.ann.type.holiday" },
  { value: "urgent", clave: "hrg.ann.type.urgent" },
  { value: "reminder", clave: "hrg.ann.type.reminder" },
  { value: "update", clave: "hrg.ann.type.update" },
];

export const PRIORIDADES_ANUNCIO: readonly Opcion[] = [
  { value: "low", clave: "hrg.ann.priority.low" },
  { value: "normal", clave: "hrg.ann.priority.normal" },
  { value: "high", clave: "hrg.ann.priority.high" },
];

export const REPETICIONES_ANUNCIO: readonly Opcion[] = [
  { value: "none", clave: "hrg.ann.recurrence.none" },
  { value: "weekly", clave: "hrg.ann.recurrence.weekly" },
  { value: "monthly", clave: "hrg.ann.recurrence.monthly" },
];

/** Módulo relacionado. El "ninguno" se guarda como null; cada modal decide con
 *  qué valor lo representa en el Select. */
export const MODULOS_ANUNCIO: readonly Opcion[] = [
  { value: "hr", clave: "hrg.ann.module.hr" },
  { value: "finance", clave: "hrg.ann.module.finance" },
  { value: "operations", clave: "hrg.ann.module.operations" },
  { value: "projects", clave: "hrg.ann.module.projects" },
  { value: "sales", clave: "hrg.ann.module.sales" },
];

export const PASOS_ANUNCIO: readonly TranslationKey[] = [
  "hrg.ann.step.content",
  "hrg.ann.step.schedule",
  "hrg.ann.step.audience",
];

const ESTADOS: Record<string, TranslationKey> = {
  draft: "hrg.ann.status.draft",
  scheduled: "hrg.ann.status.scheduled",
  active: "hrg.ann.status.active",
  expired: "hrg.ann.status.expired",
  archived: "hrg.ann.status.archived",
};

const CANALES: Record<string, TranslationKey> = {
  feed: "hrg.ann.channel.feed",
  notification: "hrg.ann.channel.notification",
  banner: "hrg.ann.channel.banner",
  popup: "hrg.ann.channel.popup",
};

export const CANALES_ANUNCIO = Object.keys(CANALES);

/** Roles que se pueden elegir como destinatarios. `guardado` es la etiqueta
 *  que se GUARDA en announcement_audience.target_label: la leen otras personas
 *  en el listado de anuncios, así que se guarda en español, como siempre. */
export const ROLES_DESTINO = [
  { value: "admin", guardado: "Admin" },
  { value: "manager", guardado: "Manager" },
  { value: "employee", guardado: "Empleado" },
  { value: "agent", guardado: "Agente" },
  { value: "closer", guardado: "Closer" },
  { value: "supervisor", guardado: "Supervisor" },
] as const;

/** El target_label que se guarda para "toda la empresa". Es DATO (se guarda en
 *  la base y lo lee cualquiera en el listado), no pantalla: no se traduce. Lo
 *  que se DIBUJA sale de `etiquetaDestino`. */
export const TODA_LA_EMPRESA_GUARDADO = "Toda la empresa";

type T = (clave: TranslationKey) => string;

export const estadoAnuncio = (t: T, estado: string) => (ESTADOS[estado] ? t(ESTADOS[estado]) : estado);
export const canalAnuncio = (t: T, canal: string) => (CANALES[canal] ? t(CANALES[canal]) : canal);
/** La prioridad, o nada si el valor guardado no es uno de los tres (así estaba el detalle). */
export const prioridadAnuncio = (t: T, prioridad: string) => {
  const o = PRIORIDADES_ANUNCIO.find((p) => p.value === prioridad);
  return o ? t(o.clave) : undefined;
};

const TIPOS_DESTINO: Record<string, TranslationKey> = {
  all: "hrg.ann.target.all",
  department: "hrg.ann.target.department",
  role: "hrg.ann.target.role",
  user: "hrg.ann.target.user",
  project: "hrg.ann.target.project",
};

/** El tipo de destinatario (target_type). En español se ve el valor guardado
 *  ("all", "role"…), como siempre se vio; en inglés, su nombre. */
export const tipoDestino = (t: T, idioma: Language, tipo: string) =>
  idioma === "en" && TIPOS_DESTINO[tipo] ? t(TIPOS_DESTINO[tipo]) : tipo;

const ROL_VISIBLE: Record<string, TranslationKey> = {
  employee: "hrg.opt.hrRole.employee",
  agent: "hrg.opt.hrRole.agent",
};

/** Cómo se DIBUJA un destinatario. El target_label guardado está en español
 *  (ver arriba) y en español se ve tal cual, como siempre. En inglés, "toda la
 *  empresa" y los roles se vuelven a armar; departamentos y personas son nombres
 *  propios y se ven tal cual. */
export function etiquetaDestino(t: T, idioma: Language, a: Pick<AudienceTarget, "target_type" | "target_id" | "target_label">): string {
  if (idioma !== "en") return a.target_label;
  if (a.target_type === "all") return t("common.entireCompany");
  if (a.target_type === "role" && a.target_id && ROL_VISIBLE[a.target_id]) return t(ROL_VISIBLE[a.target_id]);
  return a.target_label;
}

/** Nombre de un rol en la lista de destinatarios. */
export const rolDestino = (t: T, value: string, guardado: string) => (ROL_VISIBLE[value] ? t(ROL_VISIBLE[value]) : guardado);
