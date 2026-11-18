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
  // Un mensaje por API se anuncia con el nombre de la key y la etiqueta, como la
  // campana y el push («BLU (API)»). El nombre es dato y no se traduce.
  "shared.msgNotif.viaApi": { es: "{name} (API)", en: "{name} (API)" },
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
  "shared.call.bgPreparando": { es: "Preparando el fondo… (solo tarda la primera vez)", en: "Getting your background ready… (only slow the first time)" },
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
    es: "El filtro dejó de procesar tu voz y te habrían dejado de escuchar. Sigues al aire sin él; se vuelve a intentar solo la próxima vez que prendas el micrófono.",
    en: "The filter stopped processing your voice and people would have stopped hearing you. You're still on the air without it; it will try again on its own the next time you turn on your microphone.",
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
  "shared.call.ahorroTitulo": { es: "Tu internet de subida está lento", en: "Your upload speed is low" },
  "shared.call.ahorroDesc": { es: "Bajamos un poco la calidad de tu cámara y tu pantalla para que no se te caiga la llamada.", en: "We lowered your camera and screen quality a bit so your call doesn't drop." },
  "shared.call.pantallaCompletaTitulo": { es: "Comparte la PANTALLA COMPLETA", en: "Share your ENTIRE SCREEN" },
  "shared.call.pantallaCompletaDesc": { es: "En Cowork no sirve una pestaña ni una ventana. Vuelve a tocar «Compartir pantalla» y elige «Pantalla completa». Mientras tanto cuentas como «sin pantalla».", en: "In Cowork a tab or a window isn't enough. Tap «Share screen» again and choose «Entire screen». Until then you count as «no screen»." },
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
    es: "Configura en Admin → Notificaciones los correos de cuentas de tu agencia.",
    en: "In Admin → Notifications, add the emails of accounts in your agency.",
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

  // ─── Componentes compartidos de components/ (i18n ola 3) ───────────────────
  // Lo que se guarda en la base NO pasa por aquí: los títulos de conversación de
  // Clari ("Clari · soporte"), el texto de una notificación o de un anuncio, el
  // mensaje de rechazo que manda el servidor al abrir un chat. Eso es dato.

  // Ventanitas: minimizar / agrandar (Clari y la llamada flotante).
  "shared.window.minimize": { es: "Minimizar", en: "Minimize" },
  "shared.window.expand": { es: "Agrandar", en: "Expand" },

  // Historial de chats con Clari (components/AiChatSidebar.tsx)
  "shared.aiChat.newChat": { es: "Nuevo chat", en: "New chat" },
  "shared.aiChat.empty": { es: "Aún no hay conversaciones", en: "No conversations yet" },
  "shared.aiChat.older": { es: "Anteriores", en: "Older" },
  "shared.aiChat.rename": { es: "Renombrar", en: "Rename" },
  "shared.aiChat.deleteTitle": { es: "¿Eliminar conversación?", en: "Delete this conversation?" },
  "shared.aiChat.deleteDesc": {
    es: "Esta acción no se puede deshacer. Se eliminarán todos los mensajes de esta conversación.",
    en: "This can't be undone. All the messages in this conversation will be deleted.",
  },

  // Clari (components/ClariAiChat.tsx + ClariAiFab.tsx). El saludo no se guarda
  // en la base, pero SÍ le llega al modelo como turno del asistente: viaja
  // siempre en español por el campo `content` (el "en" es solo de pantalla).
  "shared.clari.welcomeHelp": {
    es: "¡Hola! 👋 Soy Clari. Te ayudo a navegar Maven — pregúntame cómo hacer cualquier cosa en la app.",
    en: "Hi! 👋 I'm Clari. I'll help you find your way around Maven — ask me how to do anything in the app.",
  },
  "shared.clari.welcomeSales": {
    es: "¡Hola! 👋 Soy tu asistente de ventas. Pídeme rankings, comparativas o tendencias de tus creadoras. Ej: *¿quién factura más esta semana?*",
    en: "Hi! 👋 I'm your sales assistant. Ask me for rankings, comparisons or trends for your creators. E.g.: *who's earning the most this week?*",
  },
  "shared.clari.connectError": { es: "Error al conectar con la IA", en: "Couldn't connect to the AI" },
  "shared.clari.noResponse": { es: "Sin respuesta", en: "No response" },
  "shared.clari.connectionError": { es: "Error de conexión", en: "Connection error" },
  "shared.clari.micError": { es: "Error de micrófono: {error}", en: "Microphone error: {error}" },
  "shared.clari.typing": { es: "Clari escribiendo…", en: "Clari is typing…" },
  "shared.clari.pickChat": { es: "Crea o selecciona un chat para comenzar…", en: "Create or pick a chat to get started…" },
  "shared.clari.listening": { es: "🎙️ Escuchando…", en: "🎙️ Listening…" },
  "shared.clari.askPlaceholder": { es: "Escribe tu pregunta…", en: "Type your question…" },
  "shared.clari.stopRecording": { es: "Detener grabación", en: "Stop recording" },
  "shared.clari.speak": { es: "Hablar", en: "Speak" },
  "shared.clari.open": { es: "Abrir Clari AI", en: "Open Clari AI" },
  "shared.clari.minimize": { es: "Minimizar Clari AI", en: "Minimize Clari AI" },
  "shared.clari.online": { es: "En línea", en: "Online" },
  "shared.clari.modeHelp": { es: "Soporte", en: "Support" },
  "shared.clari.modeCrm": { es: "Pregúntale al CRM", en: "Ask the CRM" },

  // Aviso de mudanza de dominio (components/AvisoMudanzaDominio.tsx). Lo que va
  // entre ** sale resaltado.
  "shared.domainMove.title": { es: "Maven cambió de dirección", en: "Maven has a new address" },
  "shared.domainMove.accessNow": { es: "A partir de ahora el acceso es", en: "From now on, you'll find it at" },
  "shared.domainMove.password": {
    es: "La primera vez te **pedirá tu contraseña otra vez**. Es normal: es una dirección nueva.",
    en: "The first time, it'll **ask for your password again**. That's normal: it's a new address.",
  },
  "shared.domainMove.notifications": {
    es: "El navegador volverá a preguntar por las **notificaciones**. Acéptalas para no perder los avisos de mensajes.",
    en: "Your browser will ask about **notifications** again. Allow them so you don't miss message alerts.",
  },
  "shared.domainMove.bookmark": {
    es: "Actualiza el marcador o el acceso directo que tengas guardado.",
    en: "Update any bookmark or shortcut you have saved.",
  },
  "shared.domainMove.goTo": { es: "Ir a {domain}", en: "Go to {domain}" },
  "shared.domainMove.stayHere": { es: "Seguir aquí por ahora", en: "Stay here for now" },

  // Reloj del computador desfasado (components/AvisoRelojDesfasado.tsx)
  // ─── «Programar envío» (components/programar/ProgramarEnvio.tsx) ───────────
  // Correo y Messenger. Siempre en hora de Colombia (lib/programarEnvio.ts).
  "shared.schedule.title": { es: "Programar envío", en: "Schedule send" },
  "shared.schedule.zone": { es: "Hora estándar de Colombia", en: "Colombia standard time" },
  "shared.schedule.tomorrowMorning": { es: "Mañana a las 8:00 a. m.", en: "Tomorrow at 8:00 AM" },
  "shared.schedule.tomorrowAfternoon": { es: "Mañana a la 1:00 p. m.", en: "Tomorrow at 1:00 PM" },
  "shared.schedule.nextMonday": { es: "El lunes a las 8:00 a. m.", en: "Monday at 8:00 AM" },
  "shared.schedule.custom": { es: "Elegir fecha y hora", en: "Pick date and time" },
  "shared.schedule.customTitle": { es: "Elegir fecha y hora", en: "Pick date and time" },
  "shared.schedule.date": { es: "Fecha", en: "Date" },
  "shared.schedule.datePlaceholder": { es: "DD/MM/AAAA", en: "DD/MM/YYYY" },
  "shared.schedule.time": { es: "Hora", en: "Time" },
  // Sin punto final: la hora ya termina en «a. m.» y quedaba «a. m..».
  "shared.schedule.summary": { es: "Se envía el {fecha} a las {hora}", en: "Sends on {fecha} at {hora}" },
  "shared.schedule.summaryAtOne": { es: "Se envía el {fecha} a la {hora}", en: "Sends on {fecha} at {hora}" },
  "shared.schedule.localTime": { es: "En la hora de tu equipo: {hora}", en: "On your device's clock: {hora}" },
  "shared.schedule.pickHint": {
    es: "Elige el día en el calendario o escríbelo, y la hora.",
    en: "Pick the day on the calendar or type it, and the time.",
  },
  "shared.schedule.error.fecha": { es: "Escribe la fecha como DD/MM/AAAA.", en: "Type the date as DD/MM/YYYY." },
  "shared.schedule.error.hora": { es: "Elige una hora válida.", en: "Pick a valid time." },
  "shared.schedule.error.pasado": { es: "Esa hora ya pasó: elige una más adelante.", en: "That time has passed: pick a later one." },
  "shared.schedule.error.lejos": { es: "Se puede programar hasta un año adelante.", en: "You can schedule up to a year ahead." },
  "shared.schedule.cancel": { es: "Cancelar", en: "Cancel" },
  "shared.schedule.confirm": { es: "Programar envío", en: "Schedule send" },

  "shared.clock.title": { es: "La hora de este computador está mal", en: "This computer's clock is wrong" },
  "shared.clock.behind": { es: "Va {amount} atrasada.", en: "It's {amount} behind." },
  "shared.clock.ahead": { es: "Va {amount} adelantada.", en: "It's {amount} ahead." },
  "shared.clock.why": {
    es: "Maven usa la hora para tu sesión, el reloj de Cowork y tus horarios.",
    en: "Maven uses it for your session, the Cowork clock and your schedules.",
  },
  "shared.clock.howWindows": {
    es: "Para corregirla: Configuración → Hora e idioma → Fecha y hora, y activa «Establecer la hora automáticamente» y «Establecer la zona horaria automáticamente».",
    en: "To fix it: Settings → Time & language → Date & time, and turn on “Set time automatically” and “Set time zone automatically”.",
  },
  "shared.clock.howMac": {
    es: "Para corregirla: Ajustes del Sistema → General → Fecha y hora, y activa «Ajustar fecha y hora automáticamente» y la zona horaria automática.",
    en: "To fix it: System Settings → General → Date & Time, and turn on “Set time and date automatically” and the automatic time zone.",
  },
  "shared.clock.howOther": {
    es: "Para corregirla: en los ajustes de fecha y hora del equipo, activa la hora y la zona horaria automáticas.",
    en: "To fix it: in the device's date and time settings, turn on automatic time and time zone.",
  },
  "shared.clock.fixed": { es: "Ya la corregí", en: "I fixed it" },
  "shared.clock.stillWrong": {
    es: "Todavía está mal. Revisa también la zona horaria.",
    en: "Still wrong. Check the time zone too.",
  },
  "shared.clock.close": { es: "Cerrar aviso", en: "Close notice" },

  // Pantallas de entrar / recuperar contraseña (components/auth/AuthLayout.tsx)
  "shared.authLayout.backHome": { es: "Volver al inicio", en: "Back to home" },
  "shared.authLayout.tagline": {
    es: "La plataforma integral para gestionar, escalar y optimizar tus operaciones.",
    en: "The all-in-one platform to manage, scale and optimize your operations.",
  },

  // Subir archivos de una creadora o un contacto (components/FileUploadModal.tsx)
  "shared.upload.contracts": { es: "Contrato Firmado & Documentos", en: "Signed contract & documents" },
  "shared.upload.piclink": { es: "Fotos de PickLink (Comprobante)", en: "PickLink photos (proof)" },
  "shared.upload.extras": { es: "Fotos y Videos Extras", en: "Extra photos & videos" },
  "shared.upload.formatsContracts": {
    es: "PDF, Word (.doc, .docx) e Imágenes (JPG, PNG, GIF)",
    en: "PDF, Word (.doc, .docx) and images (JPG, PNG, GIF)",
  },
  "shared.upload.formatsPiclink": { es: "Imágenes (JPG, PNG, GIF, WebP)", en: "Images (JPG, PNG, GIF, WebP)" },
  "shared.upload.formatsExtras": {
    es: "Imágenes (JPG, PNG, GIF) y Videos (MP4, MOV)",
    en: "Images (JPG, PNG, GIF) and videos (MP4, MOV)",
  },
  "shared.upload.tooLarge": { es: "Archivo muy grande", en: "File too large" },
  "shared.upload.tooLargeDesc": { es: "{name} excede {max}", en: "{name} is over {max}" },
  "shared.upload.failed": { es: "Error al subir", en: "Upload failed" },
  "shared.upload.done": { es: "{n} archivo(s) subido(s) exitosamente", en: "{n} file(s) uploaded successfully" },
  "shared.upload.pickOrDrag": { es: "Selecciona o arrastra archivos para subir", en: "Select or drag files to upload" },
  "shared.upload.dragHere": { es: "Arrastra archivos aquí o", en: "Drag files here or" },
  "shared.upload.selectFiles": { es: "Seleccionar archivos", en: "Select files" },
  "shared.upload.formats": { es: "Formatos: {formats}", en: "Formats: {formats}" },
  "shared.upload.maxPerFile": { es: "Máximo {max} por archivo", en: "Up to {max} per file" },
  "shared.upload.selected": { es: "Archivos seleccionados ({n})", en: "Selected files ({n})" },
  "shared.upload.remove": { es: "Quitar {name}", en: "Remove {name}" },
  "shared.upload.progress": { es: "Subiendo... {p}%", en: "Uploading... {p}%" },
  "shared.upload.uploading": { es: "Subiendo…", en: "Uploading…" },
  "shared.upload.upload": { es: "Subir", en: "Upload" },

  // La ventanita de la llamada que sigue viva al cambiar de página
  // (components/PersistentCallProvider.tsx)
  "shared.floatCall.inCall": { es: "En llamada", en: "In a call" },
  "shared.floatCall.mutedForYou": {
    es: "Silenciado solo para ti (ellos siguen hablando). Toca para volver a escuchar.",
    en: "Muted just for you (they're still talking). Tap to hear them again.",
  },
  "shared.floatCall.muteForYou": {
    es: "Silenciar solo para ti: no los escuchas, tu micro no cambia.",
    en: "Mute just for you: you won't hear them, and your mic doesn't change.",
  },
  "shared.floatCall.listenAgain": { es: "Volver a escuchar", en: "Hear them again" },
  "shared.floatCall.muteForMe": { es: "Silenciar para mí", en: "Mute for me" },
  "shared.floatCall.popOut": { es: "Sacar del navegador", en: "Pop out of the browser" },
  "shared.floatCall.hangUp": { es: "Colgar", en: "Hang up" },

  // Elegir varias personas del equipo (components/SelectorDePersonas.tsx)
  "shared.people.searchTeam": { es: "Buscar en el equipo…", en: "Search the team…" },
  "shared.people.remove": { es: "Quitar a {name}", en: "Remove {name}" },
  "shared.people.thisPerson": { es: "esta persona", en: "this person" },
  "shared.people.noName": { es: "Sin nombre", en: "No name" },

  // Botones de WhatsApp y Telegram que abren el chat en la bandeja de Maven
  // (components/WaChatButton.tsx + TgChatButton.tsx). El rechazo que manda el
  // servidor (res.error) llega escrito por el servidor y se muestra tal cual.
  "shared.openChat.failed": { es: "No se pudo abrir el chat", en: "Couldn't open the chat" },
  "shared.openChat.tgFailed": { es: "No se pudo abrir el chat de Telegram.", en: "Couldn't open the Telegram chat." },
  "shared.openChat.waNotAvailable": { es: "Este lead no está disponible para ti.", en: "This lead isn't available to you." },
  "shared.openChat.waNotYours": { es: "Este lead no es tuyo", en: "This lead isn't yours" },
  "shared.openChat.waNoChannels": {
    es: "No tienes canales de WhatsApp asignados",
    en: "You don't have any WhatsApp channels assigned",
  },
  "shared.openChat.whichLine": { es: "¿Desde qué línea?", en: "From which line?" },
  "shared.openChat.whichChannel": { es: "¿Desde qué canal?", en: "From which channel?" },
  // A dónde vuelve la bandeja ("Volver a …"): la sección desde la que se abrió.
  "shared.openChat.fromContacts": { es: "Contactos", en: "Contacts" },
  "shared.openChat.fromCreators": { es: "Creadoras", en: "Creators" },
  // Desde cualquier otra ruta (la bandeja arma "Volver a {x}" / "Back to {x}").
  // El español es el de siempre ("Volver a atrás"); en inglés "back" dejaba
  // «Back to back».
  "shared.openChat.fromPrevious": { es: "atrás", en: "the previous page" },

  // Composer compartido (components/chat/ChatComposer.tsx)
  "shared.composer.remove": { es: "Quitar", en: "Remove" },

  // Frases hechas del chat (components/chat/ScriptsButton.tsx)
  "shared.scripts.title": { es: "Scripts (frases hechas)", en: "Scripts (saved phrases)" },
  "shared.scripts.editTitle": { es: "Editar frase", en: "Edit phrase" },
  "shared.scripts.newTitle": { es: "Nueva frase", en: "New phrase" },
  "shared.scripts.namePlaceholder": { es: "Nombre (opcional, para buscar)", en: "Name (optional, for searching)" },
  "shared.scripts.textPlaceholder": { es: "La frase…", en: "The phrase…" },
  "shared.scripts.sendOnClick": { es: "Enviar al instante al hacer click", en: "Send right away on click" },
  "shared.scripts.sendOnClickHint": {
    es: "(si no, queda en el cajón para editar)",
    en: "(otherwise it goes into the message box to edit)",
  },
  "shared.scripts.search": { es: "Buscar frase…", en: "Search phrases…" },
  "shared.scripts.empty": { es: "Sin frases todavía. Crea una con “Nueva”.", en: "No phrases yet. Create one with “New”." },
  "shared.scripts.noMatch": { es: "Nada coincide.", en: "Nothing matches." },
  "shared.scripts.clickSends": { es: "Click = enviar", en: "Click = send" },
  "shared.scripts.clickInserts": { es: "Click = poner en el cajón", en: "Click = put it in the message box" },
  "shared.scripts.sendsOnClick": { es: "envía al click", en: "sends on click" },
  "shared.scripts.goesToBox": { es: "↳ va al cajón", en: "↳ goes to the message box" },
  "shared.scripts.delete": { es: "Borrar", en: "Delete" },
  "shared.scripts.deleteFailed": { es: "No se pudo borrar", en: "Couldn't delete" },

  // Tarjeta de un anuncio en el tablero (components/dashboard/AnnouncementFeedCard.tsx).
  // La clave es el announcement_type guardado en la base; solo cambia la etiqueta.
  "shared.announcement.informativo": { es: "Informativo", en: "Info" },
  "shared.announcement.urgente": { es: "Urgente", en: "Urgent" },
  "shared.announcement.recordatorio": { es: "Recordatorio", en: "Reminder" },
  "shared.announcement.actualizacion": { es: "Actualización", en: "Update" },

  // Mejor cerrador de cada mes (components/dashboard/BestCloserMonthlyDialog.tsx)
  "shared.bestCloser.title": { es: "Mejor cerrador por mes", en: "Best closer by month" },
  "shared.bestCloser.empty": {
    es: "Sin data todavía. El ranking arrancó este mes y va a empezar a llenarse a medida que entren calls.",
    en: "No data yet. The ranking started this month and will fill up as calls come in.",
  },
  "shared.bestCloser.stats": { es: "{closes} cierres · calif promedio {score}/100", en: "{closes} closes · avg score {score}/100" },
  "shared.bestCloser.noWinner": { es: "Sin ganador", en: "No winner" },

  // Cambiar la contraseña desde la barra de arriba (components/dashboard/ChangePasswordModal.tsx)
  "shared.password.notMet": { es: "La contraseña no cumple los requisitos.", en: "The password doesn't meet the requirements." },
  "shared.password.changedDesc": { es: "Tu contraseña ha sido cambiada exitosamente.", en: "Your password has been changed successfully." },
  "shared.password.repeat": { es: "Repite la contraseña", en: "Repeat the password" },
  "shared.password.updating": { es: "Actualizando…", en: "Updating…" },
  "shared.password.show": { es: "Mostrar contraseña", en: "Show password" },
  "shared.password.hide": { es: "Ocultar contraseña", en: "Hide password" },

  // Buscador de empleados de RRHH (components/hr/EmployeeSearchCombobox.tsx)
  "shared.employeePicker.placeholder": { es: "Seleccionar empleado...", en: "Select an employee..." },
  "shared.employeePicker.search": { es: "Buscar empleado...", en: "Search employees..." },
  "shared.employeePicker.empty": { es: "No se encontró ningún empleado.", en: "No employee found." },

  // La campana de notificaciones (components/notifications/). El título y el
  // mensaje de cada notificación los escribe un trigger en la base: son dato.
  "shared.notif.markAll": { es: "Marcar todas", en: "Mark all as read" },
  "shared.notif.seeAll": { es: "Ver todas las notificaciones", en: "See all notifications" },
  "shared.notif.archive": { es: "Archivar", en: "Archive" },
  // El chip del módulo de origen. En español se sigue mostrando el valor
  // guardado tal cual (module_origin); en inglés, estos nombres.
  "shared.notif.module.creadores": { es: "Creadoras", en: "Creators" },
  "shared.notif.module.chatterEvaluator": { es: "Evaluador de chatters", en: "Chatter evaluator" },
  "shared.notif.module.finanzas": { es: "Finanzas", en: "Finance" },
  "shared.notif.module.tareas": { es: "Tareas", en: "Tasks" },
  "shared.notif.module.eventos": { es: "Eventos", en: "Events" },
  "shared.notif.module.correo": { es: "Correo", en: "Email" },
  "shared.notif.module.comunicacion": { es: "Comunicación", en: "Communication" },
  "shared.notif.module.hr": { es: "RRHH", en: "HR" },
} as const satisfies Record<string, { es: string; en: string }>;
