import type { TranslationKey } from "@/lib/i18n";

export const LEADGEN_COUNTRIES = [
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "MX", name: "México", flag: "🇲🇽" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "PE", name: "Perú", flag: "🇵🇪" },
  { code: "BR", name: "Brasil", flag: "🇧🇷" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾" },
  { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷" },
  { code: "PA", name: "Panamá", flag: "🇵🇦" },
  { code: "DO", name: "Rep. Dominicana", flag: "🇩🇴" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹" },
  { code: "HN", name: "Honduras", flag: "🇭🇳" },
  { code: "SV", name: "El Salvador", flag: "🇸🇻" },
  { code: "NI", name: "Nicaragua", flag: "🇳🇮" },
  { code: "CU", name: "Cuba", flag: "🇨🇺" },
  { code: "PR", name: "Puerto Rico", flag: "🇵🇷" },
  { code: "JM", name: "Jamaica", flag: "🇯🇲" },
  { code: "TT", name: "Trinidad y Tobago", flag: "🇹🇹" },
  { code: "ES", name: "España", flag: "🇪🇸" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "IT", name: "Italia", flag: "🇮🇹" },
  { code: "FR", name: "Francia", flag: "🇫🇷" },
  { code: "DE", name: "Alemania", flag: "🇩🇪" },
  { code: "GB", name: "Reino Unido", flag: "🇬🇧" },
  { code: "NL", name: "Países Bajos", flag: "🇳🇱" },
  { code: "BE", name: "Bélgica", flag: "🇧🇪" },
  { code: "CH", name: "Suiza", flag: "🇨🇭" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "SE", name: "Suecia", flag: "🇸🇪" },
  { code: "NO", name: "Noruega", flag: "🇳🇴" },
  { code: "DK", name: "Dinamarca", flag: "🇩🇰" },
  { code: "FI", name: "Finlandia", flag: "🇫🇮" },
  { code: "PL", name: "Polonia", flag: "🇵🇱" },
  { code: "CZ", name: "Rep. Checa", flag: "🇨🇿" },
  { code: "RO", name: "Rumanía", flag: "🇷🇴" },
];

export const LEADGEN_COMPANIES = [
  "alvaroletshoot",
  "Blu app",
  "Exchange",
  "KASH Agency",
  "Content Protector",
  "Ora Miami",
  "Pagomundo",
  "piclink.me",
  "Trafix",
  "UNLOK",
];

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

export const FLORIDA_CITIES = [
  "Miami", "Fort Lauderdale", "Orlando", "Tampa", "Jacksonville",
  "St. Petersburg", "Hialeah", "Tallahassee", "Cape Coral", "Port St. Lucie",
  "Pembroke Pines", "Hollywood", "Miramar", "Coral Springs", "Gainesville",
  "Lakeland", "Palm Bay", "Clearwater", "West Palm Beach", "Pompano Beach",
];

// `value` es el dato (la calidad que se guarda y se compara); en pantalla va
// `t(labelKey)`.
export const QUALITY_OPTIONS: ReadonlyArray<{ value: string; labelKey: TranslationKey }> = [
  { value: "A+", labelKey: "leadgen.quality.aPlusExcellent" },
  { value: "A", labelKey: "leadgen.quality.aHigh" },
  { value: "B+", labelKey: "leadgen.quality.bPlusGood" },
  { value: "B", labelKey: "leadgen.quality.bFair" },
  { value: "C", labelKey: "leadgen.quality.cBasic" },
];

/** Get the platform URL for a lead */
export const getPlatformUrl = (lead: { model_handle?: string; platform?: string; source_link?: string | null }) => {
  const handle = lead.model_handle?.replace("@", "").trim();
  const platform = lead.platform?.toLowerCase() || "";
  if (handle) {
    if (platform.includes("ig") || platform.includes("instagram")) return `https://instagram.com/${handle}`;
    if (platform.includes("tt") || platform.includes("tiktok")) return `https://tiktok.com/@${handle}`;
    if (platform.includes("x") || platform.includes("twitter")) return `https://x.com/${handle}`;
  }
  return lead.source_link || null;
};

/** Quality color classes */
export const QUALITY_COLORS: Record<string, string> = {
  "a+": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  a: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "b+": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  b: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  c: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};
