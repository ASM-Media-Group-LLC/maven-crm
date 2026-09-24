import { useMemo } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { formato, type Formato } from "@/lib/formato";

/** Fechas, números y plata en el idioma de la interfaz, para lo que se DIBUJA.
 *  Se recalcula al cambiar el idioma. Ver lib/formato.ts. */
export function useFormato(): Formato {
  const { language } = useLanguage();
  return useMemo(() => formato(language), [language]);
}
