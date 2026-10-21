// Empleados — la sección donde cada persona del equipo tiene su perfil de
// desempeño. La primera pieza es el calendario de avisos (las situaciones que
// un supervisor le marcó desde Cowork); con el tiempo suma pausas, cámara,
// horas y evaluación.
//
// Todas las claves empiezan con "empleados." (lo fija diccionarioPorModulo).
export const PREFIJOS_EMPLEADOS = ["empleados."] as const;

export const empleados = {
  // Navegación / listado
  "empleados.nav.title": { es: "Empleados", en: "Employees" },
  "empleados.title": { es: "Empleados", en: "Employees" },
  "empleados.subtitle": {
    es: "Perfil de desempeño de cada persona del equipo.",
    en: "Performance profile for every team member.",
  },
  "empleados.search": { es: "Buscar por nombre…", en: "Search by name…" },
  "empleados.count": { es: "{count} personas", en: "{count} people" },
  "empleados.empty": { es: "No hay empleados para mostrar.", en: "No employees to show." },
  "empleados.emptySearch": {
    es: "Nadie coincide con «{q}».",
    en: "Nobody matches “{q}”.",
  },
  "empleados.loadError": {
    es: "No se pudieron cargar los empleados.",
    en: "Couldn’t load the employees.",
  },
  "empleados.retry": { es: "Reintentar", en: "Retry" },
  "empleados.openProfile": { es: "Ver perfil", en: "View profile" },

  // Perfil
  "empleados.profile.back": { es: "Empleados", en: "Employees" },
  "empleados.profile.heading": { es: "Perfil de desempeño", en: "Performance profile" },
  "empleados.profile.notFound": {
    es: "No encontramos a esa persona.",
    en: "We couldn’t find that person.",
  },

  // Calendario de avisos
  "empleados.avisos.title": { es: "Avisos recibidos", en: "Alerts received" },
  "empleados.avisos.subtitle": {
    es: "Las situaciones que se le marcaron desde Cowork, día por día.",
    en: "The situations flagged from Cowork, day by day.",
  },
  "empleados.avisos.monthCount": {
    es: "{count} avisos este mes",
    en: "{count} alerts this month",
  },
  "empleados.avisos.monthNone": { es: "Sin avisos este mes.", en: "No alerts this month." },
  "empleados.avisos.dayNone": { es: "Sin avisos este día.", en: "No alerts this day." },
  "empleados.avisos.sentBy": { es: "de {name}", en: "from {name}" },
  "empleados.avisos.loadError": {
    es: "No se pudieron cargar los avisos.",
    en: "Couldn’t load the alerts.",
  },
  "empleados.avisos.prevMonth": { es: "Mes anterior", en: "Previous month" },
  "empleados.avisos.nextMonth": { es: "Mes siguiente", en: "Next month" },
  "empleados.avisos.today": { es: "Hoy", en: "Today" },
};
