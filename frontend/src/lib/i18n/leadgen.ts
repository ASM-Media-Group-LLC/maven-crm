// LeadGen.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
//
// ⚠️ Lo que se GUARDA no pasa por acá: `status` ("contactado"…), `record_type`
// ("nuevo" / "reactivado"), la calidad ("A+"…"C", "Potencial"), la plataforma
// ("instagram", "otra"…), el `rating` del QA ("bien" / "regular" / "mal") y los
// nombres de las compañías son DATOS. En pantalla se traduce solo la etiqueta;
// el `value` del SelectItem y lo que se compara con la base siguen igual.
export const PREFIJOS_LEADGEN = ["leadgen."] as const;

export const leadgen = {
  // Genéricos del módulo
  "leadgen.noName": { es: "Sin nombre", en: "No name" },
  "leadgen.noNameParens": { es: "(sin nombre)", en: "(no name)" },
  "leadgen.agentFallback": { es: "Agente", en: "Agent" },
  "leadgen.agentWithId": { es: "Agente {id}", en: "Agent {id}" },
  "leadgen.notFound": { es: "No encontrado", en: "Not found" },
  "leadgen.notSignedIn": { es: "No autenticado", en: "Not signed in" },
  "leadgen.noActivityInRange": { es: "Sin actividad en el rango.", en: "No activity in this range." },
  "leadgen.loadingLeads": { es: "Cargando leads...", en: "Loading leads..." },
  "leadgen.searchLead": { es: "Buscar lead...", en: "Search leads..." },
  "leadgen.searchAgent": { es: "Buscar agente...", en: "Search agents..." },
  "leadgen.saving": { es: "Guardando...", en: "Saving..." },
  "leadgen.database": { es: "Base de Datos", en: "Database" },
  "leadgen.myIgAccounts": { es: "Mis Cuentas IG", en: "My IG accounts" },
  "leadgen.newCount": { es: "{count} nuevos", en: "{count} new" },
  // "tel" corto en las tarjetas; en inglés va la palabra entera.
  "leadgen.telShort.one": { es: "{count} tel", en: "{count} phone" },
  "leadgen.telShort.other": { es: "{count} tel", en: "{count} phones" },
  // La palabra sola, cuando el número va aparte (en negrita).
  "leadgen.phoneWord.one": { es: "teléfono", en: "phone" },
  "leadgen.phoneWord.other": { es: "teléfonos", en: "phones" },
  "leadgen.phones.one": { es: "{count} teléfono", en: "{count} phone" },
  "leadgen.phones.other": { es: "{count} teléfonos", en: "{count} phones" },

  // Columnas y campos (se repiten en tabla, grilla, detalle y base de datos)
  "leadgen.col.created": { es: "Creación", en: "Created" },
  "leadgen.col.agent": { es: "Agente", en: "Agent" },
  "leadgen.col.agency": { es: "Agencia", en: "Agency" },
  "leadgen.col.contact": { es: "Contacto", en: "Contact" },
  "leadgen.col.newShort": { es: "Nuevos", en: "New" },
  "leadgen.col.recoveredShort": { es: "Recup.", en: "Recov." },
  "leadgen.col.phonesShort": { es: "Tel", en: "Phones" },
  "leadgen.col.newHint": { es: "Leads nuevos (record_type ≠ reactivado)", en: "New leads (record_type ≠ reactivado)" },
  "leadgen.col.recoveredHint": {
    es: "Leads recuperación (record_type = reactivado)",
    en: "Recovered leads (record_type = reactivado)",
  },
  "leadgen.col.phonesHint": { es: "Teléfonos obtenidos en el rango", en: "Phones collected in the range" },

  // Calidad (etiquetas; el valor "A+"…"C" es el dato)
  "leadgen.quality.aPlusExcellent": { es: "A+ (Excelente)", en: "A+ (Excellent)" },
  "leadgen.quality.aHigh": { es: "A (Alta)", en: "A (High)" },
  "leadgen.quality.bPlusGood": { es: "B+ (Buena)", en: "B+ (Good)" },
  "leadgen.quality.bFair": { es: "B (Regular)", en: "B (Fair)" },
  "leadgen.quality.cBasic": { es: "C (Básica)", en: "C (Basic)" },
  "leadgen.quality.excellent": { es: "Excelente", en: "Excellent" },
  "leadgen.quality.good": { es: "Buena", en: "Good" },
  "leadgen.quality.fair": { es: "Regular", en: "Fair" },
  "leadgen.quality.basic": { es: "Básica", en: "Basic" },

  // Tipo de registro (el dato es record_type = "nuevo" | "reactivado")
  "leadgen.recordType.reactivated": { es: "Reactivado", en: "Reactivated" },
  "leadgen.recordType.new": { es: "Nuevo", en: "New" },

  // QA (el dato es rating = "bien" | "regular" | "mal")
  "leadgen.qa.good": { es: "Bien", en: "Good" },
  "leadgen.qa.fair": { es: "Regular", en: "Fair" },
  "leadgen.qa.poor": { es: "Mal", en: "Poor" },
  "leadgen.qa.review": { es: "Revisar", en: "Review" },
  "leadgen.qa.rateLead": { es: "Calificar lead", en: "Rate lead" },
  "leadgen.qa.commentOptional": { es: "Comentario (opcional)", en: "Comment (optional)" },

  // Pantalla principal (LeadGenContent)
  "leadgen.header.yourLeads": { es: "Tus leads", en: "Your leads" },
  "leadgen.header.leadManagement": { es: "Gestión de leads", en: "Lead management" },
  "leadgen.header.leadsCount": { es: "{count} leads", en: "{count} leads" },
  "leadgen.header.selectDates": { es: "Selecciona fechas", en: "Select dates" },
  "leadgen.header.myIgAccountsHint": {
    es: "Estado de tus cuentas IG de outreach — qué tan creíble se ven y qué les falta para que las creadoras respondan",
    en: "Status of your IG outreach accounts — how credible they look and what they need for creators to reply",
  },
  "leadgen.header.addLead": { es: "Agregar Lead", en: "Add lead" },
  "leadgen.header.addContact": { es: "Agregar Contacto", en: "Add contact" },
  "leadgen.tab.hourly": { es: "Rendimiento por Hora", en: "Hourly performance" },
  "leadgen.tab.agents": { es: "Agentes", en: "Agents" },
  "leadgen.tab.supervisors": { es: "Supervisores", en: "Supervisors" },
  "leadgen.tab.performance": { es: "Rendimiento", en: "Performance" },
  "leadgen.viewAs.filtered": { es: "Vista filtrada", en: "Filtered view" },
  "leadgen.viewAs.viewingAs": { es: "Viendo el panel como", en: "Viewing the panel as" },
  "leadgen.viewAs.thisLlg": { es: "este LLG", en: "this LLG" },
  "leadgen.viewAs.exit": { es: "Cancelar vista", en: "Exit view" },
  "leadgen.viewAs.filterByName": { es: "Filtrar por nombre…", en: "Filter by name…" },
  "leadgen.viewAs.noLlgs": { es: "Sin LLGs registrados.", en: "No LLGs registered." },
  "leadgen.viewAs.heading": { es: "Ver como", en: "View as" },
  "leadgen.filter.agency": { es: "Agencia", en: "Agency" },
  "leadgen.leads.emptyFiltered": {
    es: "No hay leads para mostrar con estos filtros",
    en: "No leads match these filters",
  },
  "leadgen.agents.bannerTitle": { es: "Rendimiento de Agentes", en: "Agent performance" },
  "leadgen.agents.activeCount": { es: "{count} agentes activos", en: "{count} active agents" },
  "leadgen.agents.activeLabel": { es: "Agentes Activos", en: "Active agents" },
  "leadgen.agents.newRec": { es: "({new} nv · {rec} rec)", en: "({new} new · {rec} rec.)" },
  "leadgen.agents.empty": { es: "No hay agentes con leads en este rango", en: "No agents with leads in this range" },
  // Días de la semana del calendario de agentes, de lunes a domingo.
  "leadgen.week.mon": { es: "LUN", en: "MON" },
  "leadgen.week.tue": { es: "MAR", en: "TUE" },
  "leadgen.week.wed": { es: "MIÉ", en: "WED" },
  "leadgen.week.thu": { es: "JUE", en: "THU" },
  "leadgen.week.fri": { es: "VIE", en: "FRI" },
  "leadgen.week.sat": { es: "SÁB", en: "SAT" },
  "leadgen.week.sun": { es: "DOM", en: "SUN" },

  // Dashboard (LeadGenCantidadCard + LeadGenDashboardExtras)
  "leadgen.dash.bestLlg": { es: "Mejor LLG", en: "Top LLG" },
  "leadgen.dash.phonesPerDay": { es: "Teléfonos obtenidos por día", en: "Phones collected per day" },
  "leadgen.dash.totalCount": { es: "{count} total", en: "{count} total" },
  "leadgen.dash.last30Days": { es: "últimos 30 días", en: "last 30 days" },
  "leadgen.dash.noDataForRange": { es: "Sin datos para el rango", en: "No data for this range" },
  "leadgen.dash.byCategory": { es: "Por categoría", en: "By category" },

  // Estados (LeadGenEstadosCard)
  "leadgen.status.title": { es: "Estados", en: "Statuses" },
  "leadgen.status.replied": { es: "Respondieron", en: "Replied" },
  "leadgen.status.interested": { es: "Interesadas", en: "Interested" },
  "leadgen.status.notInterested": { es: "No interesadas", en: "Not interested" },
  "leadgen.status.other": { es: "Otros", en: "Other" },
  "leadgen.status.withPhone": { es: "Con Teléfono", en: "With phone" },
  "leadgen.status.withoutPhone": { es: "Sin Teléfono", en: "Without phone" },

  // Tabla y grilla de leads
  "leadgen.table.clickToEdit": { es: "Click para editar", en: "Click to edit" },
  "leadgen.table.linkAgent": { es: "Vincular agente", en: "Link agent" },
  "leadgen.table.empty": { es: "No se encontraron leads.", en: "No leads found." },
  "leadgen.grid.viewProfile": { es: "Ver Perfil", en: "View profile" },
  "leadgen.grid.viewDetails": { es: "Ver Detalles", en: "View details" },
  "leadgen.grid.empty": { es: "No hay leads para mostrar", en: "No leads to show" },

  // Rendimiento (AgentHourlyPerformance, AgentDetailView, LeadGenPerformanceView)
  "leadgen.perf.activeTime": { es: "Tiempo Activo", en: "Active time" },
  "leadgen.perf.lastHour": { es: "Última Hora", en: "Last hour" },
  "leadgen.perf.modelsContacted": { es: "Modelos contactados", en: "Models contacted" },
  "leadgen.perf.totalToday": { es: "Total Hoy", en: "Total today" },
  "leadgen.perf.avgPerHour": { es: "Promedio por Hora", en: "Average per hour" },
  "leadgen.perf.target": { es: "Objetivo: {count}/hora", en: "Target: {count}/hour" },
  "leadgen.perf.expected": { es: "Esperados: {expected} | {diff}", en: "Expected: {expected} | {diff}" },
  "leadgen.perf.summary": { es: "Resumen", en: "Summary" },
  "leadgen.perf.summaryRange": { es: "Resumen del Rango Seleccionado", en: "Summary of the selected range" },
  "leadgen.perf.totalLeads": { es: "Total Leads", en: "Total leads" },
  "leadgen.perf.avgPerDay": { es: "Promedio/Día", en: "Avg/day" },
  "leadgen.perf.activeHours": { es: "Horas Activas", en: "Active hours" },
  "leadgen.perf.leadsPerDay": { es: "Leads por Día", en: "Leads per day" },
  "leadgen.perf.leadsPerHourToday": { es: "Leads por Hora (Hoy)", en: "Leads per hour (today)" },
  "leadgen.perf.byCategory": { es: "Distribución por Categoría", en: "Distribution by category" },
  "leadgen.perf.byAgentTitle": { es: "Rendimiento por Agente", en: "Performance by agent" },
  "leadgen.perf.byAgentSubtitle": {
    es: "Selecciona un agente para analizar su actividad",
    en: "Select an agent to analyze their activity",
  },
  "leadgen.perf.selectAgent": { es: "Seleccionar agente", en: "Select agent" },
  "leadgen.perf.selectAgentEmpty": {
    es: "Selecciona un agente para ver su rendimiento",
    en: "Select an agent to see their performance",
  },
  "leadgen.perf.loadingAgent": { es: "Cargando datos del agente...", en: "Loading agent data..." },
  "leadgen.perf.totalLeadsOf": { es: "Total de Leads — {name}", en: "Total leads — {name}" },
  "leadgen.perf.chartByHourOfDay": { es: "Leads por Hora del Día", en: "Leads by hour of day" },
  "leadgen.perf.chartLastWeek": { es: "Leads por Día (Última Semana)", en: "Leads per day (last week)" },
  "leadgen.perf.chartLast30": { es: "Leads por Día (Últimos 30 días)", en: "Leads per day (last 30 days)" },
  "leadgen.perf.chartLast12Months": { es: "Leads por Mes (Últimos 12 meses)", en: "Leads per month (last 12 months)" },

  // Detalle de un agente (AgentDetailView)
  "leadgen.detail.breadcrumb": { es: "Detalle Agente", en: "Agent detail" },
  "leadgen.detail.tabQa": { es: "QA / Retroalimentación", en: "QA / Feedback" },
  "leadgen.detail.selectDates": { es: "Seleccionar fechas", en: "Select dates" },
  "leadgen.detail.leadsFound": { es: "Leads Encontrados:", en: "Leads found:" },
  "leadgen.detail.empty": {
    es: "No hay leads para este agente con estos filtros",
    en: "No leads for this agent with these filters",
  },
  "leadgen.detail.qaDoneCount": { es: "Leads con QA realizado:", en: "Leads with QA done:" },
  "leadgen.detail.qaEmpty": { es: "No hay leads con QA realizado", en: "No leads with QA done" },
  "leadgen.detail.leadDetail": { es: "Detalle del Lead", en: "Lead details" },
  "leadgen.detail.notes": { es: "Notas", en: "Notes" },

  // Supervisores (LeadGenSupervisorView)
  "leadgen.sup.title": { es: "Actividad de Supervisores", en: "Supervisor activity" },
  "leadgen.sup.subtitle": {
    es: "QA reviews realizadas en el período seleccionado",
    en: "QA reviews done in the selected period",
  },
  "leadgen.sup.totalReviews": { es: "Reviews Totales", en: "Total reviews" },
  "leadgen.sup.empty": { es: "No hay reviews de QA en este período", en: "No QA reviews in this period" },

  // Ver un lead (ViewLeadModal)
  "leadgen.view.noteSaved": { es: "Nota guardada", en: "Note saved" },
  "leadgen.view.noteSaveError": { es: "Error al guardar nota", en: "Couldn't save the note" },
  "leadgen.view.editCanceled": { es: "Edición cancelada", en: "Edit canceled" },
  "leadgen.view.convertToContact": { es: "Convertir a Contacto", en: "Convert to contact" },
  "leadgen.view.leadDetail": { es: "Detalle del lead", en: "Lead details" },
  "leadgen.view.entryDate": { es: "Fecha de entrada", en: "Entry date" },
  "leadgen.view.time": { es: "Hora", en: "Time" },
  "leadgen.view.source": { es: "Fuente", en: "Source" },
  "leadgen.view.leadNotes": { es: "Notas del Lead", en: "Lead notes" },
  "leadgen.view.noNotes": { es: "Sin notas", en: "No notes" },
  "leadgen.view.additionalNotes": { es: "Notas Adicionales", en: "Additional notes" },
  "leadgen.view.writeNote": { es: "Escribe tu nota...", en: "Write your note..." },
  "leadgen.view.noAdditionalNotes": { es: "No hay notas adicionales", en: "No additional notes" },

  // Borrar un lead (DeleteLeadDialog)
  "leadgen.delete.deleted": { es: "Lead \"@{handle}\" eliminado", en: "Lead \"@{handle}\" deleted" },
  "leadgen.delete.title": { es: "Eliminar lead", en: "Delete lead" },
  // La descripción va partida alrededor del <strong>@handle</strong>.
  "leadgen.delete.descBefore": {
    es: "Esta acción eliminará permanentemente el lead",
    en: "This will permanently delete the lead",
  },
  "leadgen.delete.descAfter": { es: ". Esta acción no se puede deshacer.", en: ". This can't be undone." },
  "leadgen.delete.deleting": { es: "Eliminando...", en: "Deleting..." },

  // Mis cuentas IG (MisCuentasIGModal)
  "leadgen.igAccounts.description": {
    es: "Cuentas de Instagram que usas para hacer outreach a creadoras. La IA analiza qué tan creíble se ve cada una para que las modelos respondan. Mientras peor la cuenta, menos respuestas vas a sacar.",
    en: "Instagram accounts you use for outreach to creators. The AI analyzes how credible each one looks so models reply. The worse the account, the fewer replies you'll get.",
  },

  // Formularios: validación (AddLeadModal / AddContactoModal)
  "leadgen.form.maxChars": { es: "Máximo {max} caracteres", en: "Maximum {max} characters" },
  "leadgen.form.maxDigits": { es: "Máximo {max} dígitos", en: "Maximum {max} digits" },
  "leadgen.form.categoryRequired": { es: "Categoría requerida", en: "Category required" },
  "leadgen.form.notes": { es: "Notas", en: "Notes" },
  "leadgen.form.notesPlaceholder": { es: "Notas adicionales...", en: "Additional notes..." },
  "leadgen.form.selectCompany": { es: "Selecciona la compañía", en: "Select the company" },

  // Nuevo lead (AddLeadModal)
  "leadgen.addLead.profileUrlRequired": { es: "URL de perfil requerida", en: "Profile URL required" },
  "leadgen.addLead.platformRequired": { es: "Plataforma requerida", en: "Platform required" },
  "leadgen.addLead.companyRequired": { es: "Compañía requerida", en: "Company required" },
  "leadgen.addLead.onlyFansInvalid": {
    es: "Debe ser una URL de OnlyFans válida o un handle",
    en: "Must be a valid OnlyFans URL or a handle",
  },
  "leadgen.addLead.invalidUrl": { es: "URL inválida", en: "Invalid URL" },
  "leadgen.addLead.invalidUrlDesc": {
    es: "No se pudo extraer un handle de la URL proporcionada.",
    en: "Couldn't get a handle from that URL.",
  },
  "leadgen.addLead.duplicateOf": { es: "❌ OnlyFans duplicado", en: "❌ Duplicate OnlyFans" },
  "leadgen.addLead.whereLeads": { es: "leads", en: "leads" },
  "leadgen.addLead.whereContacts": { es: "contactos", en: "contacts" },
  "leadgen.addLead.forName": { es: " para \"{name}\"", en: " for \"{name}\"" },
  "leadgen.addLead.duplicateOfDesc": {
    es: "Esta URL ya está registrada en {where}{forName}. No se puede registrar.",
    en: "This URL is already registered in {where}{forName}. It can't be registered.",
  },
  "leadgen.addLead.added": { es: "Lead agregado exitosamente", en: "Lead added" },
  "leadgen.addLead.addError": { es: "Error al agregar lead", en: "Couldn't add the lead" },
  "leadgen.addLead.title": { es: "Nuevo Lead", en: "New lead" },
  "leadgen.addLead.description": {
    es: "Agrega un nuevo lead al sistema de generación.",
    en: "Add a new lead to the lead generation system.",
  },
  "leadgen.addLead.profileUrl": { es: "URL del Perfil *", en: "Profile URL *" },
  "leadgen.addLead.profileUrlPlaceholder": { es: "https://instagram.com/usuario", en: "https://instagram.com/username" },
  "leadgen.addLead.handleAutodetect": {
    es: "El handle se detectará automáticamente de la URL",
    en: "The handle is detected automatically from the URL",
  },
  "leadgen.addLead.onlyFansUrl": { es: "OnlyFans URL (opcional)", en: "OnlyFans URL (optional)" },
  "leadgen.addLead.onlyFansPlaceholder": { es: "https://onlyfans.com/usuario", en: "https://onlyfans.com/username" },
  "leadgen.addLead.platform": { es: "Plataforma *", en: "Platform *" },
  "leadgen.addLead.selectShort": { es: "Selecciona", en: "Select" },
  "leadgen.addLead.platformOther": { es: "Otra", en: "Other" },
  "leadgen.addLead.category": { es: "Categoría *", en: "Category *" },
  "leadgen.addLead.company": { es: "Compañía / Cuenta de Origen *", en: "Company / source account *" },
  "leadgen.addLead.newCompanyName": { es: "Nombre de la nueva compañía", en: "New company name" },
  "leadgen.addLead.searchCompany": { es: "Buscar compañía...", en: "Search companies..." },
  "leadgen.addLead.companyNotFound": { es: "No se encontró la compañía.", en: "Company not found." },
  "leadgen.addLead.addCompany": { es: "+ Agregar nueva compañía", en: "+ Add new company" },
  "leadgen.addLead.evidenceOptional": { es: "Evidencia (opcional)", en: "Evidence (optional)" },
  "leadgen.addLead.evidenceHint": {
    es: "Hasta {max} capturas. Click, drag&drop, o pega con Cmd/Ctrl+V.",
    en: "Up to {max} screenshots. Click, drag & drop, or paste with Cmd/Ctrl+V.",
  },
  "leadgen.addLead.cantAdd": { es: "No se puede agregar", en: "Can't be added" },
  "leadgen.addLead.save": { es: "Guardar Lead", en: "Save lead" },

  // Nuevo contacto (AddContactoModal)
  "leadgen.addContact.nameRequired": { es: "Nombre requerido", en: "Name required" },
  "leadgen.addContact.igRequired": { es: "Link de Instagram requerido", en: "Instagram link required" },
  "leadgen.addContact.leadRequired": {
    es: "Tienes que seleccionar un lead existente. Si no aparece, agregalo primero en LeadGen.",
    en: "You have to select an existing lead. If it doesn't show up, add it in LeadGen first.",
  },
  "leadgen.addContact.notEnoughEvidence": { es: "Evidencia insuficiente", en: "Not enough evidence" },
  "leadgen.addContact.notEnoughEvidenceDesc": {
    es: "Necesitas adjuntar al menos {min} screenshots del contacto para guardar.",
    en: "You need to attach at least {min} screenshots of the contact to save.",
  },
  "leadgen.addContact.activeCreator": { es: "❌ Creadora activa", en: "❌ Active creator" },
  "leadgen.addContact.activeCreatorDesc": {
    es: "{name} ya forma parte de la agencia con estado \"{status}\". No se puede registrar.",
    en: "{name} is already part of the agency with status \"{status}\". It can't be registered.",
  },
  "leadgen.addContact.inactiveCreator": { es: "⚠️ Creadora inactiva detectada", en: "⚠️ Inactive creator found" },
  "leadgen.addContact.inactiveCreatorDesc": {
    es: "{name} tiene estado \"{status}\". Se registrará como contacto reactivado.",
    en: "{name} has status \"{status}\". It will be saved as a reactivated contact.",
  },
  "leadgen.addContact.phoneTaken": { es: "⚠️ Teléfono ya registrado", en: "⚠️ Phone already registered" },
  "leadgen.addContact.phoneTakenDesc": {
    es: "Este número ya está registrado para {name}. El contacto se guardará de todos modos.",
    en: "This number is already registered to {name}. The contact will be saved anyway.",
  },
  "leadgen.addContact.phoneInCreators": { es: "⚠️ Teléfono en creators", en: "⚠️ Phone found in creators" },
  "leadgen.addContact.phoneInCreatorsDesc": {
    es: "Este número ya existe para la creadora {name}. El contacto se guardará de todos modos.",
    en: "This number already belongs to creator {name}. The contact will be saved anyway.",
  },
  "leadgen.addContact.evidenceUploadFailed": {
    es: "Contacto creado, pero algunas capturas no subieron",
    en: "Contact created, but some screenshots didn't upload",
  },
  "leadgen.addContact.retryFromDetail": {
    es: "Reintenta desde el detalle del contacto.",
    en: "Retry from the contact's details.",
  },
  "leadgen.addContact.saved": { es: "Contacto guardado exitosamente", en: "Contact saved" },
  "leadgen.addContact.saveError": { es: "Error al guardar contacto", en: "Couldn't save the contact" },
  "leadgen.addContact.nothingToUpdate": { es: "No hay datos nuevos para actualizar", en: "No new data to update" },
  "leadgen.addContact.updated": { es: "Contacto actualizado exitosamente", en: "Contact updated" },
  "leadgen.addContact.title": { es: "Nuevo Contacto", en: "New contact" },
  "leadgen.addContact.description": { es: "Agrega un nuevo contacto al sistema.", en: "Add a new contact to the system." },
  "leadgen.addContact.leadName": { es: "Nombre del Lead *", en: "Lead name *" },
  "leadgen.addContact.fromLead": { es: "Desde lead", en: "From lead" },
  "leadgen.addContact.loggedBy": { es: " · logueado por {name}", en: " · logged by {name}" },
  "leadgen.addContact.igLink": { es: "Link de Instagram *", en: "Instagram link *" },
  "leadgen.addContact.igPlaceholder": {
    es: "@usuario o https://instagram.com/usuario",
    en: "@username or https://instagram.com/username",
  },
  "leadgen.addContact.physicalCategory": { es: "Categoría Física *", en: "Physical category *" },
  "leadgen.addContact.selectCategory": { es: "Selecciona categoría", en: "Select category" },
  "leadgen.addContact.catAHigh": { es: "A (Alta)", en: "A (High)" },
  "leadgen.addContact.catBPlusUpperMid": { es: "B+ (Media Alta)", en: "B+ (Upper mid)" },
  "leadgen.addContact.catBMid": { es: "B (Media)", en: "B (Mid)" },
  "leadgen.addContact.catCBasic": { es: "C (Básica)", en: "C (Basic)" },
  "leadgen.addContact.catPotential": { es: "Potencial", en: "Potential" },
  "leadgen.addContact.evidence": { es: "Evidencia del contacto", en: "Contact evidence" },
  "leadgen.addContact.evidenceHint": {
    es: "Adjunta al menos {min} screenshots del chat con la modelo (conversación, número compartido, etc.). Puedes pegar con Cmd/Ctrl+V.",
    en: "Attach at least {min} screenshots of the chat with the model (conversation, shared number, etc.). You can paste with Cmd/Ctrl+V.",
  },
  "leadgen.addContact.missingScreenshots": { es: "Faltan {count} screenshots", en: "{count} screenshots missing" },
  "leadgen.addContact.existingTitle": { es: "Contacto existente", en: "Existing contact" },
  "leadgen.addContact.existingDesc": {
    es: "Esta modelo ya está registrada como contacto. Puedes actualizar sus datos o crear un nuevo registro.",
    en: "This model is already registered as a contact. You can update their details or create a new record.",
  },
  "leadgen.addContact.registeredBy": { es: "Registrado por:", en: "Registered by:" },
  "leadgen.addContact.currentPhone": { es: "Teléfono actual:", en: "Current phone:" },
  "leadgen.addContact.currentEmail": { es: "Email actual:", en: "Current email:" },
  "leadgen.addContact.updating": { es: "Actualizando...", en: "Updating..." },
  "leadgen.addContact.update": { es: "Actualizar contacto", en: "Update contact" },
  "leadgen.addContact.createNew": { es: "Crear nuevo registro", en: "Create new record" },
  "leadgen.addContact.noDuplicates": {
    es: "Este handle ya tiene un teléfono registrado. No se permite duplicar.",
    en: "This handle already has a phone registered. Duplicates aren't allowed.",
  },

  // Base de datos (LeadGenBaseDatosContent)
  "leadgen.db.analysis": { es: "Análisis", en: "Analysis" },
  "leadgen.db.subtitle": { es: "Todos los leads registrados en el sistema", en: "All leads registered in the system" },
  "leadgen.db.totalLeads": { es: "leads totales", en: "total leads" },
  "leadgen.db.currentPage": { es: "PÁGINA ACTUAL", en: "CURRENT PAGE" },
  "leadgen.db.filtered": { es: "Filtrados", en: "Filtered" },
  "leadgen.db.withContact": { es: "Con Contacto", en: "With contact" },
  "leadgen.db.highCategory": { es: "CATEGORÍA ALTA", en: "HIGH CATEGORY" },
  "leadgen.db.midCategory": { es: "CATEGORÍA MEDIA", en: "MID CATEGORY" },
  "leadgen.db.lowCategory": { es: "CATEGORÍA BAJA", en: "LOW CATEGORY" },
  "leadgen.db.searchAgency": { es: "Buscar agencia...", en: "Search agencies..." },
  "leadgen.db.filterByDate": { es: "Filtrar por fecha", en: "Filter by date" },
  // "Mostrando: <n> de …": el número va en negrita entre las dos claves.
  "leadgen.db.showing": { es: "Mostrando:", en: "Showing:" },
  "leadgen.db.showingRest": {
    es: "de {total} leads (página {page} de {pages})",
    en: "of {total} leads (page {page} of {pages})",
  },
  "leadgen.db.last7Days": { es: "Leads Últimos 7 Días", en: "Leads, last 7 days" },
  "leadgen.db.trend30Days": { es: "Tendencia Últimos 30 Días", en: "Trend, last 30 days" },

  // Convertir a Closers (ConvertLeadModal)
  "leadgen.convert.canceled": { es: "Conversión cancelada", en: "Conversion canceled" },
  "leadgen.convert.done": { es: "Lead convertido", en: "Lead converted" },
  "leadgen.convert.doneDesc": {
    es: "El contacto fue creado y agregado al pipeline de Closers.",
    en: "The contact was created and added to the Closers pipeline.",
  },
  "leadgen.convert.error": { es: "Error al convertir", en: "Couldn't convert" },
  "leadgen.convert.platform": { es: "Plataforma", en: "Platform" },
  "leadgen.convert.sourceAccount": { es: "Cuenta origen", en: "Source account" },
  "leadgen.convert.link": { es: "Enlace", en: "Link" },
  "leadgen.convert.included": { es: "✓ Incluido", en: "✓ Included" },
  "leadgen.convert.title": { es: "Convertir Lead a Pipeline Closers", en: "Convert lead to the Closers pipeline" },
  "leadgen.convert.description": {
    es: "Este lead será transferido al pipeline de Closers como una creator nueva en etapa \"Asignada\".",
    en: "This lead will be moved to the Closers pipeline as a new creator in the \"Assigned\" stage.",
  },
  "leadgen.convert.dataToTransfer": { es: "Datos que se transferirán", en: "Data to be transferred" },
  "leadgen.convert.missingHandleTitle": { es: "Falta el handle de Instagram.", en: "The Instagram handle is missing." },
  "leadgen.convert.missingHandleBody": {
    es: "Ningún contacto puede entrar al pipeline sin handle. Edita el lead para agregarlo y vuelve a intentar.",
    en: "No contact can enter the pipeline without a handle. Edit the lead to add it and try again.",
  },
  "leadgen.convert.hint": {
    es: "El lead quedará marcado como \"contactado\" y la creator aparecerá en el módulo de Closers con referencia al lead original.",
    en: "The lead will be marked as \"contacted\" and the creator will show up in Closers with a reference to the original lead.",
  },
  "leadgen.convert.converting": { es: "Convirtiendo...", en: "Converting..." },
  "leadgen.convert.confirm": { es: "Confirmar Conversión", en: "Confirm conversion" },

  // Asignar calidad (AssignCalidadModal)
  "leadgen.assign.optTop": { es: "A+ — Top calidad", en: "A+ — Top quality" },
  "leadgen.assign.optHigh": { es: "A — Alta calidad", en: "A — High quality" },
  "leadgen.assign.optGood": { es: "B+ — Buena calidad", en: "B+ — Good quality" },
  "leadgen.assign.optStandard": { es: "B — Calidad estándar", en: "B — Standard quality" },
  "leadgen.assign.optLow": { es: "C — Baja calidad", en: "C — Low quality" },
  "leadgen.assign.scoreHigh": { es: "Alto — Excelente trabajo", en: "High — Excellent work" },
  "leadgen.assign.scoreMid": { es: "Medio — Trabajo aceptable", en: "Medium — Acceptable work" },
  "leadgen.assign.scoreLow": { es: "Bajo — Necesita mejorar", en: "Low — Needs improvement" },
  "leadgen.assign.updated": { es: "Calidad actualizada", en: "Quality updated" },
  "leadgen.assign.updatedDesc": { es: "Se asignó {quality} correctamente.", en: "{quality} assigned." },
  "leadgen.assign.updateError": { es: "No se pudo actualizar la calidad.", en: "Couldn't update the quality." },
  "leadgen.assign.title": { es: "Asignar Calidad — {ticket}", en: "Assign quality — {ticket}" },
  "leadgen.assign.description": { es: "Asigna o cambia la calidad de este lead.", en: "Assign or change this lead's quality." },
  "leadgen.assign.current": { es: "Calidad Actual", en: "Current quality" },
  "leadgen.assign.new": { es: "Nueva Calidad", en: "New quality" },
  "leadgen.assign.modelQuality": { es: "Calidad del Modelo", en: "Model quality" },
  "leadgen.assign.selectQuality": { es: "Seleccionar calidad", en: "Select quality" },
  "leadgen.assign.workScore": { es: "Puntuación del Trabajo", en: "Work score" },
  "leadgen.assign.selectScore": { es: "Seleccionar puntuación", en: "Select score" },
  "leadgen.assign.comment": { es: "Comentario", en: "Comment" },
  "leadgen.assign.commentPlaceholder": { es: "Razón de la calificación...", en: "Reason for the rating..." },
  "leadgen.assign.commentHint": {
    es: "Opcional. Si escribes una nota, debe tener al menos 3 caracteres.",
    en: "Optional. If you write a note, it must be at least 3 characters.",
  },
  "leadgen.assign.save": { es: "Guardar Calificación", en: "Save rating" },
} as const satisfies Record<string, { es: string; en: string }>;
