// ============================================================
// HR MODULE v2.0 — Centralized Constants
// ============================================================
//
// `value` es lo que se guarda en la base (employees.contract_type,
// hr_absences.absence_type…) y NO se traduce. La etiqueta sale del diccionario
// (lib/i18n/internos.ts): la pantalla puede hacer t(o.labelKey), y `o.label` se
// traduce al leerlo, así que las pantallas que ya dibujaban `o.label` siguen
// igual y salen en inglés. Ver lib/etiquetaTraducida.ts.
import { conEtiqueta, etiquetasPorClave, opciones } from "@/lib/etiquetaTraducida";

// Nombres propios (EPS, ARL y fondos de pensiones de Colombia): son marcas y se
// escriben igual en los dos idiomas, así que no pasan por el diccionario.
const marca = (value: string, nombre: string) => ({ value, label: nombre });

export const CONTRACT_TYPES = opciones([
  ["indefinido", "int.hr.contract.indefinido"],
  ["fijo", "int.hr.contract.fijo"],
  ["obra", "int.hr.contract.obra"],
  ["prestacion_servicios", "int.hr.contract.prestacion"],
  ["aprendizaje", "int.hr.contract.aprendizaje"],
  ["temporal", "int.hr.contract.temporal"],
]);

export const WORK_MODALITIES = opciones([
  ["presencial", "int.hr.onSite"],
  ["remoto", "int.hr.remote"],
  ["hibrido", "int.hr.hybrid"],
]);

export const EMPLOYEE_STATUS_OPTIONS = opciones([
  ["activo", "common.active"],
  ["inactivo", "common.inactive"],
  ["en_licencia", "int.hr.status.onLeave"],
  ["suspendido", "int.hr.status.suspended"],
  ["vacaciones", "int.hr.status.vacation"],
]);

export const ABSENCE_TYPES = opciones([
  ["enfermedad", "int.hr.absence.enfermedad"],
  ["accidente", "int.hr.absence.accidente"],
  ["personal", "int.hr.absence.personal"],
  ["duelo", "int.hr.absence.duelo"],
  ["maternidad", "int.hr.absence.maternidad"],
  ["paternidad", "int.hr.absence.paternidad"],
  ["calamidad", "int.hr.absence.calamidad"],
  ["injustificada", "int.hr.absence.injustificada"],
]);

export const INCIDENT_SEVERITIES = opciones([
  ["low", "int.level.low"],
  ["medium", "int.level.medium"],
  ["high", "int.level.high"],
  ["critical", "int.hr.criticalF"],
]);

export const INCIDENT_TYPES = opciones([
  ["disciplinario", "int.hr.incident.disciplinario"],
  ["seguridad", "int.hr.incident.seguridad"],
  ["comportamiento", "int.hr.incident.comportamiento"],
  ["asistencia", "int.hr.incident.asistencia"],
  ["desempeno", "int.hr.incident.desempeno"],
  ["otro", "int.other"],
]);

export const INCIDENT_STATUSES = opciones([
  ["open", "int.hr.incidentStatus.open"],
  ["in_progress", "int.hr.incidentStatus.inProgress"],
  ["resolved", "int.hr.incidentStatus.resolved"],
  ["closed", "int.hr.incidentStatus.closed"],
]);

export const APPLICANT_STATUSES = opciones([
  ["applied", "int.hr.applicant.applied"],
  ["reviewing", "int.hr.applicant.reviewing"],
  ["interview", "int.hr.applicant.interview"],
  ["offer", "int.hr.applicant.offer"],
  ["hired", "int.hr.applicant.hired"],
  ["rejected", "int.hr.applicant.rejected"],
]);

export const APPLICANT_SOURCES = [
  ...opciones([["direct", "int.hr.source.direct"]]),
  marca("linkedin", "LinkedIn"),
  ...opciones([
    ["referral", "int.hr.source.referral"],
    ["portal", "int.hr.source.portal"],
    ["university", "int.hr.source.university"],
    ["agency", "int.hr.source.agency"],
    ["social", "int.hr.source.social"],
  ]),
];

export const EPS_OPTIONS = [
  marca("sanitas", "Sanitas"),
  marca("nueva_eps", "Nueva EPS"),
  marca("compensar", "Compensar"),
  marca("sura", "Sura"),
  marca("salud_total", "Salud Total"),
  marca("famisanar", "Famisanar"),
  marca("coomeva", "Coomeva"),
  marca("colsanitas", "Colsanitas"),
  ...opciones([["otro", "int.otherF"]]),
];

