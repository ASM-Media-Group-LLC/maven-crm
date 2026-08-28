// Catálogo de scopes de la API pública de Maven. Extensible: agregar acá una
// entrada nueva la habilita tanto en el gestor (manage-api-keys) como en la
// validación (public-api). Fase 1 = creadoras + sus redes.
export const SCOPE_CATALOG = [
  {
    key: "creators:read",
    label: "Creadoras — lectura",
    description:
      "Roster de creadoras: nombre, nombre artístico, categoría, estado, ubicación, seguidores de Instagram y todas sus redes sociales (Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans y otras).",
  },
] as const;

export type ScopeKey = (typeof SCOPE_CATALOG)[number]["key"];

const SCOPE_SET: Set<string> = new Set(SCOPE_CATALOG.map((s) => s.key));

export function isValidScope(s: string): boolean {
  return SCOPE_SET.has(s);
}
