// El idioma de los tests que DIBUJAN pantallas del Messenger (y de la llamada).
//
// Estas pantallas ahora sacan su texto de `t()` (useLanguage), y useLanguage
// tira si no hay LanguageProvider alrededor. En vez de envolver cada render, el
// test hace:
//
//     vi.mock("@/hooks/useLanguage", (original) =>
//       import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
//
// y la pantalla se dibuja con el diccionario REAL en español. Así los tests
// siguen buscando el mismo texto que ve la gente ("Frecuentes", "Entrar"…) y
// no la clave: un mock que devuelve la clave tal cual dejaba pasar una clave
// equivocada, y la que se ve en pantalla es la que importa.
//
// El objeto es UNO y el mismo en cada render: `t` va en dependencias de
// useCallback/useEffect, y una función nueva por render las haría correr de más.
import { getTranslation, type Language, type TranslationKey } from "@/lib/i18n";

const contexto = {
  language: "es" as Language,
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: TranslationKey, params?: Record<string, string | number>) => getTranslation(key, "es", params),
};

export async function idiomaEnEspanol(original: () => Promise<unknown>) {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, useLanguage: () => contexto, useLanguageSiHay: () => contexto };
}