export const ARL_OPTIONS = [
  marca("positiva", "Positiva"),
  marca("sura_arl", "Sura ARL"),
  marca("colmena", "Colmena"),
  marca("liberty", "Liberty Seguros"),
  marca("axa_colpatria", "AXA Colpatria"),
  marca("seguros_bolivar", "Seguros Bolívar"),
  ...opciones([["otro", "int.otherF"]]),
];

export const AFP_OPTIONS = [
  marca("colpensiones", "Colpensiones"),
  marca("porvenir", "Porvenir"),
  marca("proteccion", "Protección"),
  marca("colfondos", "Colfondos"),
  marca("old_mutual", "Old Mutual"),
];

export const DEDUCTION_TYPES = opciones([
  ["salud", "int.hr.deduction.salud"],
  ["pension", "int.hr.deduction.pension"],
  ["fondo_solidaridad", "int.hr.deduction.solidaridad"],
  ["retencion_fuente", "int.hr.deduction.retencion"],
  ["libranza", "int.hr.deduction.libranza"],
  ["embargo", "int.hr.deduction.embargo"],
  ["otro", "int.other"],
]);

export const PERFORMANCE_RATINGS = [
  conEtiqueta({ value: 5 }, "int.hr.rating.5"),
  conEtiqueta({ value: 4 }, "int.hr.rating.4"),
  conEtiqueta({ value: 3 }, "int.hr.rating.3"),
  conEtiqueta({ value: 2 }, "int.hr.rating.2"),
  conEtiqueta({ value: 1 }, "int.hr.rating.1"),
];

export const OVERTIME_TYPES = opciones([
  ["diurno", "int.hr.overtime.diurno"],
  ["nocturno", "int.hr.overtime.nocturno"],
  ["dominical_diurno", "int.hr.overtime.dominicalDiurno"],
  ["dominical_nocturno", "int.hr.overtime.dominicalNocturno"],
  ["festivo_diurno", "int.hr.overtime.festivoDiurno"],
  ["festivo_nocturno", "int.hr.overtime.festivoNocturno"],
]);

export const LEAVE_TYPES = opciones([
  ["vacaciones", "int.hr.leave.vacaciones"],
  ["licencia_no_remunerada", "int.hr.leave.noRemunerada"],
  ["licencia_estudio", "int.hr.leave.estudio"],
  ["licencia_maternidad", "int.hr.leave.maternidad"],
  ["licencia_paternidad", "int.hr.leave.paternidad"],
  ["incapacidad", "int.hr.leave.incapacidad"],
]);

export const DOCUMENT_TYPES_EMPLOYEE = opciones([
  ["cedula", "int.hr.doc.cedula"],
  ["contrato", "int.hr.doc.contrato"],
  ["hoja_vida", "int.hr.doc.hojaVida"],
  ["certificado_estudio", "int.hr.doc.certificadoEstudio"],
  ["certificado_eps", "int.hr.doc.certificadoEps"],
  ["certificado_afp", "int.hr.doc.certificadoAfp"],
  ["foto", "int.hr.doc.foto"],
  ["otro", "int.other"],
]);

export const NATIONAL_ID_TYPES = opciones([
  ["CC", "int.hr.id.cc"],
  ["CE", "int.hr.id.ce"],
  ["PA", "int.hr.id.pa"],
  ["TI", "int.hr.id.ti"],
  ["NIT", "int.hr.id.nit"],
]);

export const BANK_ACCOUNT_TYPES = opciones([
  ["ahorros", "int.hr.bank.ahorros"],
  ["corriente", "int.hr.bank.corriente"],
]);

export const SALARY_FREQUENCIES = opciones([
  ["mensual", "int.hr.salary.mensual"],
  ["quincenal", "int.hr.salary.quincenal"],
  ["semanal", "int.hr.salary.semanal"],
  ["hora", "int.hr.salary.hora"],
]);

export const TRAINING_MODALITIES = opciones([
  ["presencial", "int.hr.training.inPerson"],
  ["virtual", "int.hr.training.virtual"],
  ["hibrido", "int.hr.hybrid"],
  ["elearning", "int.hr.training.elearning"],
]);

