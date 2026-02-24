// ============================================================
// HR MODULE v2.0 — Centralized Constants
// ============================================================

export const CONTRACT_TYPES = [
  { value: "indefinido", label: "Indefinido" },
  { value: "fijo", label: "Término Fijo" },
  { value: "obra", label: "Obra o Labor" },
  { value: "prestacion_servicios", label: "Prestación de Servicios" },
  { value: "aprendizaje", label: "Aprendizaje" },
  { value: "temporal", label: "Temporal" },
];

export const WORK_MODALITIES = [
  { value: "presencial", label: "Presencial" },
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
];

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "en_licencia", label: "En Licencia" },
  { value: "suspendido", label: "Suspendido" },
  { value: "vacaciones", label: "Vacaciones" },
];

export const ABSENCE_TYPES = [
  { value: "enfermedad", label: "Enfermedad" },
  { value: "accidente", label: "Accidente de Trabajo" },
  { value: "personal", label: "Personal" },
  { value: "duelo", label: "Duelo" },
  { value: "maternidad", label: "Licencia Maternidad" },
  { value: "paternidad", label: "Licencia Paternidad" },
  { value: "calamidad", label: "Calamidad Doméstica" },
  { value: "injustificada", label: "Injustificada" },
];

export const INCIDENT_SEVERITIES = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

export const INCIDENT_TYPES = [
  { value: "disciplinario", label: "Disciplinario" },
  { value: "seguridad", label: "Seguridad" },
  { value: "comportamiento", label: "Comportamiento" },
  { value: "asistencia", label: "Asistencia" },
  { value: "desempeno", label: "Desempeño" },
  { value: "otro", label: "Otro" },
];

export const INCIDENT_STATUSES = [
  { value: "open", label: "Abierto" },
  { value: "in_progress", label: "En Proceso" },
  { value: "resolved", label: "Resuelto" },
  { value: "closed", label: "Cerrado" },
];

export const APPLICANT_STATUSES = [
  { value: "applied", label: "Postulado" },
  { value: "reviewing", label: "En Revisión" },
  { value: "interview", label: "Entrevista" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado" },
  { value: "rejected", label: "Rechazado" },
];

export const APPLICANT_SOURCES = [
  { value: "direct", label: "Directo" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "referral", label: "Referido" },
  { value: "portal", label: "Portal de Empleo" },
  { value: "university", label: "Universidad" },
  { value: "agency", label: "Agencia" },
  { value: "social", label: "Redes Sociales" },
];

export const EPS_OPTIONS = [
  { value: "sanitas", label: "Sanitas" },
  { value: "nueva_eps", label: "Nueva EPS" },
  { value: "compensar", label: "Compensar" },
  { value: "sura", label: "Sura" },
  { value: "salud_total", label: "Salud Total" },
  { value: "famisanar", label: "Famisanar" },
  { value: "coomeva", label: "Coomeva" },
  { value: "colsanitas", label: "Colsanitas" },
  { value: "otro", label: "Otra" },
];

export const ARL_OPTIONS = [
  { value: "positiva", label: "Positiva" },
  { value: "sura_arl", label: "Sura ARL" },
  { value: "colmena", label: "Colmena" },
  { value: "liberty", label: "Liberty Seguros" },
  { value: "axa_colpatria", label: "AXA Colpatria" },
  { value: "seguros_bolivar", label: "Seguros Bolívar" },
  { value: "otro", label: "Otra" },
];

export const AFP_OPTIONS = [
  { value: "colpensiones", label: "Colpensiones" },
  { value: "porvenir", label: "Porvenir" },
  { value: "proteccion", label: "Protección" },
  { value: "colfondos", label: "Colfondos" },
  { value: "old_mutual", label: "Old Mutual" },
];

export const DEDUCTION_TYPES = [
  { value: "salud", label: "Salud" },
  { value: "pension", label: "Pensión" },
  { value: "fondo_solidaridad", label: "Fondo de Solidaridad" },
  { value: "retencion_fuente", label: "Retención en la Fuente" },
  { value: "libranza", label: "Libranza" },
  { value: "embargo", label: "Embargo" },
  { value: "otro", label: "Otro" },
];

export const PERFORMANCE_RATINGS = [
  { value: 5, label: "Excelente" },
  { value: 4, label: "Bueno" },
  { value: 3, label: "Aceptable" },
  { value: 2, label: "Regular" },
  { value: 1, label: "Deficiente" },
];

export const OVERTIME_TYPES = [
  { value: "diurno", label: "Diurno" },
  { value: "nocturno", label: "Nocturno" },
  { value: "dominical_diurno", label: "Dominical Diurno" },
  { value: "dominical_nocturno", label: "Dominical Nocturno" },
  { value: "festivo_diurno", label: "Festivo Diurno" },
  { value: "festivo_nocturno", label: "Festivo Nocturno" },
];

export const LEAVE_TYPES = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "licencia_no_remunerada", label: "Licencia No Remunerada" },
  { value: "licencia_estudio", label: "Licencia de Estudio" },
  { value: "licencia_maternidad", label: "Licencia de Maternidad" },
  { value: "licencia_paternidad", label: "Licencia de Paternidad" },
  { value: "incapacidad", label: "Incapacidad" },
];

