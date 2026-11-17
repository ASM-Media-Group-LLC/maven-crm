import type Diccionario from "./diccionario";
import type { TranslationKey as ClaveDelDiccionario } from "./diccionario";
import { type Idioma } from "./idiomas";

// LAS TRADUCCIONES, MIENTRAS LA APP CORRE.
//
// El diccionario se ESCRIBE en lib/diccionario.ts (+ lib/i18n/<módulo>.ts), en
// español e inglés. Al compilar, el plugin scripts/i18n/vitePluginIdiomas.ts
// arma un paquete por idioma —completo: lo que a un idioma traducido le falta,
// lo rellena con inglés— y la app baja SOLO el de la persona (`cargarIdioma`).
// Antes las 13.000+ frases de los dos idiomas viajaban dentro del archivo
// principal y se bajaban siempre (medido el 16/11/2026: era lo más pesado).
//
// Antes de pintar, main.tsx espera `cargarIdioma(idioma inicial)`, así que `t()`
// y `traducir()` siempre encuentran su texto. Cambiar de idioma también espera
// la carga (useLanguage → setLanguage).
//
// `useLanguage()` solo se puede llamar dentro de un componente de React. Para
// lo que no lo es (toasts en callbacks, mensajes de lib/), `traducir()` lee el
// idioma que fija el LanguageProvider con `fijarIdioma()`.
//
// ⚠️ Para texto que se RENDERIZA usa siempre el hook. `traducir()` lee el idioma
// en el momento de la llamada y no vuelve a correr solo.

export type Language = Idioma;
export type TranslationKey = ClaveDelDiccionario;

type Catalogo = Record<string, string>;

const catalogos: Partial<Record<Language, Catalogo>> = {};

// Un import() por idioma, escrito a mano: así Vite parte un archivo por cada
// uno y nadie baja los seis.
const CARGADORES: Record<Language, () => Promise<{ default: Catalogo }>> = {
  en: () => import("virtual:maven-i18n/en"),
  es: () => import("virtual:maven-i18n/es"),
  de: () => import("virtual:maven-i18n/de"),
  fr: () => import("virtual:maven-i18n/fr"),
  it: () => import("virtual:maven-i18n/it"),
  pt: () => import("virtual:maven-i18n/pt"),
};

const enCurso = new Map<Language, Promise<void>>();

/** Baja (una vez) el paquete de un idioma. Si falla la red, no rompe: `t()`
 *  cae en el idioma que ya esté cargado y, en último caso, muestra la clave. */
export function cargarIdioma(lang: Language): Promise<void> {
  if (catalogos[lang]) return Promise.resolve();
  const ya = enCurso.get(lang);
  if (ya) return ya;
  // Un segundo intento si la red falla (conexiones flojas): sin el paquete,
  // toda la pantalla mostraría claves en vez de frases.
  const p = CARGADORES[lang]()
    .catch(() => new Promise<void>((r) => setTimeout(r, 800)).then(() => CARGADORES[lang]()))
    .then((m) => { catalogos[lang] = m.default; })
    .catch((e) => { console.warn(`[i18n] no se pudo cargar «${lang}»`, e); })
    .finally(() => enCurso.delete(lang));
  enCurso.set(lang, p);
  return p;
}

export const idiomaCargado = (lang: Language): boolean => !!catalogos[lang];

/** Carga un catálogo ya armado (lo usan las pruebas y el servidor de desarrollo). */
export function registrarCatalogo(lang: Language, catalogo: Catalogo): void {
  catalogos[lang] = catalogo;
}

// El diccionario fuente completo ({ es, en } por clave). En la app queda VACÍO:
// solo lo llenan las pruebas (test/setup.ts), que lo leen entero.
const diccionarioRegistrado: Record<string, { es: string; en: string }> = {};

export function registrarDiccionario(d: Record<string, { es: string; en: string }>): void {
  Object.assign(diccionarioRegistrado, d);
  const es: Catalogo = {}, en: Catalogo = {};
  for (const [k, v] of Object.entries(d)) { es[k] = v.es; en[k] = v.en; }
  catalogos.es = { ...(catalogos.es ?? {}), ...es };
  catalogos.en = { ...(catalogos.en ?? {}), ...en };
}

let idiomaActual: Language = "es";

export function fijarIdioma(lang: Language): void {
  idiomaActual = lang;
}

/** El idioma de la interfaz, para código que no es un componente. */
export function idioma(): Language {
  return idiomaActual;
}

export function traducir(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return getTranslation(key, idiomaActual, params);
}

// Si falta la clave en el idioma pedido, cae en inglés y luego en español; si
// no está en ninguno, devuelve la clave tal cual (así se nota en QA).
export function getTranslation(
  key: TranslationKey,
  lang: Language,
  params?: Record<string, string | number>,
): string {
  let s: string = catalogos[lang]?.[key] ?? catalogos.en?.[key] ?? catalogos.es?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** El diccionario fuente. Solo tiene contenido en las pruebas. */
export default diccionarioRegistrado as unknown as typeof Diccionario;
