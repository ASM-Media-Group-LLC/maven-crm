// El Centro de operaciones (Admin → /admin/centro-de-operaciones): el tablero
// en vivo del administrador — quién está en salas, volumen de la última hora y
// el semáforo de servicios. Las claves empiezan con los prefijos de abajo (los
// vigila test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CENTRO_OPS = ["centroOps."] as const;

export const centroOps = {
  "centroOps.title": { es: "Centro de operaciones", en: "Operations center" },
  "centroOps.subtitle": {
    es: "Lo que está pasando en la plataforma ahora mismo. Se refresca solo.",
    en: "What's happening on the platform right now. Refreshes on its own.",
  },
  "centroOps.enSalas": { es: "Personas en salas ahora", en: "People in rooms now" },
  "centroOps.salas": { es: "Salas con gente", en: "Rooms with people" },
  "centroOps.sesiones": { es: "Sesiones de Cowork abiertas", en: "Open Cowork sessions" },
  "centroOps.reuniones": { es: "Reuniones en curso", en: "Meetings in progress" },
  "centroOps.mensajes1h": { es: "Mensajes (última hora)", en: "Messages (last hour)" },
  "centroOps.notis1h": { es: "Notificaciones (última hora)", en: "Notifications (last hour)" },
  "centroOps.cortes1h": { es: "Cortes de llamada (última hora)", en: "Call drops (last hour)" },
  "centroOps.servicios": { es: "Servicios", en: "Services" },
  "centroOps.srv.base": { es: "Base de datos", en: "Database" },
  "centroOps.srv.frontend": { es: "Aplicación", en: "App" },
  "centroOps.srv.livekit": { es: "Llamadas (LiveKit)", en: "Calls (LiveKit)" },
  "centroOps.ok": { es: "En línea", en: "Online" },
  "centroOps.caido": { es: "Con problemas", en: "Having issues" },
  "centroOps.actualizado": {
    es: "Actualizado {hora} · se refresca cada 10 s",
    en: "Updated {hora} · refreshes every 10 s",
  },
  "centroOps.cargando": { es: "Leyendo el estado en vivo…", en: "Reading live status…" },
  "centroOps.error": {
    es: "No se pudo leer el estado. Se reintenta en 10 segundos.",
    en: "Couldn't read the status. Retrying in 10 seconds.",
  },
};
