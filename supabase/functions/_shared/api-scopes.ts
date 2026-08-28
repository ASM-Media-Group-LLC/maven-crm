// Catálogo de scopes de la API pública de Maven. Agrupado por entidad para el
// modal estilo Infloww. Extensible: agregar una entrada acá habilita el scope
// tanto en el gestor (manage-api-keys) como en la validación (public-api).
//
// OJO: Maven es el CRM de la AGENCIA, no la fuente de datos de OnlyFans. Los
// scopes exponen datos de Maven (creadoras, empleados, ventas), no data de fans.
export type ScopeDef = { key: string; group: string; label: string; description: string };

export const SCOPE_GROUPS = ["Creadoras", "Empleados", "Ventas", "Promolog"] as const;

export const SCOPE_CATALOG: ScopeDef[] = [
  {
    key: "creators:read",
    group: "Creadoras",
    label: "Perfil + redes sociales",
    description:
      "Roster de creadoras: nombre artístico, categoría, estado, ubicación, seguidores de Instagram y todas sus redes (IG, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans).",
  },
  {
    key: "employees:read",
    group: "Empleados",
    label: "Roster del equipo",
    description:
      "Empleados de la agencia: nombre, rol (chatter, closer, manager, coordinador…) y fecha de alta.",
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
