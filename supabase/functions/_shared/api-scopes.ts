// Catálogo de scopes de la API pública de Maven. Agrupado por entidad para el
// modal estilo Infloww. Extensible: agregar una entrada acá habilita el scope
// tanto en el gestor (manage-api-keys) como en la validación (public-api).
//
// OJO: Maven es el CRM de la AGENCIA, no la fuente de datos de OnlyFans. Los
// scopes exponen datos de Maven (creadoras, empleados, ventas), no data de fans.
export type ScopeDef = { key: string; group: string; label: string; description: string };

export const SCOPE_GROUPS = ["Creadoras", "Contactos", "Empleados", "Ventas", "Promolog"] as const;

export const SCOPE_CATALOG: ScopeDef[] = [
  {
    key: "creators:read",
    group: "Creadoras",
    label: "Perfil + redes sociales",
    description:
      "Roster de creadoras: nombre artístico, categoría, estado, ubicación, seguidores de Instagram y todas sus redes (IG, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans).",
  },
  {
    key: "contacts:read",
    group: "Contactos",
    label: "Contactos y agencias",
    description:
      "Directorio comercial: modelos, AGENCIAS y ex-creadoras. Nombre, handle, plataforma, país, ciudad, empresa, estado y de qué base salió. Filtro `kind` = modelo | agencia | ex_creadora. El teléfono y el email van ENMASCARADOS salvo que la key tenga además contacts:phone.",
  },
  {
    key: "contacts:phone",
    group: "Contactos",
    label: "⚠️ Teléfono y email sin enmascarar",
    description:
      "Devuelve el teléfono y el email REALES de cada contacto, en vez de enmascarados. Es la base de datos comercial completa: una vez entregada no se puede deshacer. Dentro de Maven este dato está restringido a admins (columna solo-admin + permiso 'Ver Teléfonos'), y una API key SALTEA esas capas — este scope es lo único que la frena. Dalo solo a keys que de verdad lo necesiten, con vencimiento corto y whitelist de IP.",
  },
  {
    key: "employees:read",
    group: "Empleados",
    label: "Roster del equipo",
    description:
      "Empleados de la agencia: nombre, rol (chatter, closer, manager, coordinador…) y fecha de alta.",
  },
  {
    key: "hubstaff:read",
    group: "Empleados",
    label: "Horas de Hubstaff (diario)",
    description:
      "Horas trabajadas por día según Hubstaff: tiempo trackeado (horas), actividad general y proyecto, por empleado. Filtros por fecha y empleado.",
  },
  {
    key: "sales:read",
    group: "Ventas",
    label: "Ganancias por creadora (diario)",
    description:
      "Ganancias brutas diarias por creadora con desglose (suscripciones, tips, mensajes, posts, referidos, streams) y fans activos/nuevos.",
  },
  {
    key: "sales:chatters",
    group: "Ventas",
    label: "Ventas por chatter (diario)",
    description:
      "Ventas diarias por chatter: total vendido, mensajes vendidos y fans chateados.",
  },
  {
    key: "promolog:read",
    group: "Promolog",
    label: "Promoción diaria",
    description:
      "Estado diario de promoción por creadora y red: si promocionó ese día, cuántas historias se escanearon y cuántas contaron como promo. Filtros por fecha, creadora y red.",
  },
];

const SCOPE_SET: Set<string> = new Set(SCOPE_CATALOG.map((s) => s.key));

export function isValidScope(s: string): boolean {
  return SCOPE_SET.has(s);
}
