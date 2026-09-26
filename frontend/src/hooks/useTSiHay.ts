import { useLanguageSiHay } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";

/** `t()` para las primitivas de components/ui/ (buscadores, selectores de fecha,
 *  encabezados), que se usan en toda la app y dibujan un texto propio cuando la
 *  pantalla no les pasa uno.
 *
 *  ⚠️ NO TIRA si falta el LanguageProvider, igual que `useFormato()`: una
 *  primitiva se puede montar fuera del árbol de la app (la factura en PDF, un test
 *  que monta la pantalla sola), y un placeholder no puede ser la razón de una
 *  pantalla en negro. Sin proveedor cae en `traducir()`, que lee el idioma que la
 *  app ya tiene fijado: el correcto, aunque no se vuelva a dibujar solo. */
export function useTSiHay(): (key: TranslationKey, params?: Record<string, string | number>) => string {
  return useLanguageSiHay()?.t ?? traducir;
}
