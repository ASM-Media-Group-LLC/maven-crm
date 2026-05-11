// Lista canónica de países usada por el formulario de Nueva QA y por
// los filtros del dashboard de Modelos. Port verbatim del kash
// lib/country-normalize.ts — la idea es que el closer elija siempre
// del mismo set para no fragmentar los modelos por inconsistencias
// de tipeo ("Argentina" vs "argentina" vs "AR").
//
// El orden refleja el peso de mercado del negocio (latam primero,
// europa después, resto al final).

export const CANONICAL_COUNTRIES = [
  "Argentina",
  "Brasil",
  "Chile",
  "Colombia",
  "México",
  "Perú",
  "Uruguay",
  "Paraguay",
  "Bolivia",
  "Ecuador",
  "Venezuela",
  "Cuba",
  "Costa Rica",
  "Panamá",
  "Guatemala",
  "El Salvador",
  "Honduras",
  "Nicaragua",
  "República Dominicana",
  "Puerto Rico",
  "Jamaica",
  "España",
  "Portugal",
  "Italia",
  "Francia",
  "Alemania",
  "UK",
  "Irlanda",
  "Noruega",
  "Suecia",
  "Suiza",
  "Países Bajos",
  "Polonia",
  "Rusia",
  "Ucrania",
  "Rumania",
  "República Checa",
  "Hungría",
  "Serbia",
  "Armenia",
  "US/CA",
  "Canadá",
  "Australia",
  "Nueva Zelanda",
  "Japón",
  "China",
  "Corea del Sur",
  "Tailandia",
  "Filipinas",
  "Indonesia",
  "Vietnam",
  "Singapur",
  "India",
  "Pakistán",
  "Israel",
  "Turquía",
  "Emiratos Árabes Unidos",
  "Marruecos",
  "Egipto",
  "Sudáfrica",
  "Nigeria",
] as const;

export type CanonicalCountry = (typeof CANONICAL_COUNTRIES)[number];

// ─── Flag emojis ───────────────────────────────────────────────────────
// Mapeo del nombre canónico → emoji. Usado por Scouter Assist (cards,
// filtros) y cualquier otra vista que muestre país.

export const COUNTRY_FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Brasil: "🇧🇷", Chile: "🇨🇱", Colombia: "🇨🇴",
  México: "🇲🇽", Perú: "🇵🇪", Uruguay: "🇺🇾", Paraguay: "🇵🇾",
  Bolivia: "🇧🇴", Ecuador: "🇪🇨", Venezuela: "🇻🇪", Cuba: "🇨🇺",
  "Costa Rica": "🇨🇷", Panamá: "🇵🇦", Guatemala: "🇬🇹",
  "El Salvador": "🇸🇻", Honduras: "🇭🇳", Nicaragua: "🇳🇮",
  "República Dominicana": "🇩🇴", "Puerto Rico": "🇵🇷", Jamaica: "🇯🇲",
  España: "🇪🇸", Portugal: "🇵🇹", Italia: "🇮🇹", Francia: "🇫🇷",
  Alemania: "🇩🇪", UK: "🇬🇧", Irlanda: "🇮🇪", Noruega: "🇳🇴",
  Suecia: "🇸🇪", Suiza: "🇨🇭", "Países Bajos": "🇳🇱", Polonia: "🇵🇱",
  Rusia: "🇷🇺", Ucrania: "🇺🇦", Rumania: "🇷🇴",
  "República Checa": "🇨🇿", Hungría: "🇭🇺", Serbia: "🇷🇸", Armenia: "🇦🇲",
  "US/CA": "🇺🇸", Canadá: "🇨🇦",
  Australia: "🇦🇺", "Nueva Zelanda": "🇳🇿", Japón: "🇯🇵",
  China: "🇨🇳", "Corea del Sur": "🇰🇷", Tailandia: "🇹🇭", Filipinas: "🇵🇭",
  Indonesia: "🇮🇩", Vietnam: "🇻🇳", Singapur: "🇸🇬", India: "🇮🇳",
  Pakistán: "🇵🇰", Israel: "🇮🇱", Turquía: "🇹🇷",
  "Emiratos Árabes Unidos": "🇦🇪",
  Marruecos: "🇲🇦", Egipto: "🇪🇬", Sudáfrica: "🇿🇦", Nigeria: "🇳🇬",
};

