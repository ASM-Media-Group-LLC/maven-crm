// Fechas, números y plata en el idioma de la interfaz.
//
// POR QUÉ EXISTE. Traducir los textos no alcanza: 153 archivos formateaban con el
// idioma español fijo —`toLocaleString("es-CO")`, `Intl.NumberFormat("es-ES")`,
// `format(d, "...", { locale: es })`— así que con la app en inglés los calendarios
// seguían diciendo "septiembre, lun mar mié" y los montos "1.234,56". Y el freno de
// i18n no lo puede ver: busca palabras españolas, no locales, y los dos selectores
// de fecha viven en components/ui/, que está fuera de su alcance a propósito.
//
// LA REGLA, QUE ES LO QUE HACE SEGURO EL CAMBIO: en ESPAÑOL no cambia nada. Cada
// lugar declara el español que ya usaba (`f.intl("es-ES")`), y ese es exactamente el
// que sigue saliendo; solo en inglés pasa a `en-US`. Así quien usa la app en español
// hoy ve lo mismo byte por byte, y el único cambio visible es el que se pidió.
//
// ⚠️ LA MONEDA NO ES EL IDIOMA. `intl()` cambia cómo se ESCRIBE un número, nunca de
// qué moneda es: un monto en COP sigue en COP, con `currency: "COP"`, aunque la app
// esté en inglés. Por eso no hay acá ningún helper de "moneda por defecto".
//
// ⚠️ LO QUE SE DIBUJA USA EL HOOK. `useFormato()` se vuelve a calcular al cambiar el
// idioma. `formatoActual()` lee el idioma en el momento de la llamada y NO vuelve a
// correr: sirve para un toast o un texto que se arma y se muestra una vez; dentro del
// JSX deja la fecha en el idioma que había cuando se montó el componente (misma regla
// que `traducir()` en lib/i18n.ts).
//
// ⚠️ LO QUE NO ES PARA ESTE USUARIO NO SE TOCA. Un reporte que el bot manda a un
// grupo de WhatsApp, un CSV que se exporta, un texto que se guarda en la base: esos
// tienen su propio idioma, que NO es el de quien apretó el botón. Siguen con su
// locale fijo, a propósito.

import { enUS, es, type Locale } from "date-fns/locale";
import { idioma, type Language } from "@/lib/i18n";

/** Las variantes de español que ya usaba la app. Cada lugar conserva la suya. */
export type LocaleEspanol = "es-CO" | "es-ES" | "es-AR" | "es-CL" | "es-MX";

export interface Formato {
  idioma: Language;
  /** Locale para `Intl.*` y `toLocaleString`. En español devuelve el que se le pasa
   *  (el que ese lugar ya usaba); en inglés, siempre "en-US". */
  intl: (espanol?: LocaleEspanol) => string;
  /** Locale para date-fns: `format(d, patron, { locale: f.fechas })`.
   *  ⚠️ Si el patrón tiene palabras en español adentro ("d 'de' MMMM"), cambiar el
   *  locale NO alcanza: hay que elegir el patrón según `f.idioma`. */
  fechas: Locale;
}

export function formato(lang: Language): Formato {
  const enIngles = lang === "en";
  return {
    idioma: lang,
    intl: (espanol: LocaleEspanol = "es-CO") => (enIngles ? "en-US" : espanol),
    fechas: enIngles ? enUS : es,
  };
}

/** Para código que NO se dibuja (toasts, mensajes que se arman una vez). */
export function formatoActual(): Formato {
  return formato(idioma());
}
