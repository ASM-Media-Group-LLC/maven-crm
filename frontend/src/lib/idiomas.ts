// LOS IDIOMAS DE MAVEN (16/11/2026).
//
// Inglés es el principal; español es el idioma en que se escribe el código (la
// fuente, junto al inglés, en lib/diccionario.ts). Alemán, francés, italiano y
// portugués se traducen con IA (scripts/i18n/traducir.mjs) y, si a alguna
// clave todavía le falta, se muestra en inglés.
//
// Idioma nuevo: sumarlo a IDIOMAS, NOMBRE_IDIOMA, LOCALE_INTL y a los
// cargadores de lib/i18n.ts, y correr el traductor. Nada más.

export const IDIOMAS = ["en", "es", "de", "fr", "it", "pt"] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** Los dos idiomas que se escriben a mano en el diccionario. */
export const IDIOMAS_FUENTE = ["es", "en"] as const;
/** Los que se traducen con IA a partir de la fuente. */
export const IDIOMAS_TRADUCIDOS = ["de", "fr", "it", "pt"] as const;

/** El nombre de cada idioma en ese mismo idioma (así lo encuentra quien lo habla). */
export const NOMBRE_IDIOMA: Record<Idioma, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
};

/** Locale para `Intl.*` / `toLocaleString`. El español conserva su variante por
 *  lugar (ver lib/formato.ts); este es el de por defecto. */
export const LOCALE_INTL: Record<Idioma, string> = {
  en: "en-US",
  es: "es-CO",
  de: "de-DE",
  fr: "fr-FR",
  it: "it-IT",
  pt: "pt-BR",
};

export const esIdioma = (v: unknown): v is Idioma =>
  typeof v === "string" && (IDIOMAS as readonly string[]).includes(v);

/** El primer idioma del navegador que Maven habla; si ninguno, inglés. */
export function idiomaDelNavegador(): Idioma {
  try {
    const lista = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of lista) {
      const base = (l ?? "").toLowerCase().split("-")[0];
      if (esIdioma(base)) return base;
    }
  } catch {
    // Sin navigator (pruebas, entornos raros): inglés.
  }
  return "en";
}

/** Para pantallas que todavía solo conocen español e inglés (tablas de
 *  etiquetas, visores): el español queda en español y cualquier otro idioma
 *  cae en inglés, como el resto de la app. */
export const idiomaFuente = (lang: Idioma): "es" | "en" => (lang === "es" ? "es" : "en");