// ─── Normalización ─────────────────────────────────────────────────────
// Mapa de alias en lowercase sin acentos → nombre canónico. Captura las
// variantes que ya viven en la base (Mexico/México/mexico, Spain/España,
// USA/EEUU, UK/United Kingdom, etc.) y las normaliza.

const ALIASES: Record<string, CanonicalCountry> = {
  // México
  mexico: "México", "méxico": "México", mex: "México", mx: "México",
  // Estados Unidos → US/CA (canónico del Nueva QA flow legacy)
  usa: "US/CA", us: "US/CA", "u.s.": "US/CA", "u.s.a.": "US/CA",
  eeuu: "US/CA", "estados unidos": "US/CA", "united states": "US/CA",
  "us/ca": "US/CA", miami: "US/CA",
  // Reino Unido → UK (canónico)
  uk: "UK", "u.k.": "UK", "united kingdom": "UK", "reino unido": "UK",
  england: "UK", inglaterra: "UK",
  // Brasil
  brasil: "Brasil", brazil: "Brasil",
  // España
  españa: "España", espana: "España", spain: "España",
  // Italia
  italia: "Italia", italy: "Italia",
  // Francia
  francia: "Francia", france: "Francia",
  // Alemania
  alemania: "Alemania", germany: "Alemania",
  // Perú
  peru: "Perú", "perú": "Perú",
  "lima, peru": "Perú", "lima peru": "Perú",
  // Panamá
  panama: "Panamá", "panamá": "Panamá",
  // Japón
  japon: "Japón", "japón": "Japón", japan: "Japón",
  // Suecia
  sweden: "Suecia", suecia: "Suecia",
  // Irlanda
  ireland: "Irlanda", irlanda: "Irlanda",
  // Turquía
  turkey: "Turquía", turquia: "Turquía", "turquía": "Turquía",
  // Filipinas
  philippines: "Filipinas", filipinas: "Filipinas",
  // Rumania
  romania: "Rumania", rumania: "Rumania", "rumanía": "Rumania",
  // República Dominicana
  "republica dominicana": "República Dominicana",
  "república dominicana": "República Dominicana",
  "dominican republic": "República Dominicana",
  // Países Bajos
  netherlands: "Países Bajos", "paises bajos": "Países Bajos",
  "países bajos": "Países Bajos", holanda: "Países Bajos",
  // Suiza no está en canónica → la dejamos null (alias removed)
  // Armenia / Serbia / etc no están en canónica → null
};

const stripAccents = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "");

// Index canónico (lowercase sin acentos) para self-matching.
const CANONICAL_INDEX = new Set<string>(
  CANONICAL_COUNTRIES.map((c) => stripAccents(c.toLowerCase())),
);
const CANONICAL_BY_KEY: Record<string, CanonicalCountry> = {};
for (const c of CANONICAL_COUNTRIES) {
  CANONICAL_BY_KEY[stripAccents(c.toLowerCase())] = c;
}

/** Normaliza input free-form al nombre canónico. Devuelve null si el
 *  string no es reconocible como país (nombres de personas, "manual",
 *  ciudades sueltas, multi-country strings ambiguos). */
export const normalizeCountry = (
  input: string | null | undefined,
): CanonicalCountry | null => {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const key = stripAccents(raw.toLowerCase());
  // Multi-country / ambiguous: descartamos.
  if (/[\/,]/.test(key) && !ALIASES[key]) return null;
  if (ALIASES[key]) return ALIASES[key];
  if (CANONICAL_BY_KEY[key]) return CANONICAL_BY_KEY[key];
  return null;
};

/** Flag emoji para un país canónico. 🌍 fallback. */
export const countryFlag = (name: string | null | undefined): string => {
  if (!name) return "";
  return COUNTRY_FLAGS[name] ?? "🌍";
};

/** Lista alfabética para dropdowns. */
export const COUNTRIES_ALPHA: ReadonlyArray<CanonicalCountry> = [
  ...CANONICAL_COUNTRIES,
].sort((a, b) => a.localeCompare(b, "es"));
