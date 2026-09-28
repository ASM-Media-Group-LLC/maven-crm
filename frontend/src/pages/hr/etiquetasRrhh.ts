import type { TranslationKey } from "@/lib/i18n";

// LAS ETIQUETAS DE LOS CATÁLOGOS DE RRHH, EN EL IDIOMA DE LA INTERFAZ.
//
// Los catálogos (lib/hrConstants.ts y los de cada pantalla) guardan el `value`
// que va a la base —"enfermedad", "pending", "manana"…— y una `label` en español.
// El value es un DATO: se compara con la base, viaja en los filtros y en el
// SelectItem, y no se toca. Lo que se traduce es solo lo que se VE, y para eso
// está este mapa value → clave del diccionario (lib/i18n/hr.ts).
//
// Un value que no está en el mapa se muestra con la etiqueta de siempre (o el
// value crudo): un tipo nuevo en la base nunca deja una celda vacía.

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Claves = Readonly<Record<string, TranslationKey>>;

/** La etiqueta de `value` en el idioma de `t`; si no hay clave, `respaldo`. */
export function etiqueta(t: T, claves: Claves, value: string | null | undefined, respaldo?: string): string {
  const clave = value != null ? claves[value] : undefined;
  return clave ? t(clave) : (respaldo ?? value ?? "—");
}

export const TIPO_AUSENCIA: Claves = {
  enfermedad: "hr.opt.absType.enfermedad",
  accidente: "hr.opt.absType.accidente",
  personal: "hr.opt.absType.personal",
  duelo: "hr.opt.absType.duelo",
  maternidad: "hr.opt.absType.maternidad",
  paternidad: "hr.opt.absType.paternidad",
  calamidad: "hr.opt.absType.calamidad",
  injustificada: "hr.opt.absType.injustificada",
};

export const ESTADO_AUSENCIA: Claves = {
  pending: "hr.opt.absStatus.pending",
  approved: "hr.opt.absStatus.approved",
  rejected: "hr.opt.absStatus.rejected",
};

export const TIPO_PERMISO: Claves = {
  permiso_remoto: "hr.opt.permType.permiso_remoto",
  salida_temprana: "hr.opt.permType.salida_temprana",
  llegada_tarde: "hr.opt.permType.llegada_tarde",
  permiso_personal: "hr.opt.permType.permiso_personal",
  permiso_medico: "hr.opt.permType.permiso_medico",
  permiso_academico: "hr.opt.permType.permiso_academico",
  permiso_diligencia: "hr.opt.permType.permiso_diligencia",
  incapacidad: "hr.opt.permType.incapacidad",
};

export const ESTADO_PERMISO: Claves = {
  pending: "hr.opt.permStatus.pending",
  approved: "hr.opt.permStatus.approved",
  rejected: "hr.opt.permStatus.rejected",
};

export const TIPO_VACACION: Claves = {
  vacaciones: "hr.opt.vacType.vacaciones",
  dia_personal: "hr.opt.vacType.dia_personal",
};

/** Cualquier tipo que se guarda en `absences.absence_type` (faltas, permisos y
 *  vacaciones comparten la tabla). Lo usa el Dashboard para las pendientes. */
export const CUALQUIER_AUSENCIA: Claves = {
  ...TIPO_AUSENCIA,
  ...TIPO_PERMISO,
  vacaciones: "hr.opt.absType.vacaciones",
  dia_personal: "hr.opt.vacType.dia_personal",
  licencia: "hr.opt.absType.licencia",
  permiso: "hr.opt.absType.permiso",
  otro: "hr.opt.absType.otro",
};

export const SEVERIDAD: Claves = {
  low: "hr.opt.sev.low",
  medium: "hr.opt.sev.medium",
  high: "hr.opt.sev.high",
  critical: "hr.opt.sev.critical",
};

export const TIPO_INCIDENTE: Claves = {
  disciplinario: "hr.opt.incType.disciplinario",
  seguridad: "hr.opt.incType.seguridad",
  comportamiento: "hr.opt.incType.comportamiento",
  asistencia: "hr.opt.incType.asistencia",
  desempeno: "hr.opt.incType.desempeno",
  otro: "hr.opt.incType.otro",
};

export const ESTADO_INCIDENTE: Claves = {
  open: "hr.opt.incStatus.open",
  in_progress: "hr.opt.incStatus.in_progress",
  resolved: "hr.opt.incStatus.resolved",
  closed: "hr.opt.incStatus.closed",
};

export const TIPO_DEDUCCION: Claves = {
  adelanto: "hr.opt.dedType.adelanto",
  infraccion: "hr.opt.dedType.infraccion",
};

export const ESTADO_DEDUCCION: Claves = {
  pending: "hr.opt.dedStatus.pending",
  applied: "hr.opt.dedStatus.applied",
  rejected: "hr.opt.dedStatus.rejected",
};

