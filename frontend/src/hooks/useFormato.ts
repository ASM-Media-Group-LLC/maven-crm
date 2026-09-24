import { useMemo } from "react";
import { useLanguageSiHay } from "@/hooks/useLanguage";
import { idioma } from "@/lib/i18n";
import { formato, type Formato } from "@/lib/formato";

/** Fechas, números y plata en el idioma de la interfaz, para lo que se DIBUJA.
 *  Se recalcula al cambiar el idioma. Ver lib/formato.ts.
 *
 *  ⚠️ NO TIRA si falta el LanguageProvider, a propósito. Lo usan 169 componentes, y
 *  alguno se puede dibujar fuera del árbol de la app (FacturacionPage monta un
 *  createRoot aparte para la factura en PDF). `useLanguage()` tira en ese caso, y un
 *  formato de fecha no puede ser la razón de una pantalla en negro. Sin proveedor usa
 *  el idioma que la app ya tiene fijado (`idioma()`, que el LanguageProvider mantiene
 *  al día): el correcto, aunque no se vuelva a dibujar solo si cambia. */
export function useFormato(): Formato {
  const ctx = useLanguageSiHay();
  const lang = ctx?.language ?? idioma();
  return useMemo(() => formato(lang), [lang]);
}
