// Lo compartido: los textos de los hooks (hooks/), de las primitivas de la
// interfaz (components/ui/) y de lib/ que se ven en varias pantallas a la vez.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
//
// ⚠️ LO QUE NO PASA POR ACÁ, a propósito: los mensajes de sistema que se
// insertan en chat_messages o chatter_messages, las notificaciones que se
// guardan en la base, el correo del reporte del evaluador y cualquier cosa que
// lea OTRA persona. Eso es dato y tiene su propio idioma.
export const PREFIJOS_COMPARTIDO = ["shared."] as const;

export const compartido = {
  // ─── Messenger: avisos de hooks/useChat.ts ─────────────────────────────────
  "shared.chat.offlineOpen": {
    es: "Sin conexión: no pude abrir el chat. Inténtalo de nuevo.",
    en: "You're offline: couldn't open the chat. Try again.",
  },
  "shared.chat.errorCreatingConversation": { es: "Error al crear conversación", en: "Couldn't create the conversation" },
  "shared.chat.errorCreatingGroup": { es: "Error al crear grupo", en: "Couldn't create the group" },
  "shared.chat.groupDailyLimit": {
    es: "Ya creaste 30 grupos en las últimas 24 horas. Inténtalo más tarde.",
    en: "You've created 30 groups in the last 24 hours. Try again later.",
  },
  "shared.chat.directDailyLimit": {
    es: "Ya abriste 100 chats nuevos en las últimas 24 horas. Inténtalo más tarde.",
    en: "You've started 100 new chats in the last 24 hours. Try again later.",
  },
  "shared.chat.groupCreated": { es: "Grupo \"{name}\" creado", en: "Group \"{name}\" created" },
  "shared.chat.conversationDeleted": { es: "Conversación eliminada", en: "Conversation deleted" },
  "shared.chat.errorDeletingConversation": { es: "Error al eliminar conversación", en: "Couldn't delete the conversation" },
  "shared.chat.couldNotMute": { es: "No se pudo silenciar", en: "Couldn't mute" },
  "shared.chat.couldNotUnmute": { es: "No se pudo reactivar", en: "Couldn't unmute" },
  "shared.chat.waitUntilSent": {
    es: "Espera a que el mensaje termine de enviarse",
    en: "Wait until the message finishes sending",
  },
  "shared.chat.errorEditingMessage": { es: "Error al editar mensaje", en: "Couldn't edit the message" },
  "shared.chat.errorDeletingMessage": { es: "Error al eliminar mensaje", en: "Couldn't delete the message" },

  // ─── Messenger: el aviso de mensaje nuevo (hooks/useMessengerNotifications) ─
  // Lo ve quien RECIBE, en su pantalla y en su idioma: no es el mensaje.
  "shared.msgNotif.file": { es: "📎 Archivo", en: "📎 File" },
  "shared.msgNotif.message": { es: "Mensaje", en: "Message" },
  "shared.msgNotif.newMessage": { es: "Nuevo mensaje", en: "New message" },
  "shared.msgNotif.someone": { es: "Alguien", en: "Someone" },
  "shared.msgNotif.group": { es: "Grupo", en: "Group" },
  "shared.msgNotif.wroteIn": { es: "💬 {name} escribió en {title}", en: "💬 {name} wrote in {title}" },
  "shared.msgNotif.wroteYou": { es: "💬 {name} te escribió", en: "💬 {name} messaged you" },

  // ─── Llamadas (hooks/useLiveKit.ts): Messenger y Cowork ────────────────────
  "shared.call.connectFailed": {
    es: "No se pudo conectar con el servidor de video ({host}). Verifica que LiveKit esté activo y que HTTPS/WSS en el puerto 443 sea accesible.",
    en: "Couldn't connect to the video server ({host}). Check that LiveKit is running and that HTTPS/WSS on port 443 is reachable.",
  },
  "shared.call.micStopped": { es: "Tu micrófono dejó de enviar audio", en: "Your microphone stopped sending audio" },
  "shared.call.micStoppedDesc": {
    es: "El sistema lo silenció o lo tomó otro programa (pasa al compartir pantalla con audio o al cambiar de dispositivo). Apaga y vuelve a prender el micrófono.",
    en: "The system muted it or another app took it (this happens when you share your screen with audio or switch devices). Turn your microphone off and on again.",
  },
  "shared.call.micDisconnected": { es: "Tu micrófono se desconectó", en: "Your microphone disconnected" },
  "shared.call.micDisconnectedDesc": {
    es: "Nadie te escucha. Apaga y vuelve a prender el micrófono, o revisa el dispositivo.",
    en: "Nobody can hear you. Turn your microphone off and on again, or check the device.",
  },
  "shared.call.notHeard": { es: "Dejaron de escucharte", en: "People can't hear you anymore" },
  "shared.call.notHeardDesc": {
    es: "Tu micrófono figura encendido pero no está saliendo al aire. El sistema lo silenció o lo tomó otro programa.",
    en: "Your microphone shows as on, but no audio is going out. The system muted it or another app took it.",
  },
  "shared.call.repair": { es: "Reparar", en: "Fix it" },
  "shared.call.bgGone": { es: "Tu fondo ya no está disponible", en: "Your background is no longer available" },
  "shared.call.bgGoneDesc": {
    es: "Se quitó el efecto y tu cámara sale sin fondo. Elige otro cuando quieras.",
    en: "The effect was removed and your camera is on without a background. Pick another one whenever you want.",
  },
  "shared.call.bgFailed": { es: "No se pudo poner tu fondo", en: "Couldn't set your background" },
  "shared.call.bgApplyFailed": { es: "No se pudo aplicar tu fondo", en: "Couldn't apply your background" },
  "shared.call.bgFailedDesc": {
    es: "Tu cámara está saliendo sin fondo. Vuelve a elegirlo para reintentar.",
    en: "Your camera is on without a background. Pick it again to retry.",
  },
  "shared.call.someoneMutedYou": { es: "Alguien silenció tu micrófono", en: "Someone muted your microphone" },
  "shared.call.canTurnBackOn": {
    es: "Puedes volver a activarlo cuando quieras.",
    en: "You can turn it back on whenever you want.",
  },
  "shared.call.micSilent": { es: "Tu micrófono no está captando nada", en: "Your microphone isn't picking anything up" },
  "shared.call.micSilentDesc": {
    es: "Revisa que sea el dispositivo correcto y que no esté silenciado por el sistema.",
    en: "Check that it's the right device and that the system hasn't muted it.",
  },
  "shared.call.ncOff": { es: "Cancelación de ruido apagada", en: "Noise cancellation turned off" },
  "shared.call.ncOffDesc": {
    es: "El filtro dejó de procesar tu voz y te habrían dejado de escuchar. Sigues al aire sin él; puedes volver a activarlo desde el botón.",
    en: "The filter stopped processing your voice and people would have stopped hearing you. You're still on the air without it; you can turn it back on from the button.",
  },
  "shared.call.micWontStart": { es: "No pude encender el micrófono", en: "Couldn't turn on your microphone" },
  "shared.call.micWontStartDesc": {
    es: "Otro programa puede tenerlo tomado. Prueba a elegir otro micrófono en el menú de la llamada y volver al de siempre.",
    en: "Another app may be using it. Try picking a different microphone in the call menu and then switching back to your usual one.",
  },
  "shared.call.micReconnecting": { es: "Reconectando el micrófono…", en: "Reconnecting your microphone…" },
  "shared.call.micReconnected": { es: "Micrófono reconectado", en: "Microphone reconnected" },
  "shared.call.micReconnectFailed": { es: "No pude reconectar el micrófono", en: "Couldn't reconnect your microphone" },
  "shared.call.micReconnectFailedDesc": {
    es: "Prueba a elegir otro micrófono en el menú de la llamada y volver al de siempre.",
    en: "Try picking a different microphone in the call menu and then switching back to your usual one.",
  },
  "shared.call.screenShareUnavailable": {
    es: "Compartir pantalla no está disponible aquí",
    en: "Screen sharing isn't available here",
  },
  "shared.call.screenShareUnavailableDesc": {
    es: "Los teléfonos no lo permiten. Hazlo desde la computadora.",
    en: "Phones don't support it. Do it from a computer.",
  },
  "shared.call.screenShareFailed": { es: "No se pudo compartir la pantalla", en: "Couldn't share your screen" },
  "shared.call.you": { es: "Tú", en: "You" },
  "shared.call.notInCall": { es: "No estás en una llamada", en: "You're not in a call" },
  "shared.call.actionFailed": { es: "No se pudo aplicar la acción", en: "Couldn't apply the action" },

  // Por qué falló compartir pantalla (lib/compartirPantalla.ts).
  "shared.screenShare.phones": {
    es: "Los teléfonos no permiten compartir la pantalla. Hazlo desde la computadora.",
    en: "Phones can't share their screen. Do it from a computer.",
  },
  "shared.screenShare.notFound": {
    es: "No se encontró ninguna pantalla para compartir.",
    en: "No screen was found to share.",
  },
  "shared.screenShare.failed": { es: "No se pudo compartir la pantalla.", en: "Couldn't share the screen." },

  // Avisos con cara dentro de la llamada (lib/avisosDeLlamada.ts). Los arma quien
  // los RECIBE a partir de un evento, así que salen en su idioma.
  "shared.callNotice.someoneFromMaven": { es: "Alguien de Maven", en: "Someone from Maven" },
  "shared.callNotice.guest": { es: "Un invitado", en: "A guest" },
  "shared.callNotice.left": { es: "{name} salió de la reunión", en: "{name} left the meeting" },
  "shared.callNotice.mutedYou": { es: "{name} silenció tu micrófono", en: "{name} muted your microphone" },
  "shared.callNotice.mutedOther": { es: "{by} silenció a {name}", en: "{by} muted {name}" },
  "shared.callNotice.mutedAll": { es: "{name} silenció a todos", en: "{name} muted everyone" },
  "shared.callNotice.canUnmuteMic": {
    es: "Puedes volver a activar tu micrófono cuando quieras.",
    en: "You can turn your microphone back on whenever you want.",
  },
  "shared.callNotice.recording": { es: "{name} empezó a grabar la reunión", en: "{name} started recording the meeting" },
  "shared.callNotice.recordingDesc": {
    es: "Toda la sala ve el punto rojo mientras dure.",
    en: "Everyone in the room sees the red dot while it lasts.",
  },
  "shared.callNotice.recordingStopped": { es: "{name} detuvo la grabación", en: "{name} stopped the recording" },

  // El cartel de "abierto en otra pestaña" (lib/sesionDuplicada.ts).
  "shared.otherTab.title": { es: "Abierto en otra ventana", en: "Open in another window" },
  "shared.otherTab.detail": {
    es: "Tu cuenta abrió esto en otra pestaña o dispositivo. Solo puede estar activa en un lugar a la vez.",
    en: "Your account opened this in another tab or device. It can only be active in one place at a time.",
  },
  "shared.otherTab.useHere": { es: "Usar aquí", en: "Use here" },

  // ─── Evaluador de chatters (hooks/useChatterEvaluator.ts) ──────────────────
  // Solo los avisos y errores de pantalla. Los criterios originales, el mensaje
  // de compra que se guarda en el chat y la notificación del veredicto son dato.
  "shared.evaluator.keyRequired": { es: "La clave interna es obligatoria", en: "The internal key is required" },
  "shared.evaluator.keyExists": { es: "Ya existe un perfil con esa clave", en: "A profile with that key already exists" },
  "shared.evaluator.mustBeImage": { es: "El archivo debe ser una imagen.", en: "The file must be an image." },
  "shared.evaluator.notSignedIn": { es: "No autenticado", en: "Not signed in" },
  "shared.evaluator.nameEmpty": { es: "El nombre no puede estar vacío", en: "The name can't be empty" },
  "shared.evaluator.invalidMinutes": { es: "Minutos inválidos", en: "Invalid minutes" },
  "shared.evaluator.messageNotFound": { es: "mensaje no encontrado", en: "message not found" },
  "shared.evaluator.noEvaluation": { es: "No hay evaluación para esta sesión", en: "There's no evaluation for this session" },
  "shared.evaluator.noRecipients": { es: "Reporte sin destinatarios", en: "The report has no recipients" },
  "shared.evaluator.noRecipientsDesc": {
    es: "Configura emails en Admin → Notificaciones.",
    en: "Set up emails in Admin → Notifications.",
  },
  "shared.evaluator.emailNotSent": { es: "Email no enviado", en: "Email not sent" },
  "shared.evaluator.emailNotSentDesc": {
    es: "Falló send-notification-email — la evaluación quedó guardada.",
    // Sin comillas invertidas: es la descripción de un aviso y se verían tal cual.
    en: "Couldn't send the email — the evaluation was saved.",
  },
  "shared.evaluator.reportSent": { es: "Reporte enviado", en: "Report sent" },
  "shared.evaluator.reportSentDesc": {
    es: "Email a {count} destinatario(s) vía Maven.",
    en: "Emailed {count} recipient(s) through Maven.",
  },
  "shared.evaluator.webhookFailed": { es: "Reporte: webhook falló", en: "Report: webhook failed" },

  // ─── El pie de "mi tiempo en Cowork" de los tableros (hooks/useMiTiempoCowork)
  "shared.coworkTime.loading": { es: "cargando…", en: "loading…" },
  "shared.coworkTime.none": { es: "sin tiempo en Cowork en el rango", en: "no Cowork time in this range" },
  "shared.coworkTime.dayOne": { es: "{n} día", en: "{n} day" },
  "shared.coworkTime.dayMany": { es: "{n} días", en: "{n} days" },
  "shared.coworkTime.inRoom": { es: "{hours} h en sala", en: "{hours} h in the room" },
  "shared.coworkTime.inMeet": { es: "{hours} h en meet grupal", en: "{hours} h in group meets" },

  // ─── Primitivas de components/ui/ (lo que muestran si la pantalla no pasa nada)
  "shared.ui.searchEllipsis": { es: "Buscar…", en: "Search…" },
  // El de SearchableSelect: con "…" (un solo carácter), como antes; common.selectEllipsis lleva tres puntos.
  "shared.ui.selectEllipsis": { es: "Seleccionar…", en: "Select…" },
  "shared.ui.apply": { es: "Aplicar", en: "Apply" },
  "shared.ui.moreActions": { es: "Más acciones", en: "More actions" },
  "shared.ui.searchCountry": { es: "Buscar país...", en: "Search country..." },
  "shared.ui.notFound": { es: "No encontrado", en: "Not found" },
  "shared.ui.selectDate": { es: "Seleccionar fecha", en: "Select a date" },
  "shared.ui.dateFormatHint": { es: "dd/mm/aaaa", en: "dd/mm/yyyy" },
  "shared.ui.selectDates": { es: "Seleccionar fechas", en: "Select dates" },
  "shared.ui.quickPicks": { es: "Acceso rápido", en: "Quick picks" },
  "shared.ui.range.all": { es: "Todo", en: "All time" },
  "shared.ui.range.yesterday": { es: "Ayer", en: "Yesterday" },
  "shared.ui.range.lastWeek": { es: "Semana pasada", en: "Last week" },
  "shared.ui.range.lastMonth": { es: "Mes pasado", en: "Last month" },

  // ─── Compresión de audio antes de transcribir (lib/audioCompress.ts) ───────
  // Errores que la pantalla muestra tal cual (el `message` del Error).
  "shared.audio.encoderFailed": { es: "No se pudo cargar el codificador mp3.", en: "Couldn't load the mp3 encoder." },
  "shared.audio.done": { es: "Listo", en: "Done" },
  "shared.audio.tooLarge": {
    es: "El audio comprimido pesa {mb}MB, supera el límite de {limitMb}MB de Whisper. Prueba recortar la llamada (la duración aprox. máxima es ~140 min) o dividirla en partes.",
    en: "The compressed audio is {mb}MB, over Whisper's {limitMb}MB limit. Try trimming the call (the approximate maximum is ~140 min) or splitting it into parts.",
  },

  // ─── Errores del inicio de sesión (lib/authErrors.ts) ──────────────────────
  "shared.authError.generic": {
    es: "No se pudo iniciar sesión. Intenta de nuevo en un momento.",
    en: "Couldn't sign in. Try again in a moment.",
  },
  "shared.authError.invalidCredentials": {
    es: "Correo o contraseña incorrectos. Revisa e intenta de nuevo.",
    en: "Wrong email or password. Check them and try again.",
  },
  "shared.authError.emailNotConfirmed": {
    es: "Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y el spam) antes de entrar.",
    en: "Your email isn't confirmed yet. Check your inbox (and spam) before signing in.",
  },
  "shared.authError.tooManyAttempts": {
    es: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    en: "Too many attempts. Wait a moment and try again.",
  },
  "shared.authError.banned": {
    es: "Esta cuenta está suspendida. Contacta a un administrador.",
    en: "This account is suspended. Contact an administrator.",
  },
  "shared.authError.network": {
    es: "No se pudo conectar con el servidor. Revisa tu conexión a internet.",
    en: "Couldn't reach the server. Check your internet connection.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