export const CATEGORIA_INFRACCION: Claves = {
  redes_sociales: "hr.opt.infr.redes_sociales",
  violacion_politicas: "hr.opt.infr.violacion_politicas",
  productividad: "hr.opt.infr.productividad",
  ausencia_injustificada: "hr.opt.infr.ausencia_injustificada",
  otra: "hr.opt.infr.otra",
};

export const ESTADO_CAPACITACION: Claves = {
  assigned: "hr.opt.trStatus.assigned",
  in_progress: "hr.opt.trStatus.in_progress",
  completed: "hr.opt.trStatus.completed",
  failed: "hr.opt.trStatus.failed",
  cancelled: "hr.opt.trStatus.cancelled",
};

/** Solo los roles cuya etiqueta no es la misma palabra en inglés ("Chatter",
 *  "Closer", "Manager"… se ven igual). */
export const ROL_CAPACITACION: Claves = {
  content: "hr.opt.trRole.content",
  technology: "hr.opt.trRole.technology",
};

export const MODALIDAD_CAPACITACION: Claves = {
  presencial: "hr.opt.trModality.presencial",
  hibrido: "hr.opt.trModality.hibrido",
};

export const CONTENIDO_CAPACITACION: Claves = {
  documento: "hr.opt.trContent.documento",
  practica: "hr.opt.trContent.practica",
};

export const TIPO_CONTRATO: Claves = {
  indefinido: "hr.opt.contract.indefinido",
  fijo: "hr.opt.contract.fijo",
  obra: "hr.opt.contract.obra",
  prestacion_servicios: "hr.opt.contract.prestacion_servicios",
  aprendizaje: "hr.opt.contract.aprendizaje",
  temporal: "hr.opt.contract.temporal",
};

export const MODALIDAD_TRABAJO: Claves = {
  presencial: "hr.opt.work.presencial",
  remoto: "hr.opt.work.remoto",
  hibrido: "hr.opt.work.hibrido",
};

export const TIPO_DOCUMENTO: Claves = {
  CC: "hr.opt.idType.CC",
  CE: "hr.opt.idType.CE",
  PA: "hr.opt.idType.PA",
  TI: "hr.opt.idType.TI",
};

export const GENERO: Claves = {
  masculino: "hr.opt.gender.masculino",
  femenino: "hr.opt.gender.femenino",
  no_binario: "hr.opt.gender.no_binario",
  prefiero_no_decir: "hr.opt.gender.prefiero_no_decir",
};

export const FRECUENCIA_PAGO: Claves = {
  mensual: "hr.opt.freq.mensual",
  quincenal: "hr.opt.freq.quincenal",
  semanal: "hr.opt.freq.semanal",
  hora: "hr.opt.freq.hora",
};

export const TIPO_CUENTA: Claves = {
  ahorros: "hr.opt.bank.ahorros",
  corriente: "hr.opt.bank.corriente",
};

/** EPS y ARL: todo es nombre propio salvo "Otra". */
export const SEGURIDAD_SOCIAL: Claves = {
  otro: "hr.opt.otherF",
};

export const ESTADO_EMPLEADO: Claves = {
  activo: "hr.opt.empStatus.activo",
  inactivo: "hr.opt.empStatus.inactivo",
  en_licencia: "hr.opt.empStatus.en_licencia",
  suspendido: "hr.opt.empStatus.suspendido",
  vacaciones: "hr.opt.empStatus.vacaciones",
};

/** El turno lo arma la vista v_qa_attendance como TEXTO en español. Se reconoce
 *  el texto exacto; uno que no esté acá (un cambio en la vista) se ve tal cual. */
export const TURNO_ASISTENCIA: Claves = {
  "Según horario propio": "hr.opt.shift.own",
  "Madrugada · 12am–8am": "hr.opt.shift.night",
  "Mañana · 8am–4pm": "hr.opt.shift.morning",
  "Tarde · 4pm–12am": "hr.opt.shift.afternoon",
};

/** "2026-09" → "Septiembre 2026" / "September 2026". En español es exactamente
 *  lo que ya mostraba `periodLabel` (que se pasa como `enEspanol`). */
export function periodoDelMes(periodo: string, idioma: "es" | "en", enEspanol: (p: string) => string): string {
  if (idioma !== "en") return enEspanol(periodo);
  const [y, m] = periodo.split("-").map(Number);
  if (!y || !m) return periodo;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Los días de la semana de lunes a domingo, cortos. */
export const DIAS_CORTOS: readonly TranslationKey[] = [
  "hr.wd.mon", "hr.wd.tue", "hr.wd.wed", "hr.wd.thu", "hr.wd.fri", "hr.wd.sat", "hr.wd.sun",
];
