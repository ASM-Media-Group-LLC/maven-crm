import { navegacion } from "./i18n/navegacion";
import { comun } from "./i18n/comun";
import { chatCompartido } from "./i18n/chatCompartido";
import { permisos } from "./i18n/permisos";
import { telegram } from "./i18n/telegram";
import { whatsapp } from "./i18n/whatsapp";
import { creadoras } from "./i18n/creadoras";
import { dashboard } from "./i18n/dashboard";
import { ajustes } from "./i18n/ajustes";
import { auth } from "./i18n/auth";
import { pwa } from "./i18n/pwa";
import { calendario } from "./i18n/calendario";
import { correo } from "./i18n/correo";
import { oficina } from "./i18n/oficina";
import { messenger } from "./i18n/messenger";
import { contactos } from "./i18n/contactos";
import { closers } from "./i18n/closers";
import { promolog } from "./i18n/promolog";
import { tickets } from "./i18n/tickets";
import { chatters } from "./i18n/chatters";
import { leadgen } from "./i18n/leadgen";
import { hr } from "./i18n/hr";
import { finanzas } from "./i18n/finanzas";
import { agencyQa } from "./i18n/agencyQa";
import { admin } from "./i18n/admin";
import { creadoresFicha } from "./i18n/creadoresFicha";
import { cowork } from "./i18n/cowork";
import { scouter } from "./i18n/scouter";
import { apiKeys } from "./i18n/apiKeys";

export type Language = "es" | "en";

// EL DICCIONARIO, PARTIDO POR MÓDULO.
//
// Hasta sep 2026 era un solo objeto de 1.400 líneas en este archivo. Con varios
// módulos traduciéndose a la vez, todos los PR tocaban el mismo archivo y
// chocaban entre sí. Ahora cada módulo tiene el suyo en lib/i18n/ y acá solo se
// arma la unión. Las claves no cambiaron: `t("common.save")` sigue igual.
//
//  - Clave nueva: va en el archivo de su módulo y empieza con uno de los
//    prefijos que ese archivo declara en su PREFIJOS_… ("promolog.x" →
//    lib/i18n/promolog.ts). Antes de inventarla, buscá en comun.ts: lo que se
//    repite entre módulos vive ahí.
//  - Módulo nuevo: archivo nuevo en lib/i18n/ con su objeto y su PREFIJOS_…, y
//    sumarlo a la lista de abajo. Si no se suma, sus claves no existen para t().
//
// Lo vigila test/i18n/diccionarioPorModulo.test.ts: ninguna clave en dos
// archivos, cada una con un prefijo de su archivo y con `es` y `en` escritos.
// Una clave repetida entre dos archivos NO la ve tsc (la segunda pisa a la
// primera en silencio); la ve ese test.
const translations = {
  ...navegacion,
  ...comun,
  ...chatCompartido,
  ...permisos,
  ...telegram,
  ...whatsapp,
  ...creadoras,
  ...dashboard,
  ...ajustes,
  ...auth,
  ...pwa,
  ...calendario,
  ...correo,
  ...oficina,
  ...messenger,
  ...contactos,
  ...closers,
  ...promolog,
  ...tickets,
  ...chatters,
  ...leadgen,
  ...hr,
  ...finanzas,
  ...agencyQa,
  ...admin,
  ...creadoresFicha,
  ...cowork,
  ...scouter,
  ...apiKeys,
} as const;

export type TranslationKey = keyof typeof translations;

// EL IDIOMA, PARA EL CÓDIGO QUE NO ES UN COMPONENTE.
//
// `useLanguage()` solo se puede llamar dentro de un componente de React. Pero
// buena parte del texto que ve el usuario NO se escribe ahí: los 1.147 avisos
// `toast()` de la app viven en callbacks, en mutaciones de react-query y en
// hooks sueltos, y los mensajes de validación viven en módulos de `lib/`.
//
// `traducir()` es el mismo diccionario para esos lugares. Lo mantiene al día el
// LanguageProvider, que llama a `fijarIdioma()` cuando cambia el idioma.
//
// ⚠️ Para texto que se RENDERIZA usá siempre el hook. `traducir()` lee el idioma
// en el momento de la llamada y no vuelve a correr solo: si lo usás dentro del
// JSX, el texto se queda en el idioma que había cuando se montó el componente.
// Para un toast eso es exactamente lo que querés (se arma y se muestra); para
// una etiqueta en pantalla, es un bug.
let idiomaActual: Language = "es";

export function fijarIdioma(lang: Language): void {
  idiomaActual = lang;
}

/** El idioma de la interfaz, para código que no es un componente. Mismas reglas
 *  que `traducir()`: se lee en el momento de la llamada y no vuelve a correr. */
export function idioma(): Language {
  return idiomaActual;
}

export function traducir(
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  return getTranslation(key, idiomaActual, params);
}

// Interpolación: t("wa.replyingTo", { name }) reemplaza {name} en el texto. Necesaria para la
// migración i18n completa (casi todos los textos reales tienen partes dinámicas). Si falta la
// clave, devuelve la key tal cual (útil para detectar textos sin traducir en QA).
export function getTranslation(
  key: TranslationKey,
  lang: Language,
  params?: Record<string, string | number>,
): string {
  let s: string = translations[key]?.[lang] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export default translations;
