// Oficina › Calendario.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CALENDARIO = ["cal."] as const;

export const calendario = {
  // Oficina · Calendario
  "cal.subtitulo": { es: "Tus reuniones y las del equipo", en: "Your meetings and the team\u2019s" },
  "cal.hoy": { es: "Hoy", en: "Today" },
  "cal.mesAnterior": { es: "Mes anterior", en: "Previous month" },
  "cal.mesSiguiente": { es: "Mes siguiente", en: "Next month" },
  "cal.nuevo": { es: "Evento nuevo", en: "New event" },
  "cal.editar": { es: "Editar evento", en: "Edit event" },
  "cal.titulo": { es: "Título", en: "Title" },
  "cal.tituloPlaceholder": { es: "Ej: Inducción con el equipo", en: "e.g. Onboarding with the team" },
  "cal.todoElDia": { es: "Todo el día", en: "All day" },
  "cal.empieza": { es: "Empieza", en: "Starts" },
  "cal.termina": { es: "Termina", en: "Ends" },
  "cal.lugar": { es: "Lugar", en: "Location" },
  "cal.enlace": { es: "Link de la videollamada", en: "Video call link" },
  "cal.notas": { es: "Notas", en: "Notes" },
  "cal.quienLoVe": { es: "Quién lo ve", en: "Who can see it" },
  "cal.privado": { es: "Solo yo", en: "Only me" },
  "cal.equipo": { es: "El equipo", en: "The team" },
  "cal.guardar": { es: "Guardar", en: "Save" },
  "cal.creado": { es: "Evento creado", en: "Event created" },
  "cal.guardado": { es: "Evento guardado", en: "Event saved" },
  "cal.borrado": { es: "Evento eliminado", en: "Event deleted" },
  "cal.faltaTitulo": { es: "Ponle un título al evento", en: "Give the event a title" },
  "cal.finAntes": { es: "Termina antes de empezar", en: "It ends before it starts" },
  "cal.sinEventos": { es: "Nada agendado este mes", en: "Nothing scheduled this month" },
  "cal.sinEventosAyuda": {
    es: "Haz clic en un día para agendar algo.",
    en: "Click a day to schedule something.",
  },
  "cal.masEventos": { es: "+{n} más", en: "+{n} more" },
  "cal.entrar": { es: "Entrar", en: "Join" },

  // Calendario · invitados
  "cal.invitados": { es: "Invitados", en: "Guests" },
  "cal.buscarPersona": { es: "Buscar a alguien…", en: "Search for someone…" },
  "cal.sinInvitados": { es: "Todavía no invitaste a nadie", en: "You haven\u2019t invited anyone yet" },
  "cal.quitar": { es: "Quitar invitado", en: "Remove guest" },
  "cal.vas": { es: "¿Vas?", en: "Are you going?" },
  "cal.resp.pendiente": { es: "sin responder", en: "no reply" },
  "cal.resp.va": { es: "va", en: "going" },
  "cal.resp.noVa": { es: "no va", en: "not going" },
  "cal.resp.quizas": { es: "quizás", en: "maybe" },
  "cal.respondiste": { es: "Respuesta guardada", en: "Reply saved" },
  "cal.invitaAlGuardar": {
    es: "Guarda el evento y después invita a quien quieras",
    en: "Save the event first, then invite whoever you want",
  },
  "cal.organiza": { es: "Organiza", en: "Organizer" },

  // Calendario · vista de semana
  "cal.vistaMes": { es: "Mes", en: "Month" },
  "cal.vistaSemana": { es: "Semana", en: "Week" },
  "cal.semanaAnterior": { es: "Semana anterior", en: "Previous week" },
  "cal.semanaSiguiente": { es: "Semana siguiente", en: "Next week" },
  "cal.sinEventosSemana": { es: "Nada agendado esta semana", en: "Nothing scheduled this week" },
} as const satisfies Record<string, { es: string; en: string }>;
