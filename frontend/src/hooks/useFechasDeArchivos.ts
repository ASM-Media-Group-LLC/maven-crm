import { useCallback, useMemo } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { fechaCompleta, fechaCorta } from "@/lib/drive/fechas";

/** Las fechas del Drive y de la Oficina en el idioma de la pantalla (ver
 *  lib/drive/fechas.ts): `corta` para la lista, `completa` para el globito y
 *  los Detalles. */
export function useFechasDeArchivos() {
  const { t } = useLanguage();
  const f = useFormato();
  const hoy = useCallback((hora: string) => t("drive.fecha.hoy", { hora }), [t]);
  return useMemo(() => ({
    corta: (iso: string | null | undefined) => fechaCorta(iso, f, hoy),
    completa: (iso: string | null | undefined) => fechaCompleta(iso, f),
  }), [f, hoy]);
}
