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
  IT: { name: "Italia", flag: "🇮🇹" },
  MX: { name: "México", flag: "🇲🇽" },
  NI: { name: "Nicaragua", flag: "🇳🇮" },
  PA: { name: "Panamá", flag: "🇵🇦" },
  PY: { name: "Paraguay", flag: "🇵🇾" },
  PE: { name: "Perú", flag: "🇵🇪" },
  PR: { name: "Puerto Rico", flag: "🇵🇷" },
  TH: { name: "Tailandia", flag: "🇹🇭" },
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

// Phone prefix → ISO code mapping
const PHONE_TO_CODE: Record<string, string> = {
  "+54": "AR", "+591": "BO", "+55": "BR", "+44": "GB", "+56": "CL",
  "+57": "CO", "+506": "CR", "+53": "CU", "+1809": "DO", "+593": "EC",
  "+503": "SV", "+34": "ES", "+1": "US", "+502": "GT", "+504": "HN",
  "+39": "IT", "+52": "MX", "+505": "NI", "+507": "PA", "+595": "PY",
  "+51": "PE", "+1787": "PR", "+66": "TH", "+598": "UY", "+58": "VE",
};

// ISO alpha-2 → código de marcación. Inverso de PHONE_TO_CODE; lo usa el filtro de País de
// Contactos, donde la columna `country_code` guarda el dial code ("+57") pero el filtro
// ofrece ISO ("CO"). Sin esto, `country_code === "CO"` nunca matchea.
const ISO_TO_DIAL: Record<string, string> = {
  AR: "+54", BO: "+591", BR: "+55", GB: "+44", CL: "+56", CO: "+57", CR: "+506", CU: "+53",
  DO: "+1", EC: "+593", SV: "+503", ES: "+34", US: "+1", GT: "+502", HN: "+504", IT: "+39",
  MX: "+52", NI: "+505", PA: "+507", PY: "+595", PE: "+51", PR: "+1", TH: "+66", UY: "+598", VE: "+58",
};

/** Dado un ISO alpha-2 ("CO") devuelve el código de marcación ("+57"), o null si no se conoce. */
export function dialForIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return ISO_TO_DIAL[iso.trim().toUpperCase()] ?? null;
}

function resolveCode(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (COUNTRY_DATA[upper]) return upper;
  const lower = trimmed.toLowerCase();
  if (NAME_TO_CODE[lower]) return NAME_TO_CODE[lower];
  // Try phone prefix
  if (trimmed.startsWith("+")) {
    // Try longest match first
    for (const len of [5, 4, 3, 2]) {
      const prefix = trimmed.slice(0, len);
      if (PHONE_TO_CODE[prefix]) return PHONE_TO_CODE[prefix];
    }
  }
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

/** Short display: flag + ISO code, e.g. "🇨🇴 CO" */
export function getCountryShortDisplay(countryInput: string | null | undefined): string {
  if (!countryInput) return "—";
  const code = resolveCode(countryInput);
  if (!code) return countryInput;
  return `${COUNTRY_DATA[code].flag} ${code}`;
}

/** Mask a phone number: show only last 4 digits */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return "••••";
  return "•".repeat(digits.length - 4) + digits.slice(-4);
}

/**
 * Muestra un teléfono respetando la visibilidad por rol: completo si el usuario
 * está autorizado (admin), enmascarado (últimos 4) si no. Usar con
 * `const canSee = useUserRole().isAdmin` en el componente.
 */
export function displayPhone(phone: string | null | undefined, canSeeFull: boolean): string {
  if (!phone) return "";
  return canSeeFull ? phone : maskPhone(phone);
}

/**
 * Dígitos crudos para un link wa.me SOLO si está autorizado. Si no, devuelve null
 * para que el componente NO renderice el link (el número no debe ir ni en el href).
 */
export function waMeDigits(phone: string | null | undefined, canSeeFull: boolean): string | null {
  if (!phone || !canSeeFull) return null;
  return phone.replace(/[^0-9]/g, "");
}

/** Get all available countries as an array for Select components */
export function getCountryOptions(): Array<{ code: string; name: string; flag: string }> {
  return Object.entries(COUNTRY_DATA)
    .map(([code, { name, flag }]) => ({ code, name, flag }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve any country input to its ISO code */
export function resolveCountryCode(input: string | null | undefined): string | null {
  if (!input) return null;
  return resolveCode(input);
}