export const TRAINING_STATUSES = opciones([
  ["assigned", "int.hr.training.assigned"],
  ["in_progress", "int.hr.training.inProgress"],
  ["completed", "common.completed"],
  ["failed", "int.hr.training.failed"],
  ["cancelled", "int.hr.training.cancelled"],
]);

export const PERFORMANCE_EVALUATION_STATUSES = opciones([
  ["draft", "int.hr.review.draft"],
  ["pending", "common.pending"],
  ["completed", "common.completed"],
  ["reviewed", "int.hr.review.reviewed"],
]);

export const TERMINATION_TYPES = opciones([
  ["voluntary", "int.hr.termination.voluntary"],
  ["dismissal", "int.hr.termination.dismissal"],
  ["dismissal_no_cause", "int.hr.termination.dismissalNoCause"],
  ["mutual", "int.hr.termination.mutual"],
  ["contract_end", "int.hr.termination.contractEnd"],
  ["retirement", "int.hr.termination.retirement"],
]);

export const ABSENCE_STATUSES = opciones([
  ["pending", "common.pending"],
  ["approved", "int.hr.approvedF"],
  ["rejected", "int.hr.rejectedF"],
]);

export const GENDER_OPTIONS = opciones([
  ["masculino", "int.hr.gender.masculino"],
  ["femenino", "int.hr.gender.femenino"],
  ["no_binario", "int.hr.gender.noBinario"],
  ["prefiero_no_decir", "int.hr.gender.prefieroNoDecir"],
]);

export const INCIDENT_CATEGORIES = opciones([
  ["leve", "int.hr.incidentCategory.leve"],
  ["moderada", "int.hr.incidentCategory.moderada"],
  ["grave", "int.hr.incidentCategory.grave"],
  ["muy_grave", "int.hr.incidentCategory.muyGrave"],
]);

export const INCIDENT_IMPACTS = opciones([
  ["bajo", "int.hr.impact.bajo"],
  ["medio", "int.hr.impact.medio"],
  ["alto", "int.hr.impact.alto"],
  ["critico", "common.critical"],
]);

export const TRAINING_TARGET_ROLES = opciones([
  ["general", "int.hr.role.general"],
  ["chatter", "int.hr.role.chatter"],
  ["closer", "int.hr.role.closer"],
  ["leadgen", "int.hr.role.leadgen"],
  ["content", "int.hr.role.content"],
  ["manager", "int.hr.role.manager"],
  ["technology", "int.hr.role.technology"],
]);

export const TRAINING_CONTENT_TYPES = opciones([
  ["video", "int.hr.content.video"],
  ["documento", "int.hr.content.documento"],
  ["quiz", "int.hr.content.quiz"],
  ["practica", "int.hr.content.practica"],
]);

// ── Deducciones Operativas ──

export const DEDUCTION_DISPLAY_TYPES = opciones([
  ["adelanto", "int.hr.deductionType.adelanto"],
  ["infraccion", "int.hr.deductionType.infraccion"],
]);

export const DEDUCTION_STATUSES = opciones([
  ["pending", "common.pending"],
  ["applied", "int.hr.appliedF"],
  ["rejected", "int.hr.rejectedF"],
]);

export const INFRACTION_CATEGORIES = opciones([
  ["redes_sociales", "int.hr.infraction.redes"],
  ["violacion_politicas", "int.hr.infraction.politicas"],
  ["productividad", "int.hr.infraction.productividad"],
  ["ausencia_injustificada", "int.hr.infraction.ausencia"],
  ["otra", "int.otherF"],
]);

// ── Employee History ──

export const HISTORY_CHANGE_TYPES = opciones([
  ["promotion", "int.hr.history.promotion"],
  ["transfer", "int.hr.history.transfer"],
  ["contract_change", "int.hr.history.contractChange"],
  ["salary_adjustment", "int.hr.history.salaryAdjustment"],
  ["status_change", "int.hr.history.statusChange"],
  ["modality_change", "int.hr.history.modalityChange"],
  ["other", "int.other"],
]);

// Clave = la columna de employee_history.field_changed (dato); valor = el nombre
// que se muestra, traducido al leerlo.
export const HISTORY_FIELD_LABELS: Record<string, string> = etiquetasPorClave({
  position_id: "int.hr.field.position",
  department_id: "int.hr.field.department",
  contract_type: "int.hr.field.contractType",
  work_modality: "int.hr.field.workModality",
  status: "common.status",
  base_salary: "int.hr.field.baseSalary",
  reports_to: "int.hr.field.reportsTo",
});
