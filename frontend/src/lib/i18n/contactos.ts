// Contactos.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
//
// ⚠️ Acá van solo las ETIQUETAS. Los valores que viajan como dato no se
// traducen: contact_kind ('modelo' | 'agencia' | 'ex_creadora'), status,
// source, la categoría/prioridad (A+…C, Alta/Media/Baja, que se guardan en
// physical_appearance), la plataforma "Otra" y los estados que se escriben en
// closers_contacts.status / contact_interactions.resulting_status.
export const PREFIJOS_CONTACTOS = ["contactos."] as const;

export const contactos = {
  // Directorio (ContactosContent)
  "contactos.directoryTitle": { es: "Directorio de Contactos", en: "Contact directory" },
  "contactos.livePipeline": { es: "{count} en pipeline vivo", en: "{count} in the live pipeline" },
  "contactos.inDirectory": { es: "{count} en el directorio", en: "{count} in the directory" },
  "contactos.audit": { es: "Auditoría", en: "Audit" },
  "contactos.auditTitle": { es: "Auditoría de cambios", en: "Change audit" },
  "contactos.createdDate": { es: "Fecha creación", en: "Created date" },
  "contactos.addContact": { es: "Agregar Contacto", en: "Add contact" },
  "contactos.notApplicable": { es: "No aplicable", en: "N/A" },
  "contactos.noContactsFound": { es: "No se encontraron contactos.", en: "No contacts found." },

  // Filtros (ContactosFilters)
  "contactos.searchPlaceholder": { es: "Buscar por ticket, nombre, handle...", en: "Search by ticket, name, handle..." },
  "contactos.searchPlaceholderPhone": {
    es: "Buscar por ticket, nombre, handle, teléfono...",
    en: "Search by ticket, name, handle, phone...",
  },
  "contactos.kindModels": { es: "Modelos", en: "Models" },
  "contactos.kindAgencies": { es: "Agencias", en: "Agencies" },
  "contactos.agent": { es: "Agente", en: "Agent" },
  "contactos.searchAgent": { es: "Buscar agente...", en: "Search agent..." },
  "contactos.salesChannel": { es: "Canal de venta", en: "Sales channel" },
  "contactos.notContacted": { es: "Sin contactar", en: "Not contacted" },
  "contactos.twoPlusChannels": { es: "2+ canales", en: "2+ channels" },
  "contactos.oneChannel": { es: "1 canal", en: "1 channel" },
  "contactos.nChannels": { es: "{count} canales", en: "{count} channels" },
  "contactos.searchChannel": { es: "Buscar canal...", en: "Search channel..." },
  "contactos.special": { es: "Especial", en: "Special" },
  "contactos.contactedTwoPlus": { es: "Contactado por 2+ canales", en: "Contacted through 2+ channels" },
  "contactos.notContactedWhatsapp": { es: "Sin contactar por WhatsApp", en: "Not contacted on WhatsApp" },
  "contactos.clearFilters": { es: "Limpiar filtros", en: "Clear filters" },

  // Prioridad comercial de una agencia (el valor guardado sigue en español)
  "contactos.priorityHigh": { es: "Alta", en: "High" },
  "contactos.priorityMedium": { es: "Media", en: "Medium" },
  "contactos.priorityLow": { es: "Baja", en: "Low" },

  // Categoría física de una modelo (el valor guardado es A+…C)
  "contactos.catAPlus": { es: "A+ (Premium)", en: "A+ (Premium)" },
  "contactos.catA": { es: "A (Alta)", en: "A (High)" },
  "contactos.catBPlus": { es: "B+ (Media Alta)", en: "B+ (Upper mid)" },
  "contactos.catB": { es: "B (Media)", en: "B (Mid)" },
  "contactos.catC": { es: "C (Básica)", en: "C (Basic)" },

  // Estados del contacto. Las CLAVES de los mapas son los valores en español que
  // guarda la base; esto es solo lo que se muestra.
  "contactos.statusNoChange": { es: "Sin cambio", en: "No change" },
  "contactos.statusContacted": { es: "Contactado", en: "Contacted" },
  "contactos.statusInterested": { es: "Interesado", en: "Interested" },
  "contactos.statusDiscarded": { es: "Descartado", en: "Discarded" },
  "contactos.statusConverted": { es: "Convertido", en: "Converted" },
  "contactos.statusRejected": { es: "Rechazado", en: "Rejected" },

  // Tarjeta, tabla y acciones
  "contactos.reactivated": { es: "Reactivado", en: "Reactivated" },
  "contactos.agency": { es: "Agencia", en: "Agency" },
  "contactos.agencyBadgeTitle": {
    es: "Agencia (B2B) — al asignarla a un closer entra al pipeline como venta de plataforma",
    en: "Agency (B2B) — when assigned to a closer it enters the pipeline as a platform sale",
  },
  "contactos.created": { es: "Creación", en: "Created" },
  "contactos.record": { es: "Registro", en: "Record" },
  "contactos.contact": { es: "Contacto", en: "Contact" },
  "contactos.notAssigned": { es: "No asignado", en: "Not assigned" },
  "contactos.convertToCreator": { es: "Convertir a Creador", en: "Convert to creator" },
  "contactos.convertToCreatorF": { es: "Convertir a Creadora", en: "Convert to creator" },
  "contactos.sellPlatform": { es: "Vender plataforma", en: "Sell platform" },
  "contactos.openInstagram": { es: "Abrir Instagram", en: "Open Instagram" },

  // Popup de detalle (ContactoDetailDialog)
  "contactos.noPhoneOnFile": { es: "Sin teléfono cargado", en: "No phone on file" },
  "contactos.callCopyNumber": { es: "Llamar / copiar número", en: "Call / copy number" },
  "contactos.salesChannelsContacted": { es: "Canales de venta contactado", en: "Sales channels contacted" },
  "contactos.noWhatsappContactYet": { es: "Sin contacto por WhatsApp todavía.", en: "No WhatsApp contact yet." },
  "contactos.contactNotes": { es: "Notas de contacto", en: "Contact notes" },
  "contactos.contactN": { es: "contacto {n}", en: "contact {n}" },
  "contactos.history": { es: "Historial", en: "History" },

  // Historial (ContactHistoryView). El título y el detalle de cada evento los arma
  // el RPC get_contact_history en el servidor: son dato y siguen en español.
  "contactos.historyOf": { es: "Historial de {name}", en: "History for {name}" },
  "contactos.historySubtitle": {
    es: "Todo lo que pasó con este contacto en Maven",
    en: "Everything that happened with this contact in Maven",
  },
  "contactos.historyLoadError": { es: "No se pudo cargar el historial.", en: "Couldn't load the history." },
  "contactos.historyEmpty": { es: "Sin historial registrado todavía.", en: "No history recorded yet." },

  // Alta y edición (NuevoContactoForm, EditContactoModal)
  "contactos.breadcrumb": { es: "Contactos", en: "Contacts" },
  "contactos.newContact": { es: "Nuevo Contacto", en: "New contact" },
  "contactos.newContactSubtitle": {
    es: "Agrega un nuevo contacto al directorio de Closers",
    en: "Add a new contact to the Closers directory",
  },
  "contactos.kindLabel": { es: "Tipo de contacto *", en: "Contact type *" },
  "contactos.kindModel": { es: "Modelo / creadora", en: "Model / creator" },
  "contactos.kindAgency": { es: "Agencia (B2B)", en: "Agency (B2B)" },
  "contactos.agencyHintA": {
    es: "Al asignarla a un closer entra al pipeline como",
    en: "When it's assigned to a closer, it enters the pipeline as a",
  },
  "contactos.agencyHintSale": { es: "venta de plataforma", en: "platform sale" },
  "contactos.agencyHintB": { es: "y aparece en el tab", en: "and shows up in the" },
  "contactos.agencyHintTab": { es: "Agencias", en: "Agencies" },
  "contactos.agencyHintC": {
    es: ". Usa la categoría como prioridad y el website/Telegram en las notas.",
    en: " tab. Use the category as the priority, and put the website/Telegram in the notes.",
  },
  "contactos.agencyName": { es: "Nombre de la agencia *", en: "Agency name *" },
  "contactos.contactName": { es: "Nombre del Contacto *", en: "Contact name *" },
  "contactos.agencyNamePlaceholder": { es: "Ej. OnlyModelos", en: "e.g. OnlyModelos" },
  "contactos.priority": { es: "Prioridad *", en: "Priority *" },
  "contactos.physicalCategory": { es: "Categoría Física *", en: "Physical category *" },
  "contactos.priorityPlaceholder": { es: "Alta / Media / Baja", en: "High / Medium / Low" },
  "contactos.selectCategory": { es: "Seleccionar categoría", en: "Select a category" },
  "contactos.companySource": { es: "Compañía / Cuenta de Origen", en: "Company / source account" },
  "contactos.emailPlaceholder": { es: "email@ejemplo.com", en: "email@example.com" },
  "contactos.phoneNumber": { es: "Número de teléfono", en: "Phone number" },
  "contactos.maskedHint": {
    es: "📞 Ves el teléfono/email enmascarados (••••). Para cambiarlos, escribe uno nuevo; si los dejas así, no se modifican.",
    en: "📞 You see the phone/email masked (••••). To change them, type a new one; if you leave them as they are, they stay the same.",
  },
  "contactos.accountLink": { es: "Link de la Cuenta *", en: "Account link *" },
  "contactos.accountLinkPlaceholder": { es: "https://instagram.com/usuario", en: "https://instagram.com/username" },
  "contactos.platform": { es: "Plataforma", en: "Platform" },
  "contactos.platformOther": { es: "Otra", en: "Other" },
  "contactos.onlyfansOptional": { es: "OnlyFans URL (opcional)", en: "OnlyFans URL (optional)" },
  "contactos.onlyfansPlaceholder": { es: "https://onlyfans.com/usuario", en: "https://onlyfans.com/username" },
  "contactos.cityPlaceholder": { es: "Ej: Bogotá, Medellín...", en: "e.g. Bogota, Medellin..." },
  "contactos.cityPlaceholderShort": { es: "Ej: Bogotá", en: "e.g. Bogota" },
  "contactos.ticketNumber": { es: "Número de Ticket", en: "Ticket number" },
  "contactos.ticketPlaceholder": { es: "Ej: CT586864", en: "e.g. CT586864" },
  "contactos.notes": { es: "Notas", en: "Notes" },
  "contactos.notesPlaceholder": { es: "Notas adicionales sobre el contacto...", en: "Additional notes about the contact..." },
  "contactos.profilePhoto": { es: "Foto de Perfil", en: "Profile photo" },
  "contactos.profilePhotoAlt": { es: "Foto de perfil", en: "Profile photo" },
  "contactos.uploadPhoto": { es: "Subir Foto", en: "Upload photo" },
  "contactos.upload": { es: "Subir", en: "Upload" },
  "contactos.extraMedia": { es: "Fotos y Videos Extras", en: "Extra photos and videos" },
  "contactos.extraMediaHint": {
    es: "Formatos: Imágenes y Videos. Máximo 20MB por archivo.",
    en: "Formats: images and videos. Up to 20MB per file.",
  },
  "contactos.uploadFiles": { es: "Subir Archivos", en: "Upload files" },
  "contactos.saving": { es: "Guardando...", en: "Saving..." },
  "contactos.saveContact": { es: "Guardar Contacto", en: "Save contact" },
  "contactos.saveChanges": { es: "Guardar Cambios", en: "Save changes" },
  "contactos.editContact": { es: "Editar Contacto", en: "Edit contact" },
  "contactos.editContactDesc": { es: "Modifica los datos del contacto", en: "Update the contact's details" },

  // Selector de compañía
  "contactos.selectCompany": { es: "Seleccionar compañía", en: "Select a company" },
  "contactos.newCompany": { es: "Nueva compañía", en: "New company" },
  "contactos.companyName": { es: "Nombre de la compañía", en: "Company name" },
  "contactos.searchCompany": { es: "Buscar compañía...", en: "Search company..." },
  "contactos.addNewCompany": { es: "Agregar nueva compañía…", en: "Add new company…" },

  // Validaciones y avisos del alta
  "contactos.nameRequired": { es: "El nombre es obligatorio", en: "Name is required" },
  "contactos.accountLinkRequired": { es: "El link de la cuenta es obligatorio", en: "Account link is required" },
  "contactos.nameAndLinkRequired": {
    es: "Nombre y link de la cuenta son obligatorios",
    en: "Name and account link are required",
  },
  "contactos.checkMarkedFields": { es: "Revisa los campos marcados", en: "Check the highlighted fields" },
  "contactos.inactiveCreatorTitle": { es: "⚠️ Creadora inactiva detectada", en: "⚠️ Inactive creator found" },
  "contactos.inactiveCreatorDesc": {
    es: "{name} tiene estado \"{status}\". Se registrará como contacto reactivado.",
    en: "{name} has status \"{status}\". It will be saved as a reactivated contact.",
  },
  "contactos.ofDuplicateTitle": { es: "❌ OnlyFans duplicado", en: "❌ Duplicate OnlyFans" },
  "contactos.ofDuplicateDesc": {
    es: "Esta URL ya está registrada en {where}{nameInfo}. No se puede registrar.",
    en: "This URL is already registered in {where}{nameInfo}. It can't be registered.",
  },
  "contactos.whereLeads": { es: "leads", en: "leads" },
  "contactos.whereContacts": { es: "contactos", en: "contacts" },
  "contactos.forName": { es: " para \"{name}\"", en: " for \"{name}\"" },
  "contactos.phoneTakenTitle": { es: "⚠️ Teléfono ya registrado", en: "⚠️ Phone already registered" },
  "contactos.phoneTakenDesc": {
    es: "Este número ya está registrado para {name}. El contacto se guardará de todos modos.",
    en: "This number is already registered for {name}. The contact will be saved anyway.",
  },
  "contactos.phoneInCreatorsTitle": { es: "⚠️ Teléfono en creators", en: "⚠️ Phone found in creators" },
  "contactos.phoneInCreatorsDesc": {
    es: "Este número ya existe para la creadora {name}. El contacto se guardará de todos modos.",
    en: "This number already belongs to the creator {name}. The contact will be saved anyway.",
  },
  "contactos.savedToast": { es: "Contacto guardado exitosamente", en: "Contact saved" },
  "contactos.saveError": { es: "Error al guardar contacto", en: "Couldn't save the contact" },
  "contactos.nothingToUpdate": { es: "No hay datos nuevos para actualizar", en: "There's no new data to update" },
  "contactos.updatedToast": { es: "Contacto actualizado exitosamente", en: "Contact updated" },

  // Creadora ya existente / contacto ya existente
  "contactos.existingCreator": { es: "Creadora existente", en: "Existing creator" },
  "contactos.existingCreatorDesc": {
    es: "Esta creadora ya forma parte de la agencia:",
    en: "This creator is already part of the agency:",
  },
  "contactos.viewProfile": { es: "Ver perfil", en: "View profile" },
  "contactos.existingContact": { es: "Contacto existente", en: "Existing contact" },
  "contactos.existingContactDesc": {
    es: "Esta modelo ya está registrada como contacto. Puedes actualizar sus datos o crear un nuevo registro.",
    en: "This model is already registered as a contact. You can update her details or create a new record.",
  },
  "contactos.nameColon": { es: "Nombre:", en: "Name:" },
  "contactos.registeredBy": { es: "Registrado por:", en: "Registered by:" },
  "contactos.dateColon": { es: "Fecha:", en: "Date:" },
  "contactos.currentPhone": { es: "Teléfono actual:", en: "Current phone:" },
  "contactos.currentEmail": { es: "Email actual:", en: "Current email:" },
  "contactos.updating": { es: "Actualizando...", en: "Updating..." },
  "contactos.updateContact": { es: "Actualizar contacto", en: "Update contact" },
  "contactos.createNewRecord": { es: "Crear nuevo registro", en: "Create new record" },

  // Convertir a creadora (ConvertContactoModal)
  "contactos.noContact": { es: "No contacto", en: "No contact" },
  "contactos.convertedToast": { es: "Contacto convertido", en: "Contact converted" },
  "contactos.convertedToastDesc": { es: "El creador fue creado exitosamente.", en: "The creator was created." },
  "contactos.convertError": { es: "Error al convertir", en: "Couldn't convert" },
  "contactos.convertTitle": { es: "Convertir Contacto a Creador", en: "Convert contact to creator" },
  "contactos.convertDesc": {
    es: "Este contacto será transferido al módulo de Creadoras como un nuevo perfil.",
    en: "This contact will be moved to the Creators module as a new profile.",
  },
  "contactos.dataToTransfer": { es: "Datos que se transferirán", en: "Data that will be transferred" },
  "contactos.missingHandleTitle": { es: "Falta el handle de Instagram.", en: "The Instagram handle is missing." },
  "contactos.missingHandleBody": {
    es: "Ningún creador puede entrar al sistema sin handle. Cierra este modal, edita el contacto para agregarlo y vuelve a intentar.",
    en: "No creator can enter the system without a handle. Close this window, edit the contact to add it, and try again.",
  },
  "contactos.convertHint": {
    es: "El contacto quedará marcado como \"Convertido\" y se creará un nuevo perfil en el módulo de Creadoras.",
    en: "The contact will be marked as \"Converted\" and a new profile will be created in the Creators module.",
  },
  "contactos.converting": { es: "Convirtiendo...", en: "Converting..." },
  "contactos.confirmConversion": { es: "Confirmar Conversión", en: "Confirm conversion" },

  // Eliminar (DeleteContactoDialog)
  "contactos.deletedToast": { es: "\"{name}\" eliminado", en: "\"{name}\" deleted" },
  "contactos.deleteTitle": { es: "Eliminar contacto", en: "Delete contact" },
  "contactos.deleteDescA": { es: "Esta acción eliminará permanentemente a", en: "This will permanently delete" },
  "contactos.deleteDescB": {
    es: "y todas sus interacciones asociadas.",
    en: "and all of their related interactions.",
  },
  "contactos.deleting": { es: "Eliminando...", en: "Deleting..." },

  // Vender plataforma / reclutar para Kash (SellPlatformContactDialog)
  "contactos.sellChooseWhat": { es: "Elige qué venderle.", en: "Choose what to sell." },
  "contactos.sellMonetizationRequired": {
    es: "Ingresa la monetización estimada (USD/mes).",
    en: "Enter the estimated monetization (USD/month).",
  },
  "contactos.sellCommissionRange": {
    es: "La comisión debe estar entre 0 y 100.",
    en: "The commission must be between 0 and 100.",
  },
  "contactos.sellAmountRequired": {
    es: "Ingresa el monto mensual de la suscripción.",
    en: "Enter the monthly subscription amount.",
  },
  "contactos.sentToClosers": { es: "Enviado a Closers", en: "Sent to Closers" },
  "contactos.sentKashPool": {
    es: "{name} entró al pool como reclutamiento para Kash.",
    en: "{name} went into the pool as a recruitment for Kash.",
  },
  "contactos.sentKashAssigned": {
    es: "{name} asignado como reclutamiento para Kash.",
    en: "{name} was assigned as a recruitment for Kash.",
  },
  "contactos.sentPlatformPool": {
    es: "{name} entró al pool para vender {platform}.",
    en: "{name} went into the pool to sell {platform}.",
  },
  "contactos.sentPlatformAssigned": {
    es: "{name} asignado para vender {platform}.",
    en: "{name} was assigned to sell {platform}.",
  },
  "contactos.dealCreateError": { es: "No se pudo crear el deal", en: "Couldn't create the deal" },
  "contactos.recruitForKash": { es: "Reclutar para Kash", en: "Recruit for Kash" },
  "contactos.sellKashDesc": {
    es: "entra al pipeline de closers como RECLUTAMIENTO para la agencia: se cierra por comisión % sobre su monetización, no por suscripción.",
    en: "enters the closers pipeline as a RECRUITMENT for the agency: it closes on a % commission of their monetization, not on a subscription.",
  },
  "contactos.sellPlatformDesc": {
    es: "entra al pipeline de closers para venderle una plataforma. Paga una suscripción mensual (sin comisión %).",
    en: "enters the closers pipeline to be sold a platform. They pay a monthly subscription (no % commission).",
  },
  "contactos.whatWeSell": { es: "Qué le vendemos", en: "What we're selling" },
  "contactos.chooseWhatPlaceholder": { es: "Elige qué venderle...", en: "Choose what to sell..." },
  "contactos.kashOption": { es: "Kash — la agencia (reclutar)", en: "Kash — the agency (recruit)" },
  "contactos.estimatedMonetization": { es: "Monetización estimada (USD/mes)", en: "Estimated monetization (USD/month)" },
  "contactos.agencyCommission": { es: "Comisión de la agencia (%)", en: "Agency commission (%)" },
  "contactos.monthlySubscription": { es: "Suscripción mensual (USD)", en: "Monthly subscription (USD)" },
  "contactos.examplePlaceholder": { es: "Ej. {value}", en: "e.g. {value}" },
  "contactos.closerOptional": { es: "Closer (opcional)", en: "Closer (optional)" },
  "contactos.leaveInPool": { es: "Dejar en el pool (sin asignar)", en: "Leave in the pool (unassigned)" },
  "contactos.noName": { es: "Sin nombre", en: "Unnamed" },
  "contactos.creating": { es: "Creando...", en: "Creating..." },
  "contactos.createDeal": { es: "Crear deal", en: "Create deal" },

  // Auditoría de cambios de categoría (CategoryAuditLog, AuditLogModal)
  "contactos.unknown": { es: "Desconocido", en: "Unknown" },
  "contactos.loadingAuditLog": { es: "Cargando log de auditoría…", en: "Loading audit log…" },
  "contactos.loadingRecords": { es: "Cargando registros…", en: "Loading records…" },
  "contactos.noCategoryChanges": {
    es: "No se han registrado cambios de categoría aún.",
    en: "No category changes have been recorded yet.",
  },
  "contactos.noCategoryChangesHint": {
    es: "Cuando un agente cambie la categoría de un contacto, aparecerá aquí.",
    en: "When an agent changes a contact's category, it will show up here.",
  },
  "contactos.totalChanges": { es: "Total cambios", en: "Total changes" },
  "contactos.suspiciousOver24h": { es: "⚠ Sospechosos (>24h)", en: "⚠ Suspicious (>24h)" },
  "contactos.agentsInvolved": { es: "Agentes involucrados", en: "Agents involved" },
  "contactos.showing": { es: "Mostrando", en: "Showing" },
  "contactos.change": { es: "Cambio", en: "Change" },
  "contactos.hoursAfter": { es: "Horas después", en: "Hours after" },
  "contactos.time": { es: "Tiempo", en: "Time" },
  "contactos.risk": { es: "Riesgo", en: "Risk" },
  "contactos.suspicious": { es: "Sospechoso", en: "Suspicious" },
  "contactos.normal": { es: "Normal", en: "Normal" },
  "contactos.auditFooter": {
    es: "Se registra automáticamente cada cambio de categoría. Los cambios realizados más de 24 horas después de la creación del contacto se marcan como sospechosos.",
    en: "Every category change is logged automatically. Changes made more than 24 hours after the contact was created are flagged as suspicious.",
  },
  "contactos.auditLogTitle": { es: "Log de Auditoría — Cambios de Categoría", en: "Audit log — category changes" },
  "contactos.auditSearchPlaceholder": {
    es: "Buscar nombre, handle, ticket, ciudad...",
    en: "Search name, handle, ticket, city...",
  },
  "contactos.allAgents": { es: "Todos los agentes", en: "All agents" },
  "contactos.anyRisk": { es: "Todo riesgo", en: "Any risk" },
  "contactos.suspiciousPl": { es: "⚠ Sospechosos", en: "⚠ Suspicious" },
  "contactos.normalPl": { es: "Normales", en: "Normal" },
  "contactos.clear": { es: "Limpiar", en: "Clear" },
  "contactos.noRecordsForFilters": {
    es: "No se encontraron registros con estos filtros.",
    en: "No records match these filters.",
  },
  "contactos.auditModalFooter": {
    es: "Cambios de categoría registrados automáticamente. Los realizados >24h después de la creación se marcan como sospechosos.",
    en: "Category changes are logged automatically. Those made >24h after creation are flagged as suspicious.",
  },

  // Interacciones (ViewContactoModal)
  "contactos.interactionLogged": { es: "Interacción registrada", en: "Interaction logged" },
  "contactos.addedBy": { es: "· Ingresado por:", en: "· Added by:" },
  "contactos.createdColon": { es: "Creado: {date}", en: "Created: {date}" },
  "contactos.nCalls": { es: "{count} llamadas", en: "{count} calls" },
  "contactos.nNotes": { es: "{count} notas", en: "{count} notes" },
  "contactos.openChat": { es: "Abrir chat", en: "Open chat" },
  "contactos.interactionHistory": { es: "Historial de Interacciones", en: "Interaction history" },
  "contactos.logInteraction": { es: "Registrar Interacción", en: "Log interaction" },
  "contactos.logNote": { es: "Registrar Nota", en: "Log note" },
  "contactos.logCall": { es: "Registrar Llamada", en: "Log call" },
  "contactos.contactColon": { es: "Contacto: {name}", en: "Contact: {name}" },
  "contactos.contactType": { es: "Tipo de Contacto", en: "Contact type" },
  "contactos.noteWritten": { es: "Nota / Mensaje Escrito", en: "Note / written message" },
  "contactos.call": { es: "Llamada", en: "Call" },
  "contactos.note": { es: "Nota", en: "Note" },
  "contactos.interactionNotesPlaceholder": { es: "Notas sobre esta interacción", en: "Notes about this interaction" },
  "contactos.contactStatus": { es: "Estado del Contacto", en: "Contact status" },
  "contactos.attachFiles": {
    es: "Adjuntar Archivos (Fotos/Videos - máx. 10)",
    en: "Attach files (photos/videos - max 10)",
  },
  "contactos.selectFiles": { es: "Seleccionar archivos", en: "Select files" },
  "contactos.noInteractions": {
    es: "No hay interacciones registradas para este contacto.",
    en: "No interactions have been logged for this contact.",
  },
  "contactos.noInteractionsHint": {
    es: "Puedes registrar llamadas, mensajes, emails, reuniones o notas.",
    en: "You can log calls, messages, emails, meetings or notes.",
  },
  "contactos.callNumber": { es: "Llamada #{n}", en: "Call #{n}" },
} as const satisfies Record<string, { es: string; en: string }>;
