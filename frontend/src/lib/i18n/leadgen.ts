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
  "leadgen.header.leadsCount.one": { es: "{count} lead", en: "{count} lead" },
  "leadgen.header.leadsCount.other": { es: "{count} leads", en: "{count} leads" },
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
  "leadgen.agents.activeCount.one": { es: "{count} agente activo", en: "{count} active agent" },
  "leadgen.agents.activeCount.other": { es: "{count} agentes activos", en: "{count} active agents" },
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
  // La pestaña de cuentas (pages/panel-de-control/SpammerAccountsTab), que se ve
  // acá adentro y en Panel de Control, y su alta (AddSpammerAccountDialog).
  // ⚠️ El análisis de la IA (resumen, fortalezas, red flags…) es DATO: se guarda
  // en la base tal como lo escribió el modelo y se muestra tal cual.
  // Lo que va entre **dobles asteriscos** se dibuja en negrita.
  "leadgen.igAccounts.titleMine": { es: "Mis cuentas IG", en: "My IG accounts" },
  "leadgen.igAccounts.titleAll": { es: "Salud de Cuentas IG", en: "IG account health" },
  "leadgen.igAccounts.hintMine": {
    es: "Tus cuentas de IG que usas para outreach. Cada cuenta se escanea con IA que evalúa qué tan creíble se ve para que las creadoras respondan. Click en una card para ver el análisis del scan.",
    en: "The IG accounts you use for outreach. Each account is scanned by an AI that rates how credible it looks so creators reply. Click a card to see the scan analysis.",
  },
  "leadgen.igAccounts.hintAll": {
    es: "Cuentas de IG que el equipo usa para outreach (LGs/scouters). Cada cuenta se escanea con IA (Sonnet 4.6) que evalúa qué tan creíble se ve para que las creadoras objetivo respondan. Click en una card para ver el detalle del análisis.",
    en: "IG accounts the team uses for outreach (LGs/scouters). Each account is scanned by an AI (Sonnet 4.6) that rates how credible it looks so target creators reply. Click a card to see the full analysis.",
  },
  "leadgen.igAccounts.hintShort": {
    es: "· IA escanea cada cuenta nueva — click en una card para ver el análisis completo",
    en: "· AI scans every new account — click a card to see the full analysis",
  },
  "leadgen.igAccounts.searchMine": { es: "Buscar handle o nombre…", en: "Search handle or name…" },
  "leadgen.igAccounts.searchAll": { es: "Buscar handle, nombre, scouter…", en: "Search handle, name, scouter…" },
  "leadgen.igAccounts.uniqueAccounts": { es: "Cuentas únicas", en: "Unique accounts" },
  "leadgen.igAccounts.avgScore": { es: "Score promedio", en: "Average score" },
  "leadgen.igAccounts.waitingScan": { es: "Esperando scan", en: "Waiting for scan" },
  "leadgen.igAccounts.failed": { es: "Fallidas", en: "Failed" },
  "leadgen.igAccounts.allAccounts": { es: "Todas las cuentas", en: "All accounts" },
  "leadgen.igAccounts.loading": { es: "Cargando cuentas…", en: "Loading accounts…" },
  "leadgen.igAccounts.emptyMine": { es: "Todavía no tienes cuentas registradas", en: "You don't have any accounts yet" },
  "leadgen.igAccounts.emptyAll": { es: "Todavía no hay cuentas registradas", en: "No accounts registered yet" },
  "leadgen.igAccounts.noSearchResults": { es: "Sin resultados para esa búsqueda", en: "No results for that search" },
  "leadgen.igAccounts.emptyMineDesc": {
    es: "Agrega tu primera cuenta de Instagram para que la IA evalúe qué tan creíble se ve.",
    en: "Add your first Instagram account so the AI can rate how credible it looks.",
  },
  "leadgen.igAccounts.emptyAllDesc": {
    es: "Cuando un scouter agregue su primera cuenta en Scouter Assist > Cuentas, aparecerá aquí con su análisis IA.",
    en: "When a scouter adds their first account in Scouter Assist > Accounts, it will show up here with its AI analysis.",
  },
  "leadgen.igAccounts.noSearchResultsDesc": {
    es: "Prueba con otro handle, nombre o scouter.",
    en: "Try another handle, name or scouter.",
  },
  "leadgen.igAccounts.addFirst": { es: "Agregar mi primera cuenta", en: "Add my first account" },
  "leadgen.igAccounts.addAccount": { es: "Agregar cuenta", en: "Add account" },
  "leadgen.igAccounts.addAccountHint": {
    es: "Suma una cuenta IG. La IA la escanea automático.",
    en: "Add an IG account. The AI scans it automatically.",
  },
  "leadgen.igAccounts.rescanStarted": { es: "Re-escaneo en marcha", en: "Rescan started" },
  "leadgen.igAccounts.rescanStartedDesc": {
    es: "Vuelve en unos segundos a ver el resultado.",
    en: "Check back in a few seconds for the result.",
  },
  "leadgen.igAccounts.rescanError": { es: "No se pudo re-escanear", en: "Couldn't rescan" },
  // Nivel del score (el número lo da la IA; la etiqueta es solo de pantalla)
  "leadgen.igAccounts.score.high": { es: "Alto", en: "High" },
  "leadgen.igAccounts.score.good": { es: "Bueno", en: "Good" },
  "leadgen.igAccounts.score.medium": { es: "Medio", en: "Medium" },
  "leadgen.igAccounts.score.low": { es: "Bajo", en: "Low" },
  "leadgen.igAccounts.score.veryLow": { es: "Muy bajo", en: "Very low" },
  "leadgen.igAccounts.score.none": { es: "Sin scan", en: "Not scanned" },
  // Tarjeta
  "leadgen.igAccounts.deleteThis": { es: "Eliminar esta cuenta", en: "Delete this account" },
  "leadgen.igAccounts.restricted": { es: "Restringida", en: "Restricted" },
  "leadgen.igAccounts.restrictedHint": {
    es: "IG marcó la cuenta como restringida — oculta a viewers no-loggeados.",
    en: "IG flagged the account as restricted — it's hidden from logged-out viewers.",
  },
  "leadgen.igAccounts.restrictedTargetHint": {
    es: "IG marcó la cuenta como restringida — las creators target no pueden verla sin login.",
    en: "IG flagged the account as restricted — target creators can't see it without logging in.",
  },
  "leadgen.igAccounts.notRead": { es: "Sin leer", en: "Not read" },
  "leadgen.igAccounts.notReadHint": {
    es: "No pudimos leer el perfil automáticamente. Reintenta el scan o sube un screenshot — no significa que esté restringida.",
    en: "We couldn't read the profile automatically. Retry the scan or upload a screenshot — it doesn't mean it's restricted.",
  },
  "leadgen.igAccounts.scanning": { es: "Escaneando con IA…", en: "Scanning with AI…" },
  "leadgen.igAccounts.scanFailed": { es: "Scan fallido", en: "Scan failed" },
  "leadgen.igAccounts.couldNotRead": {
    es: "No se pudo leer — reintenta el scan o sube un screenshot.",
    en: "Couldn't read it — retry the scan or upload a screenshot.",
  },
  "leadgen.igAccounts.noAnalysisYet": { es: "Sin análisis todavía.", en: "No analysis yet." },
  "leadgen.igAccounts.noScouter": { es: "Sin scouter asignado", en: "No scouter assigned" },
  "leadgen.igAccounts.noScouterDot": { es: "Sin scouter asignado.", en: "No scouter assigned." },
  // Siempre 2 o más: con uno solo se muestra su nombre.
  "leadgen.igAccounts.scoutersUseIt": { es: "{count} scouters la usan", en: "{count} scouters use it" },
  "leadgen.igAccounts.deleteTitle": { es: "¿Eliminar @{handle}?", en: "Delete @{handle}?" },
  "leadgen.igAccounts.deleteDesc": {
    es: "Esta cuenta dejará de aparecer en \"Mis Cuentas IG\" y no se usará más para outreach. Si la quemaron en IG y quieres agregar una nueva, primero eliminala acá.",
    en: "This account will no longer show up in \"My IG accounts\" and won't be used for outreach anymore. If it got burned on IG and you want to add a new one, delete it here first.",
  },
  "leadgen.igAccounts.deleteDescShared": {
    es: "Si más de un scouter la tenía registrada, se elimina solo TU registro — los demás siguen viéndola.",
    en: "If more than one scouter had it registered, only YOUR record is deleted — the others still see it.",
  },
  "leadgen.igAccounts.confirmDelete": { es: "Sí, eliminar", en: "Yes, delete" },
  // Guía para recuperar una cuenta restringida
  "leadgen.igAccounts.guide.title": { es: "Cómo recuperar esta cuenta", en: "How to recover this account" },
  "leadgen.igAccounts.guide.decisionTitle": {
    es: "Decisión 0 — ¿Recuperar o abandonar?",
    en: "Decision 0 — Recover or abandon?",
  },
  "leadgen.igAccounts.guide.decisionBody": {
    es: "Si es cuenta nueva (<3 meses) o con nombre genérico, **abandonar y crear fresh** suele ser más rápido que pelear la restricción (puede tomar semanas). Si tiene historial decente, vale la pena recuperar.",
    en: "If it's a new account (<3 months) or has a generic name, **abandoning it and starting fresh** is usually faster than fighting the restriction (it can take weeks). If it has a decent history, it's worth recovering.",
  },
  "leadgen.igAccounts.guide.ifRecover": { es: "Si decides recuperar:", en: "If you decide to recover it:" },
  "leadgen.igAccounts.guide.step1": {
    es: "**Verificar email Y teléfono real** (no virtual): Settings → Account → Personal information.",
    en: "**Verify a real email AND phone** (not virtual): Settings → Account → Personal information.",
  },
  "leadgen.igAccounts.guide.step2": {
    es: "**Activar 2FA**: Settings → Security → Two-factor authentication.",
    en: "**Turn on 2FA**: Settings → Security → Two-factor authentication.",
  },
  "leadgen.igAccounts.guide.step3": {
    es: "**Revisar reports/violations**: Settings → Help → Account status. Eliminar posts marcados.",
    en: "**Check reports/violations**: Settings → Help → Account status. Delete flagged posts.",
  },
  "leadgen.igAccounts.guide.step4": {
    es: "**Cambiar a perfil business**: Settings → Account type → Switch to Business. Category: \"Talent Agency\".",
    en: "**Switch to a business profile**: Settings → Account type → Switch to Business. Category: \"Talent Agency\".",
  },
  "leadgen.igAccounts.guide.step5": {
    es: "**Apelar formalmente**: Settings → Help → Report a Problem. Explica que eres una agencia legítima.",
    en: "**Appeal formally**: Settings → Help → Report a Problem. Explain that you're a legitimate agency.",
  },
  "leadgen.igAccounts.guide.step6": {
    es: "**PARAR todo outreach** por 7-14 días. Navega normal, like a posts, sigue cuentas, postea 2-3 cosas propias. Si sigues spammeando DMs, IG nunca levanta el flag.",
    en: "**STOP all outreach** for 7-14 days. Browse normally, like posts, follow accounts, post 2-3 things of your own. If you keep spamming DMs, IG never lifts the flag.",
  },
  "leadgen.igAccounts.guide.step7": {
    es: "**Volver gradual**: 5 DMs/día semana 3, 10 DMs/día semana 4, máximo 20/día después. Cada DM personalizado.",
    en: "**Ramp back up gradually**: 5 DMs/day in week 3, 10 DMs/day in week 4, 20/day max after that. Every DM personalized.",
  },
  "leadgen.igAccounts.guide.ifAbandon": {
    es: "Si decides abandonar y crear nueva:",
    en: "If you decide to abandon it and create a new one:",
  },
  "leadgen.igAccounts.guide.fresh1": {
    es: "SIM física fresca, email dedicado, dispositivo limpio.",
    en: "A fresh physical SIM, a dedicated email, a clean device.",
  },
  "leadgen.igAccounts.guide.fresh2": {
    es: "Día 1: profile completo (foto logo, bio profesional, link al sitio, business).",
    en: "Day 1: complete profile (logo photo, professional bio, website link, business).",
  },
  "leadgen.igAccounts.guide.fresh3": {
    es: "Días 1-14: warm-up — browsear, likes, posts propios. **CERO DMs**.",
    en: "Days 1-14: warm-up — browse, like, post your own content. **ZERO DMs**.",
  },
  "leadgen.igAccounts.guide.fresh4": { es: "Día 14+: ramp-up gradual de outreach.", en: "Day 14+: gradual outreach ramp-up." },
  "leadgen.igAccounts.guide.rules": {
    es: "**Reglas permanentes:** nunca copy-paste el mismo DM · espaciar 2-3 min entre DMs · 1 IP/device por cuenta · profile completo ANTES de cualquier outreach · mínimo 5 posts del roster en feed.",
    en: "**Permanent rules:** never copy-paste the same DM · space DMs 2-3 min apart · 1 IP/device per account · complete profile BEFORE any outreach · at least 5 roster posts in the feed.",
  },
  // Capturas del perfil (cuando IG no deja leerlo)
  "leadgen.igAccounts.notAnImage": { es: "\"{name}\" no es una imagen.", en: "\"{name}\" isn't an image." },
  "leadgen.igAccounts.tooLarge": { es: "\"{name}\" pesa más de 10 MB.", en: "\"{name}\" is larger than 10 MB." },
  "leadgen.igAccounts.screenshotsLoaded.one": {
    es: "{count} screenshot cargado — el análisis usa la data real",
    en: "{count} screenshot uploaded — the analysis uses the real data",
  },
  "leadgen.igAccounts.screenshotsLoaded.other": {
    es: "{count} screenshots cargados — el análisis usa la data real",
    en: "{count} screenshots uploaded — the analysis uses the real data",
  },
  "leadgen.igAccounts.pasteScreenshots": {
    es: "Pega uno o varios screenshots del perfil",
    en: "Paste one or more screenshots of the profile",
  },
  "leadgen.igAccounts.improveWithScreenshots": {
    es: "Mejorar análisis con screenshots",
    en: "Improve the analysis with screenshots",
  },
  "leadgen.igAccounts.screenshotsRestrictedHint": {
    es: "Como IG oculta la cuenta a viewers no-loggeados, el bot no puede leer bio/foto/link. Saca screenshots del perfil desde tu browser (logueado) y subilos acá — puedes agregar varios (bio, posts, link, etc) y Claude vision los lee y enriquece el análisis.",
    en: "Since IG hides the account from logged-out viewers, the bot can't read the bio/photo/link. Take screenshots of the profile from your browser (logged in) and upload them here — you can add several (bio, posts, link, etc.) and Claude vision reads them and enriches the analysis.",
  },
  "leadgen.igAccounts.screenshotsUnreadHint": {
    es: "No pudimos leer la cuenta automáticamente (muy nueva o IG bloqueó la lectura). Saca screenshots del perfil desde tu browser (logueado) y subilos acá — puedes agregar varios (bio, posts, link, etc) y Claude vision los lee y arma el análisis con la data real.",
    en: "We couldn't read the account automatically (too new, or IG blocked the read). Take screenshots of the profile from your browser (logged in) and upload them here — you can add several (bio, posts, link, etc.) and Claude vision reads them and builds the analysis from the real data.",
  },
  "leadgen.igAccounts.uploading": { es: "Subiendo…", en: "Uploading…" },
  "leadgen.igAccounts.addMoreScreenshots": { es: "Agregar más screenshots", en: "Add more screenshots" },
  "leadgen.igAccounts.uploadScreenshots": { es: "Subir screenshots", en: "Upload screenshots" },
  "leadgen.igAccounts.profileScreenshot": { es: "Screenshot del perfil", en: "Profile screenshot" },
  "leadgen.igAccounts.removeScreenshot": { es: "Quitar screenshot", en: "Remove screenshot" },
  // Detalle de una cuenta
  "leadgen.igAccounts.verified": { es: "Verificada", en: "Verified" },
  "leadgen.igAccounts.noDisplayName": { es: "Sin nombre visible", en: "No display name" },
  "leadgen.igAccounts.wouldReply": { es: "Sí respondería", en: "Would reply" },
  "leadgen.igAccounts.mightReply": { es: "Tal vez respondería", en: "Might reply" },
  "leadgen.igAccounts.wouldNotReply": { es: "No respondería", en: "Wouldn't reply" },
  "leadgen.igAccounts.restrictedBannerTitle": {
    es: "IG marcó la cuenta como restringida",
    en: "IG flagged the account as restricted",
  },
  "leadgen.igAccounts.restrictedBannerBody": {
    es: "IG la oculta a viewers no-loggeados. Cuando esta cuenta le mande DM a una creadora, lo más probable es que el perfil le aparezca con muro de login o aviso de cuenta restringida — no van a poder validar quién manda el mensaje. Típicamente pasa por contenido NSFW, patrones de spam previos, reportes de usuarios, o cuenta sin verificar mail/teléfono.",
    en: "IG hides it from logged-out viewers. When this account DMs a creator, she'll most likely see the profile behind a login wall or a restricted-account notice — she won't be able to check who's sending the message. It usually happens because of NSFW content, earlier spam patterns, user reports, or an account without a verified email/phone.",
  },
  "leadgen.igAccounts.enrichOptional": {
    es: "¿Quieres enriquecer el análisis con screenshots? (opcional)",
    en: "Want to enrich the analysis with screenshots? (optional)",
  },
  "leadgen.igAccounts.unreadBannerTitle": {
    es: "No pudimos leer el perfil automáticamente",
    en: "We couldn't read the profile automatically",
  },
  "leadgen.igAccounts.unreadBannerBody": {
    es: "Suele pasar con cuentas muy nuevas (todavía sin indexar) o cuando IG bloquea la lectura desde el servidor. **No** significa que la cuenta esté restringida. Reintenta el scan con el botón de abajo, o sube un screenshot del perfil (logueado) para analizarla igual.",
    en: "It usually happens with very new accounts (not indexed yet) or when IG blocks reads from the server. It does **not** mean the account is restricted. Retry the scan with the button below, or upload a screenshot of the profile (logged in) to analyze it anyway.",
  },
  "leadgen.igAccounts.scannedOn": { es: "Escaneado {date}", en: "Scanned {date}" },
  "leadgen.igAccounts.whyNot": { es: "Por qué NO respondería", en: "Why they WOULDN'T reply" },
  "leadgen.igAccounts.urgentImprovements": { es: "Mejoras urgentes", en: "Urgent improvements" },
  "leadgen.igAccounts.strengths": { es: "Fortalezas", en: "Strengths" },
  "leadgen.igAccounts.recommendations": { es: "Recomendaciones a mediano plazo", en: "Medium-term recommendations" },
  "leadgen.igAccounts.scanFailedWith": { es: "Scan fallido: {error}", en: "Scan failed: {error}" },
  "leadgen.igAccounts.unknownError": { es: "error desconocido", en: "unknown error" },
  "leadgen.igAccounts.scanInProgress": {
    es: "Escaneo en curso… vuelve en unos segundos.",
    en: "Scan in progress… check back in a few seconds.",
  },
  "leadgen.igAccounts.noAiAnalysis": {
    es: "Sin análisis IA disponible para esta cuenta.",
    en: "No AI analysis available for this account.",
  },
  "leadgen.igAccounts.scoutersUsing": { es: "Scouters que la usan ({count})", en: "Scouters using it ({count})" },
  "leadgen.igAccounts.rescanNow": { es: "Re-escanear ahora", en: "Rescan now" },
  // Lista que abre cada recuadro de arriba
  "leadgen.igAccounts.list.count.one": { es: "{count} cuenta", en: "{count} account" },
  "leadgen.igAccounts.list.count.other": { es: "{count} cuentas", en: "{count} accounts" },
  "leadgen.igAccounts.list.pending.one": {
    es: "{count} cuenta esperando o ejecutando scan IA",
    en: "{count} account waiting for or running an AI scan",
  },
  "leadgen.igAccounts.list.pending.other": {
    es: "{count} cuentas esperando o ejecutando scan IA",
    en: "{count} accounts waiting for or running an AI scan",
  },
  "leadgen.igAccounts.list.failed.one": {
    es: "{count} cuenta — el scan falló (cuenta privada, baneada, o IG bloqueó la API)",
    en: "{count} account — the scan failed (private or banned account, or IG blocked the API)",
  },
  "leadgen.igAccounts.list.failed.other": {
    es: "{count} cuentas — el scan falló (cuenta privada, baneada, o IG bloqueó la API)",
    en: "{count} accounts — the scan failed (private or banned account, or IG blocked the API)",
  },
  "leadgen.igAccounts.list.all.one": {
    es: "{count} cuenta registrada en este tenant",
    en: "{count} account registered in this tenant",
  },
  "leadgen.igAccounts.list.all.other": {
    es: "{count} cuentas registradas en este tenant",
    en: "{count} accounts registered in this tenant",
  },
  "leadgen.igAccounts.list.rescanAll": { es: "Re-escanear todas", en: "Rescan all" },
  "leadgen.igAccounts.list.emptyPending": { es: "No hay cuentas en cola de scan.", en: "No accounts in the scan queue." },
  "leadgen.igAccounts.list.emptyFailed": { es: "No hay cuentas con scan fallido.", en: "No accounts with a failed scan." },
  "leadgen.igAccounts.list.emptyAll": { es: "No hay cuentas registradas todavía.", en: "No accounts registered yet." },
  "leadgen.igAccounts.list.rescanThis": { es: "Re-escanear esta cuenta", en: "Rescan this account" },
  "leadgen.igAccounts.list.scan": { es: "Escanear", en: "Scan" },
  // Alta de una cuenta (AddSpammerAccountDialog)
  "leadgen.igAccounts.add.handleInvalid": {
    es: "Solo letras, números, puntos y guiones bajos (máx 30).",
    en: "Only letters, numbers, periods and underscores (30 max).",
  },
  "leadgen.igAccounts.add.added": { es: "Cuenta agregada — escaneando con IA…", en: "Account added — scanning with AI…" },
  "leadgen.igAccounts.add.title": { es: "Agregar cuenta IG", en: "Add IG account" },
  "leadgen.igAccounts.add.description": {
    es: "Suma una cuenta de Instagram que uses para hacer outreach. La IA la escanea y te dice qué tan creíble se ve para las creadoras.",
    en: "Add an Instagram account you use for outreach. The AI scans it and tells you how credible it looks to creators.",
  },
  "leadgen.igAccounts.add.handle": { es: "Handle de Instagram", en: "Instagram handle" },
  "leadgen.igAccounts.add.handlePlaceholder": { es: "handle o link de IG", en: "handle or IG link" },
  "leadgen.igAccounts.add.detected": { es: "Detectado: @{handle}", en: "Detected: @{handle}" },
  "leadgen.igAccounts.add.displayName": { es: "Nombre descriptivo", en: "Descriptive name" },
  "leadgen.igAccounts.add.displayNamePlaceholder": { es: "Ej. Cuenta principal · Kash", en: "E.g. Main account · Kash" },
  "leadgen.igAccounts.add.niche": { es: "Nicho de la cuenta", en: "Account niche" },
  "leadgen.igAccounts.add.nichePlaceholder": { es: "Elige un nicho…", en: "Pick a niche…" },

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

  // ¿Se puede agregar este lead? (banner del alta y el aviso al guardar). Lo
  // arma pages/leadgen/disponibilidadLead.ts con un motivo + sus datos; el
  // status de la creadora y el nombre son DATOS y van tal cual.
  "leadgen.availability.today": { es: "hoy", en: "today" },
  "leadgen.availability.yesterday": { es: "ayer", en: "yesterday" },
  "leadgen.availability.daysAgo": { es: "hace {count} días", en: "{count} days ago" },
  "leadgen.availability.monthAgo": { es: "hace 1 mes", en: "1 month ago" },
  "leadgen.availability.monthsAgo": { es: "hace {count} meses", en: "{count} months ago" },
  "leadgen.availability.thisModel": { es: "Esta modelo", en: "This model" },
  "leadgen.availability.canAddAgain": {
    es: "Puedes volver a agregarla como lead.",
    en: "You can add her as a lead again.",
  },
  "leadgen.availability.activeCreatorTitle": { es: "Es modelo activa de la agencia", en: "She's an active model at the agency" },
  "leadgen.availability.activeCreatorMsg": {
    es: "{name} ya es creadora con status \"{status}\". No se puede agregar como lead.",
    en: "{name} is already a creator with status \"{status}\". She can't be added as a lead.",
  },
  "leadgen.availability.formerCreatorTitle": { es: "Fue creadora de la agencia", en: "She was a creator at the agency" },
  "leadgen.availability.formerCreatorWaitTitle": { es: "Fue creadora — espera", en: "Former creator — wait" },
  // La primera frase del mensaje, según el status: "terminated" o "leaving".
  "leadgen.availability.terminatedSince": { es: "{name} está terminada {ago}.", en: "{name} was terminated {ago}." },
  "leadgen.availability.leavingSince": { es: "{name} está en retiro {ago}.", en: "{name} started leaving the agency {ago}." },
  "leadgen.availability.terminated": { es: "{name} está terminada.", en: "{name} was terminated." },
  "leadgen.availability.leaving": { es: "{name} está en retiro.", en: "{name} is leaving the agency." },
  "leadgen.availability.wait30.one": {
    es: "Hay que esperar 30 días desde el cambio de estado — falta {count} día.",
    en: "You have to wait 30 days from the status change — {count} day to go.",
  },
  "leadgen.availability.wait30.other": {
    es: "Hay que esperar 30 días desde el cambio de estado — faltan {count} días.",
    en: "You have to wait 30 days from the status change — {count} days to go.",
  },
  "leadgen.availability.otherCreatorTitle": { es: "Ya existe en creadoras", en: "Already in Creators" },
  "leadgen.availability.otherCreatorMsg": {
    es: "{name} ya tiene un registro en creadoras con status \"{status}\".",
    en: "{name} already has a record in Creators with status \"{status}\".",
  },
  "leadgen.availability.closingTitle": { es: "Está en proceso de cierre", en: "She's in the closing process" },
  "leadgen.availability.closingMsg": {
    es: "Esta modelo está en stage \"{stage}\" en Closers{closer}. No se puede agregar como lead.",
    en: "This model is in the \"{stage}\" stage in Closers{closer}. She can't be added as a lead.",
  },
  "leadgen.availability.failedCloseTitle": { es: "Cierre previo fallido", en: "Earlier close attempt failed" },
  "leadgen.availability.failedCloseWaitTitle": { es: "Cierre fallido — espera", en: "Failed close — wait" },
  "leadgen.availability.markedNotInterested": {
    es: "Esta modelo fue marcada \"No interesada\" {ago}.",
    en: "This model was marked \"Not interested\" {ago}.",
  },
  "leadgen.availability.wait60.one": {
    es: "Hay que esperar 60 días desde entonces — falta {count} día.",
    en: "You have to wait 60 days from then — {count} day to go.",
  },
  "leadgen.availability.wait60.other": {
    es: "Hay que esperar 60 días desde entonces — faltan {count} días.",
    en: "You have to wait 60 days from then — {count} days to go.",
  },
  // " por Laura" / " by Laura": quién lo cargó, pegado a "agregado".
  "leadgen.availability.byAgent": { es: " por {name}", en: " by {name}" },
  "leadgen.availability.duplicateWaitTitle": { es: "Lead duplicado — espera", en: "Duplicate lead — wait" },
  "leadgen.availability.duplicateWaitMsg": {
    es: "Este lead fue agregado{by} hace {hours}h. Podrás resubirlo en ~{left}h (regla 24h).",
    en: "This lead was added{by} {hours}h ago. You can add it again in ~{left}h (24h rule).",
  },
  "leadgen.availability.existingTitle": { es: "Lead ya existente en LeadGen", en: "Lead already in LeadGen" },
  "leadgen.availability.existingMsg": {
    es: "Este lead ya fue agregado{by}{when}. Se va a crear como entrada repetida (reactivado).",
    en: "This lead was already added{by}{when}. It will be created as a repeat entry (reactivated).",
  },
  "leadgen.availability.scouterTitle": { es: "Encontrada por Scouter Assist", en: "Found by Scouter Assist" },
  "leadgen.availability.scouterMsg": {
    es: "Esta modelo fue descubierta por Scouter Assist{when}{status}. Puedes agregarla como lead.",
    en: "This model was found by Scouter Assist{when}{status}. You can add her as a lead.",
  },

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
  "leadgen.addContact.missingScreenshots.one": { es: "Falta {count} screenshot", en: "{count} screenshot missing" },
  "leadgen.addContact.missingScreenshots.other": { es: "Faltan {count} screenshots", en: "{count} screenshots missing" },
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

  // Buscador de leads del alta de contacto (components/leadgen/LeadAutocomplete)
  "leadgen.autocomplete.placeholder": {
    es: "Nombre completo (o busca un lead existente)",
    en: "Full name (or search for an existing lead)",
  },
  "leadgen.autocomplete.unlink": { es: "Quitar asociación al lead", en: "Unlink from the lead" },
  "leadgen.autocomplete.searching": { es: "Buscando…", en: "Searching…" },
  "leadgen.autocomplete.noMatches": {
    es: "Sin leads que matcheen. Si el lead no existe, agregalo primero en LeadGen.",
    en: "No matching leads. If the lead doesn't exist, add it in LeadGen first.",
  },
  "leadgen.autocomplete.hasPhone": { es: "📞 ya tiene tel", en: "📞 has a phone" },

  // Subida de capturas (components/leadgen/EvidenceUploader)
  "leadgen.uploader.defaultLabel": { es: "Evidencia", en: "Evidence" },
  "leadgen.uploader.missing": { es: " · faltan {count}", en: " · {count} missing" },
  "leadgen.uploader.full": { es: "Llegaste al máximo", en: "You've reached the limit" },
  "leadgen.uploader.uploadOrPaste": { es: "Subir o pegar imágenes", en: "Upload or paste images" },
  "leadgen.uploader.clickToChoose": { es: "Click para elegir", en: "Click to choose" },
  "leadgen.uploader.dragAndDrop": { es: "arrastrar y soltar", en: "drag and drop" },
  "leadgen.uploader.remove": { es: "Quitar", en: "Remove" },
  "leadgen.uploader.needAtLeast.one": {
    es: "Necesitas al menos {count} imagen para guardar.",
    en: "You need at least {count} image to save.",
  },
  "leadgen.uploader.needAtLeast.other": {
    es: "Necesitas al menos {count} imágenes para guardar.",
    en: "You need at least {count} images to save.",
  },

  // Ver las capturas subidas (components/leadgen/EvidenceViewer: detalle del
  // lead y ficha de Closers)
  "leadgen.viewer.title": { es: "Evidencia", en: "Evidence" },
  "leadgen.viewer.loading": { es: "Cargando evidencia…", en: "Loading evidence…" },
  "leadgen.viewer.emptyLead": { es: "Sin archivos adjuntos para este lead.", en: "No files attached to this lead." },
  "leadgen.viewer.emptyContact": {
    es: "Sin archivos adjuntos para este contacto.",
    en: "No files attached to this contact.",
  },
  "leadgen.viewer.thumbAlt": { es: "evidencia {n}", en: "evidence {n}" },
  "leadgen.viewer.imageAlt": { es: "evidencia", en: "evidence" },
  "leadgen.viewer.imageOf": { es: "Imagen {index} de {total}", en: "Image {index} of {total}" },
  "leadgen.viewer.uploaded": { es: "Subido {date}", en: "Uploaded {date}" },
  "leadgen.viewer.by": { es: " · por {name}", en: " · by {name}" },

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
