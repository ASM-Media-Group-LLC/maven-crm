// Monitoreo en vivo (Alvaro, 11/11/2026): «Quién está bajando ahora» y la vista
// en vivo de una persona (/hr/en-vivo/:userId). Palabras simples, sin jerga.

export const PREFIJOS_VIGILANCIA = ["vigilancia."] as const;

export const vigilancia = {
  // ── «Quién está bajando ahora» ──
  "vigilancia.quien.titulo": { es: "Quién está bajando ahora", en: "Who's pulling the score down now" },
  "vigilancia.quien.sub": { es: "Toca a alguien para verlo en vivo", en: "Tap someone to watch them live" },
  "vigilancia.quien.enVivo": { es: "En vivo · se revisa solo", en: "Live · checks itself" },
  "vigilancia.quien.nadie": { es: "Nadie está bajando la nota ahora mismo.", en: "Nobody is pulling the score down right now." },
  "vigilancia.quien.fallo": { es: "No se pudo cargar quién está bajando.", en: "Couldn't load who's pulling the score down." },
  "vigilancia.quien.verTodos": { es: "Ver los {n}", en: "See all {n}" },
  "vigilancia.quien.verMenos": { es: "Ver menos", en: "Show fewer" },
  "vigilancia.quien.lleva": { es: "Lleva {d}", en: "For {d}" },
  "vigilancia.quien.otros": { es: "+{n} más", en: "+{n} more" },
  "vigilancia.quien.revisado": { es: "Revisado", en: "Reviewed" },
  "vigilancia.quien.fotoHace": { es: "hace {d}", en: "{d} ago" },
  "vigilancia.quien.fotoAhora": { es: "ahora", en: "now" },

  // ── Comunes ──
  "vigilancia.comun.reintentar": { es: "Reintentar", en: "Retry" },
  "vigilancia.comun.volver": { es: "Volver", en: "Back" },

  // ── Cada estado, en palabras simples ──
  "vigilancia.estado.trabajando": { es: "Trabajando", en: "Working" },
  "vigilancia.estado.presente": { es: "Conectado", en: "Online" },
  "vigilancia.estado.pausa": { es: "En pausa", en: "On a break" },
  "vigilancia.estado.pausa_de_mas": { es: "Se pasó del tiempo de pausa", en: "Break ran over time" },
  "vigilancia.estado.celular": { es: "Está en el celular", en: "On the phone" },
  "vigilancia.estado.distraido": { es: "Está distraído", en: "Distracted" },
  "vigilancia.estado.no_mira": { es: "No está mirando la pantalla", en: "Not looking at the screen" },
  "vigilancia.estado.camara_apagada": { es: "Tiene la cámara apagada", en: "Camera is off" },
  "vigilancia.estado.se_fue": { es: "No está en su puesto", en: "Away from the desk" },
  "vigilancia.estado.fuera_cowork": { es: "Se salió de Cowork en su turno", en: "Left Cowork during the shift" },
  "vigilancia.estado.fuera_de_lugar": { es: "Está en algo que no es trabajo", en: "Doing something that isn't work" },
  "vigilancia.estado.sin_pantalla": { es: "No está compartiendo pantalla", en: "Not sharing the screen" },
  "vigilancia.estado.ausente": { es: "Desconectado", en: "Offline" },

  // Alertas que no bajan la nota (o no tienen estado propio).
  "vigilancia.alerta.camara_tapada": { es: "Tiene la cámara tapada", en: "Camera is covered" },
  "vigilancia.alerta.cara_incompleta": { es: "No se le ve la cara completa", en: "Face not fully visible" },
  "vigilancia.alerta.sin_senal": { es: "Argos no recibe sus pantallazos", en: "Argos isn't getting screenshots" },
  "vigilancia.alerta.otra": { es: "Argos vio algo raro", en: "Argos saw something off" },

  // ── Tiempo ──
  "vigilancia.tiempo.recien": { es: "menos de 1 min", en: "under 1 min" },
  "vigilancia.tiempo.min": { es: "{n} min", en: "{n} min" },
  "vigilancia.tiempo.horas": { es: "{h} h {m} min", en: "{h} h {m} min" },

  // ── La nota viva ──
  "vigilancia.nota.corta": { es: "nota", en: "score" },
  "vigilancia.nota.aria": { es: "Nota viva: {n} de 100", en: "Live score: {n} out of 100" },

  // ── La vista en vivo ──
  "vigilancia.titulo": { es: "En vivo", en: "Live" },
  "vigilancia.subtitulo": { es: "Su pantalla y su cámara, ahora", en: "Their screen and camera, now" },
  "vigilancia.subtituloSala": { es: "En vivo desde {sala}", en: "Live from {sala}" },
  "vigilancia.sinPermiso": { es: "No tienes acceso a esta persona.", en: "You don't have access to this person." },
  "vigilancia.permisoIndefinido": { es: "No pudimos verificar tu acceso. Fue la conexión, no tu cuenta.", en: "We couldn't verify your access. It was the connection, not your account." },
  "vigilancia.fallo": { es: "No se pudo cargar esta vista.", en: "Couldn't load this view." },
  "vigilancia.verExpediente": { es: "Ver su expediente completo", en: "Open their full record" },

  "vigilancia.vivo.queVer": { es: "Qué ver", en: "What to watch" },
  "vigilancia.vivo.tabVivo": { es: "En vivo", en: "Live" },
  "vigilancia.vivo.tabVideo": { es: "Lo que pasó", en: "What happened" },
  "vigilancia.vivo.enVivo": { es: "En vivo", en: "Live" },
  "vigilancia.vivo.salaDeSesion": { es: "{sala} · {sesion}", en: "{sala} · {sesion}" },
  "vigilancia.vivo.conectando": { es: "Conectando con su sala…", en: "Connecting to their room…" },
  "vigilancia.vivo.esperando": { es: "No está conectado a su sala ahora mismo.", en: "They're not in their room right now." },
  "vigilancia.vivo.reconectando": { es: "Se cortó la imagen. Reconectando…", en: "The feed dropped. Reconnecting…" },
  "vigilancia.vivo.sinCowork": { es: "No está en Cowork ahora mismo.", en: "They're not in Cowork right now." },
  "vigilancia.vivo.noDisponible": { es: "El en vivo no está disponible. Mira el video de esos minutos.", en: "Live view isn't available. Watch the video of those minutes." },
  "vigilancia.vivo.sinPermiso": { es: "No tienes acceso al en vivo de esta persona.", en: "You can't watch this person live." },
  "vigilancia.vivo.sinNada": { es: "Está en su sala, pero sin cámara ni pantalla.", en: "In the room, but with no camera or screen." },
  "vigilancia.vivo.intercambiar": { es: "Cambiar pantalla y cámara", en: "Swap screen and camera" },
  "vigilancia.vivo.escuchar": { es: "Escuchar", en: "Listen" },
  "vigilancia.vivo.silenciar": { es: "Silenciar", en: "Mute" },
  "vigilancia.vivo.completa": { es: "Pantalla completa", en: "Full screen" },
  "vigilancia.vivo.salirCompleta": { es: "Salir de pantalla completa", en: "Exit full screen" },

  // ── La razón (arriba) ──
  "vigilancia.razon.argosVio": { es: "Lo que vio Argos", en: "What Argos saw" },
  "vigilancia.razon.argosGrabo": { es: "Argos grabó un video", en: "Argos recorded a video" },
  "vigilancia.razon.cowork": { es: "Aviso de Cowork", en: "Cowork alert" },
  "vigilancia.razon.ahora": { es: "Ahora mismo", en: "Right now" },
  "vigilancia.razon.sinNada": { es: "No tiene nada abierto ahora.", en: "Nothing open right now." },
  "vigilancia.razon.noEncontrada": { es: "Ese aviso ya no existe. Esto es lo que pasa ahora.", en: "That alert is gone. This is what's happening now." },
  "vigilancia.razon.sigue": { es: "Sigue pasando", en: "Still happening" },
  "vigilancia.razon.cerro": { es: "Ya se cerró a las {hora}", en: "Closed at {hora}" },
  "vigilancia.razon.revisadoChip": { es: "Revisado", en: "Reviewed" },
  "vigilancia.razon.desde": { es: "Empezó", en: "Started" },
  "vigilancia.razon.lleva": { es: "Lleva", en: "Ongoing for" },
  "vigilancia.razon.duro": { es: "Duró", en: "Lasted" },
  "vigilancia.razon.revisadoPor": { es: "Revisado por {nombre} a las {hora}", en: "Reviewed by {nombre} at {hora}" },
  "vigilancia.razon.revisadoA": { es: "Revisado a las {hora}", en: "Reviewed at {hora}" },
  "vigilancia.razon.foto": { es: "La foto que lo disparó", en: "The photo that triggered it" },
  "vigilancia.razon.fotoToca": { es: "Toca para verla grande", en: "Tap to enlarge" },
  "vigilancia.razon.fotoArchivo": { es: "Ya está en el archivo del NAS", en: "Already moved to the NAS archive" },
  "vigilancia.razon.tambien": { es: "También ahora", en: "Also right now" },

  // ── El video de esos minutos ──
  "vigilancia.video.tituloClip": { es: "El video que grabó Argos", en: "The video Argos recorded" },
  "vigilancia.video.tituloFotos": { es: "No hubo video: estos son sus pantallazos de esos minutos", en: "No video: these are their screenshots from those minutes" },
  "vigilancia.video.fueraDeLugar": { es: "Fuera de lugar", en: "Off-task" },
  "vigilancia.video.enLoSuyo": { es: "En lo suyo", en: "On task" },
  "vigilancia.video.sinJuzgar": { es: "Sin revisar", en: "Not judged" },
  "vigilancia.video.sinCara": { es: "No se le ve la cara.", en: "Face not visible." },
  "vigilancia.video.sinPalabras": { es: "Argos no dejó comentario de esta foto.", en: "Argos left no comment on this photo." },
  "vigilancia.video.clipEnArchivo": { es: "Este video ya se movió al archivo del NAS.", en: "This video was moved to the NAS archive." },
  "vigilancia.video.fotoEnArchivo": { es: "Esta foto ya se movió al archivo del NAS.", en: "This photo was moved to the NAS archive." },
  "vigilancia.video.anterior": { es: "Foto anterior", en: "Previous photo" },
  "vigilancia.video.siguiente": { es: "Foto siguiente", en: "Next photo" },
  "vigilancia.video.reproducir": { es: "Reproducir", en: "Play" },
  "vigilancia.video.pausar": { es: "Pausar", en: "Pause" },
  "vigilancia.video.linea": { es: "Momento", en: "Moment" },
  "vigilancia.video.fallo": { es: "No se pudo cargar el video de esos minutos.", en: "Couldn't load the video of those minutes." },
  "vigilancia.video.nada": { es: "No hay video ni fotos de esos minutos.", en: "There's no video or photos from those minutes." },
  "vigilancia.video.sinRazon": { es: "Sin un aviso abierto no hay minutos que mostrar: mira el en vivo.", en: "With no open alert there are no minutes to show: watch live." },

  // ── Acciones ──
  "vigilancia.accion.avisarle": { es: "Avisarle", en: "Alert them" },
  "vigilancia.accion.revisar": { es: "Revisado", en: "Mark reviewed" },
  "vigilancia.accion.revisado": { es: "Ya revisado", en: "Reviewed" },
  "vigilancia.accion.revisadoListo": { es: "Marcado como revisado", en: "Marked as reviewed" },
  "vigilancia.accion.revisarFallo": { es: "No se pudo marcar. Intenta otra vez.", en: "Couldn't mark it. Try again." },
  "vigilancia.accion.avisoEnviado": { es: "Aviso enviado: le llega con la voz de Mario", en: "Alert sent: they'll hear it in Mario's voice" },
  "vigilancia.accion.avisoFallo": { es: "No se pudo enviar el aviso", en: "Couldn't send the alert" },
  "vigilancia.accion.noEstaEnCowork": { es: "No está en Cowork: el aviso no le llegaría", en: "They're not in Cowork: the alert wouldn't reach them" },
  "vigilancia.accion.avisarSoloEnCowork": { es: "Se le puede avisar cuando esté en Cowork.", en: "You can alert them once they're in Cowork." },
} as const satisfies Record<string, { es: string; en: string }>;
