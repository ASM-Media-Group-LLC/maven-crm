/** Country code → full name + flag emoji mapping */

const COUNTRY_DATA: Record<string, { name: string; flag: string }> = {
  AR: { name: "Argentina", flag: "🇦🇷" },
  BO: { name: "Bolivia", flag: "🇧🇴" },
  BR: { name: "Brasil", flag: "🇧🇷" },
  GB: { name: "Reino Unido", flag: "🇬🇧" },
  CL: { name: "Chile", flag: "🇨🇱" },
  CO: { name: "Colombia", flag: "🇨🇴" },
  CR: { name: "Costa Rica", flag: "🇨🇷" },
  CU: { name: "Cuba", flag: "🇨🇺" },
  DO: { name: "Rep. Dominicana", flag: "🇩🇴" },
  EC: { name: "Ecuador", flag: "🇪🇨" },
  SV: { name: "El Salvador", flag: "🇸🇻" },
  ES: { name: "España", flag: "🇪🇸" },
  US: { name: "Estados Unidos", flag: "🇺🇸" },
  GT: { name: "Guatemala", flag: "🇬🇹" },
  HN: { name: "Honduras", flag: "🇭🇳" },
  MX: { name: "México", flag: "🇲🇽" },
  NI: { name: "Nicaragua", flag: "🇳🇮" },
  PA: { name: "Panamá", flag: "🇵🇦" },
  PY: { name: "Paraguay", flag: "🇵🇾" },
  PE: { name: "Perú", flag: "🇵🇪" },
  PR: { name: "Puerto Rico", flag: "🇵🇷" },
  UY: { name: "Uruguay", flag: "🇺🇾" },
  VE: { name: "Venezuela", flag: "🇻🇪" },
};

// Also support full country names as input
const NAME_TO_CODE: Record<string, string> = {};
Object.entries(COUNTRY_DATA).forEach(([code, { name }]) => {
  NAME_TO_CODE[name.toLowerCase()] = code;
});
// Extra aliases
NAME_TO_CODE["república dominicana"] = "DO";
NAME_TO_CODE["estados unidos"] = "US";

function resolveCode(input: string): string | null {
  if (!input) return null;
  const upper = input.trim().toUpperCase();
  if (COUNTRY_DATA[upper]) return upper;
  const lower = input.trim().toLowerCase();
  if (NAME_TO_CODE[lower]) return NAME_TO_CODE[lower];
  return null;
}

export function getCountryFlag(countryInput: string | null | undefined): string {
  if (!countryInput) return "";
  const code = resolveCode(countryInput);
  return code ? COUNTRY_DATA[code].flag : "";
}

export function getCountryName(countryInput: string | null | undefined): string {
  if (!countryInput) return "";
  const code = resolveCode(countryInput);
  return code ? COUNTRY_DATA[code].name : countryInput;
}

export function getCountryDisplay(countryInput: string | null | undefined): string {
  if (!countryInput) return "—";
  const code = resolveCode(countryInput);
  if (!code) return countryInput;
  return `${COUNTRY_DATA[code].flag} ${COUNTRY_DATA[code].name}`;
}

/** Mask a phone number: show only last 4 digits */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return "••••";
  return "•".repeat(digits.length - 4) + digits.slice(-4);
}