export const DOCUMENT_TYPES_EMPLOYEE = [
  { value: "cedula", label: "Cédula de Ciudadanía" },
  { value: "contrato", label: "Contrato de Trabajo" },
  { value: "hoja_vida", label: "Hoja de Vida" },
  { value: "certificado_estudio", label: "Certificado de Estudio" },
  { value: "certificado_eps", label: "Certificado EPS" },
  { value: "certificado_afp", label: "Certificado AFP" },
  { value: "foto", label: "Fotografía" },
  { value: "otro", label: "Otro" },
];

export const NATIONAL_ID_TYPES = [
  { value: "CC", label: "Cédula de Ciudadanía" },
  { value: "CE", label: "Cédula de Extranjería" },
  { value: "PA", label: "Pasaporte" },
  { value: "TI", label: "Tarjeta de Identidad" },
  { value: "NIT", label: "NIT" },
];

export const BANK_ACCOUNT_TYPES = [
  { value: "ahorros", label: "Cuenta de Ahorros" },
  { value: "corriente", label: "Cuenta Corriente" },
];

export const SALARY_FREQUENCIES = [
  { value: "mensual", label: "Mensual" },
  { value: "quincenal", label: "Quincenal" },
  { value: "semanal", label: "Semanal" },
  { value: "hora", label: "Por Hora" },
];

export const TRAINING_MODALITIES = [
  { value: "presencial", label: "Presencial" },
  { value: "virtual", label: "Virtual" },
  { value: "hibrido", label: "Híbrido" },
  { value: "elearning", label: "E-Learning" },
];

export const TRAINING_STATUSES = [
  { value: "assigned", label: "Asignado" },
  { value: "in_progress", label: "En Progreso" },
  { value: "completed", label: "Completado" },
  { value: "failed", label: "No Aprobado" },
  { value: "cancelled", label: "Cancelado" },
];

export const PERFORMANCE_EVALUATION_STATUSES = [
  { value: "draft", label: "Borrador" },
  { value: "pending", label: "Pendiente" },
  { value: "completed", label: "Completado" },
  { value: "reviewed", label: "Revisado" },
];

export const TERMINATION_TYPES = [
  { value: "voluntary", label: "Renuncia Voluntaria" },
  { value: "dismissal", label: "Despido con Justa Causa" },
  { value: "dismissal_no_cause", label: "Despido sin Justa Causa" },
  { value: "mutual", label: "Mutuo Acuerdo" },
  { value: "contract_end", label: "Vencimiento de Contrato" },
  { value: "retirement", label: "Jubilación" },
];

export const ABSENCE_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "approved", label: "Aprobada" },
  { value: "rejected", label: "Rechazada" },
];

export const GENDER_OPTIONS = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "no_binario", label: "No Binario" },
  { value: "prefiero_no_decir", label: "Prefiero no decir" },
];

export const INCIDENT_CATEGORIES = [
  { value: "leve", label: "Leve" },
  { value: "moderada", label: "Moderada" },
  { value: "grave", label: "Grave" },
  { value: "muy_grave", label: "Muy Grave" },
];

export const INCIDENT_IMPACTS = [
  { value: "bajo", label: "Bajo" },
  { value: "medio", label: "Medio" },
  { value: "alto", label: "Alto" },
  { value: "critico", label: "Crítico" },
];

export const TRAINING_TARGET_ROLES = [
  { value: "general", label: "General" },
  { value: "chatter", label: "Chatter" },
  { value: "closer", label: "Closer" },
  { value: "leadgen", label: "Lead Gen" },
  { value: "content", label: "Contenido" },
  { value: "manager", label: "Manager" },
  { value: "technology", label: "Tecnología" },
];

export const TRAINING_CONTENT_TYPES = [
  { value: "video", label: "Video" },
  { value: "documento", label: "Documento" },
  { value: "quiz", label: "Quiz" },
  { value: "practica", label: "Práctica" },
];

// ── Deducciones Operativas ──

export const DEDUCTION_DISPLAY_TYPES = [
  { value: "adelanto", label: "Adelanto de Nómina" },
  { value: "infraccion", label: "Infracción" },
];

export const DEDUCTION_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "applied", label: "Aplicada" },
  { value: "rejected", label: "Rechazada" },
];

export const INFRACTION_CATEGORIES = [
  { value: "redes_sociales", label: "Uso de redes sociales" },
  { value: "violacion_politicas", label: "Violación de políticas" },
  { value: "productividad", label: "Productividad" },
  { value: "ausencia_injustificada", label: "Ausencia injustificada" },
  { value: "otra", label: "Otra" },
];

// ── Employee History ──

export const HISTORY_CHANGE_TYPES = [
  { value: "promotion", label: "Promoción" },
  { value: "transfer", label: "Transferencia" },
  { value: "contract_change", label: "Cambio Contractual" },
  { value: "salary_adjustment", label: "Ajuste Salarial" },
  { value: "status_change", label: "Cambio de Estado" },
  { value: "modality_change", label: "Cambio de Modalidad" },
  { value: "other", label: "Otro" },
];

export const HISTORY_FIELD_LABELS: Record<string, string> = {
  position_id: "Cargo",
  department_id: "Departamento",
  contract_type: "Tipo de Contrato",
  work_modality: "Modalidad de Trabajo",
  status: "Estado",
  base_salary: "Salario Base",
  reports_to: "Supervisor",
};
