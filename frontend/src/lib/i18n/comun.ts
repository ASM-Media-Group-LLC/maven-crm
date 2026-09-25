// Vocabulario común (lo que se repite entre módulos) y las claves sueltas que
// no tienen un módulo propio todavía.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_COMUN = ["common.", "avisos.", "audio.", "papelera."] as const;

export const comun = {
  // Comunes (reusables entre módulos)
  "common.cancel": { es: "Cancelar", en: "Cancel" },
  "common.all": { es: "Todos", en: "All" },
  "common.loading": { es: "Cargando…", en: "Loading…" },
  "common.noResults": { es: "Sin resultados.", en: "No results." },
  "common.error": { es: "Error", en: "Error" },
  "common.reply": { es: "Responder", en: "Reply" },
  "common.react": { es: "Reaccionar", en: "React" },
  "common.file": { es: "Archivo", en: "File" },
  "common.clear": { es: "Vaciar", en: "Clear" },
  "common.delete": { es: "Eliminar", en: "Delete" },
  "common.searchPerson": { es: "Buscar persona…", en: "Search person…" },
  "common.unassigned": { es: "Sin asignar", en: "Unassigned" },
  "common.removeAllAssignees": { es: "Quitar todos", en: "Unassign all" },

  // ─── Vocabulario común (i18n fase 2) ───────────────────────────────────────
  // 260 textos se repiten 3 veces o más y explican 1.769 de las 5.733 apariciones
  // de español de la app. Están acá para traducirse UNA vez. Antes de inventar una
  // clave nueva en un módulo, buscá si ya existe acá.

  // Acciones
  "common.save": { es: "Guardar", en: "Save" },
  "common.edit": { es: "Editar", en: "Edit" },
  "common.create": { es: "Crear", en: "Create" },
  "common.add": { es: "Agregar", en: "Add" },
  "common.send": { es: "Enviar", en: "Send" },
  "common.close": { es: "Cerrar", en: "Close" },
  "common.back": { es: "Volver", en: "Back" },
  "common.view": { es: "Ver", en: "View" },
  "common.viewDetail": { es: "Ver detalle", en: "View detail" },
  "common.next": { es: "Siguiente", en: "Next" },
  "common.previous": { es: "Anterior", en: "Previous" },
  "common.search": { es: "Buscar", en: "Search" },
  "common.select": { es: "Seleccionar", en: "Select" },
  "common.selectEllipsis": { es: "Seleccionar...", en: "Select..." },
  "common.clearSearch": { es: "Limpiar búsqueda", en: "Clear search" },
  "common.copy": { es: "Copiar", en: "Copy" },
  "common.confirm": { es: "Confirmar", en: "Confirm" },
  "common.understood": { es: "Entendido", en: "Got it" },
  "common.retry": { es: "Reintentar", en: "Retry" },
  "common.continue": { es: "Continuar", en: "Continue" },
  "common.download": { es: "Descargar", en: "Download" },

  // Campos de formulario y columnas de tabla
  "common.name": { es: "Nombre", en: "Name" },
  "common.fullName": { es: "Nombre completo", en: "Full name" },
  "common.date": { es: "Fecha", en: "Date" },
  "common.average": { es: "Promedio", en: "Average" },
  "common.actions": { es: "Acciones", en: "Actions" },
  "common.couldNotCreate": { es: "No se pudo crear", en: "Couldn't create" },
  "common.dateRange": { es: "Rango de fechas", en: "Date range" },
  "common.startDate": { es: "Fecha de inicio", en: "Start date" },
  "common.endDate": { es: "Fecha de fin", en: "End date" },
  "common.deadline": { es: "Fecha límite", en: "Deadline" },
  "common.birthDate": { es: "Fecha de nacimiento", en: "Date of birth" },
  "common.description": { es: "Descripción", en: "Description" },
  "common.title": { es: "Título", en: "Title" },
  "common.phone": { es: "Teléfono", en: "Phone" },
  "common.country": { es: "País", en: "Country" },
  "common.city": { es: "Ciudad", en: "City" },
  "common.address": { es: "Dirección", en: "Address" },
  "common.email": { es: "Correo", en: "Email" },
  "common.user": { es: "Usuario", en: "User" },
  "common.team": { es: "Equipo", en: "Team" },
  "common.company": { es: "Compañía", en: "Company" },
  "common.code": { es: "Código", en: "Code" },
  "common.number": { es: "Número", en: "Number" },
  "common.type": { es: "Tipo", en: "Type" },
  "common.category": { es: "Categoría", en: "Category" },
  "common.status": { es: "Estado", en: "Status" },
  "common.reason": { es: "Razón", en: "Reason" },
  "common.position": { es: "Posición", en: "Position" },
  "common.duration": { es: "Duración", en: "Duration" },
  "common.role": { es: "Rol", en: "Role" },
  "common.area": { es: "Área", en: "Area" },
  "common.method": { es: "Método", en: "Method" },
  "common.period": { es: "Período", en: "Period" },
  "common.location": { es: "Ubicación", en: "Location" },
  "common.note": { es: "Nota", en: "Note" },

  // Estados
  "common.pending": { es: "Pendiente", en: "Pending" },
  "common.pendingPl": { es: "Pendientes", en: "Pending" },
  "common.active": { es: "Activo", en: "Active" },
  "common.activeF": { es: "Activa", en: "Active" },
  "common.activePl": { es: "Activos", en: "Active" },
  "common.inactive": { es: "Inactivo", en: "Inactive" },
  "common.inProgress": { es: "En progreso", en: "In progress" },
  "common.waiting": { es: "En espera", en: "Waiting" },
  "common.paused": { es: "En pausa", en: "Paused" },
  "common.completed": { es: "Completado", en: "Completed" },
  "common.critical": { es: "Crítico", en: "Critical" },
  "common.new": { es: "Nuevo", en: "New" },
  "common.newF": { es: "Nueva", en: "New" },
  "common.none": { es: "Ninguno", en: "None" },
  "common.comingSoon": { es: "Próximamente", en: "Coming soon" },

  // Filtros. El español distingue género donde el inglés no: «Todos» y «Todas»
  // son la MISMA palabra en inglés pero NO se pueden unificar en una sola clave,
  // porque cada pantalla necesita la suya en español.
  "common.allF": { es: "Todas", en: "All" },
  "common.allStatuses": { es: "Todos los estados", en: "All statuses" },
  "common.allTypes": { es: "Todos los tipos", en: "All types" },
  "common.today": { es: "Hoy", en: "Today" },
  "common.thisWeek": { es: "Esta semana", en: "This week" },
  "common.thisMonth": { es: "Este mes", en: "This month" },
  "common.entireHistory": { es: "Todo el histórico", en: "All time" },
  "common.entireCompany": { es: "Toda la empresa", en: "Whole company" },

  // Vacío y carga
  "common.noResultsShort": { es: "Sin resultados", en: "No results" },
  "common.noData": { es: "Sin datos", en: "No data" },
  "common.noDataDot": { es: "Sin datos.", en: "No data." },
  "common.noDataInRange": { es: "Sin datos en el rango.", en: "No data in this range." },
  "common.noMatches": { es: "No hay coincidencias con los filtros aplicados.", en: "Nothing matches the filters you applied." },

  // Errores y avisos. Los mensajes que se repiten pantalla por pantalla; los que
  // dicen algo específico van en la clave de su módulo.
  "common.errorDeleting": { es: "Error al eliminar", en: "Couldn't delete" },
  "common.errorUpdating": { es: "Error al actualizar", en: "Couldn't update" },
  "common.errorCreating": { es: "Error al crear", en: "Couldn't create" },
  "common.errorSaving": { es: "Error al guardar", en: "Couldn't save" },
  "common.errorAssigning": { es: "Error al asignar", en: "Couldn't assign" },
  "common.couldNotSave": { es: "No se pudo guardar", en: "Couldn't save" },
  "common.couldNotDelete": { es: "No se pudo eliminar", en: "Couldn't delete" },
  "common.couldNotSend": { es: "No se pudo enviar", en: "Couldn't send" },
  "common.couldNotUpdate": { es: "No se pudo actualizar", en: "Couldn't update" },
  "common.couldNotCopy": { es: "No se pudo copiar", en: "Couldn't copy" },
  "common.couldNotUpload": { es: "No se pudo subir", en: "Couldn't upload" },
  "common.sessionExpired": { es: "Sesión expirada", en: "Session expired" },
  "common.invalidEmail": { es: "Email inválido", en: "Invalid email" },
  "common.requiredFields": { es: "Completa los campos requeridos", en: "Fill in the required fields" },
  "common.noAccess": { es: "Sin acceso", en: "No access" },
  "common.noPermission": { es: "No tienes permiso para ver este recurso.", en: "You don't have permission to view this resource." },

  // Diálogos de confirmación
  "common.cannotBeUndone": { es: "Esta acción no se puede deshacer.", en: "This can't be undone." },

  // Unidades de tiempo
  "common.day": { es: "Día", en: "Day" },
  "common.days": { es: "Días", en: "Days" },
  "common.month": { es: "Mes", en: "Month" },
  "common.months": { es: "Meses", en: "Months" },
  "common.hour": { es: "Hora", en: "Hour" },
  "common.hours": { es: "Horas", en: "Hours" },
  "common.totalHours": { es: "Horas totales", en: "Total hours" },
  "common.minutes": { es: "Minutos", en: "Minutes" },
  "common.week": { es: "Semana", en: "Week" },

  // Aviso de mención dentro de Maven (useMessengerNotifications → avisarPersona).
  "avisos.abrir": { es: "Abrir", en: "Open" },

  // Admin › Papelera (PapeleraTabla)
  "papelera.noCargo": { es: "No pude cargar las cuentas eliminadas", en: "Couldn't load the deleted accounts" },

  // Compresión de audio (lib/audioCompress.ts). Van por traducir() y no por el
  // hook: el archivo no es un componente, y el texto se arma en el momento de
  // mostrar el toast de progreso.
  "audio.decoding": { es: "Decodificando audio…", en: "Decoding audio…" },
  "audio.downsampling": { es: "Bajando sample rate…", en: "Lowering sample rate…" },
  "audio.encoding": { es: "Codificando mp3…", en: "Encoding mp3…" },
  // Los errores que arma adminInvoke (lib/adminInvoke.ts) y muestran las pantallas.
  "common.sessionExpiredRelogin": {
    es: "Tu sesión expiró. Por favor, vuelve a iniciar sesión.",
    en: "Your session expired. Please sign in again.",
  },
  "common.noPermissionAction": {
    es: "No tienes permisos para realizar esta acción.",
    en: "You don't have permission to do this.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
