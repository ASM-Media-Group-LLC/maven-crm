import { traducir, type TranslationKey } from "@/lib/i18n";

// LA ETIQUETA DE UN CATÁLOGO COMPARTIDO, EN EL IDIOMA DE LA INTERFAZ.
//
// Los catálogos de lib/ y hooks/ (los tipos de contrato de RRHH, los filtros de
// la campana, los presets de rango, los skins, los eventos de Ajustes →
// Notificaciones…) los leen pantallas de varios módulos, y casi todas dibujan
// `opcion.label`. Hasta sep 2026 ese `label` era un texto fijo en español.
//
// Cada opción trae ahora tres cosas:
//   - el DATO (`value`, `key`, `id`, `type`): lo que se guarda en la base, va en
//     la URL o se compara. NO se traduce nunca.
//   - `labelKey`: la clave del diccionario. Lo correcto en una pantalla es
//     `t(opcion.labelKey)`, que se vuelve a dibujar sola al cambiar el idioma.
//   - `label`: la misma clave resuelta con traducir() AL LEERLA. Es un getter, no
//     un texto guardado: así las pantallas que todavía dibujan `opcion.label` salen
//     en el idioma de la interfaz sin tocarlas. ⚠️ Igual que traducir(), no hace
//     que el componente se vuelva a dibujar: se ve bien en cualquier componente
//     que ya use useLanguage() (se redibuja al cambiar el idioma), y queda viejo
//     hasta el próximo render en uno que no lo use.

export type ConEtiqueta<T> = T & { readonly labelKey: TranslationKey; readonly label: string };

/** `base` más `labelKey` y un `label` que se traduce al leerlo. */
export function conEtiqueta<T extends object>(base: T, labelKey: TranslationKey): ConEtiqueta<T> {
  return Object.defineProperties({ ...base }, {
    labelKey: { value: labelKey, enumerable: true },
    label: { get: () => traducir(labelKey), enumerable: true },
  }) as ConEtiqueta<T>;
}

/** La forma de casi todos los catálogos: `[value, labelKey]` → `{ value, labelKey, label }`. */
export function opciones(
  pares: ReadonlyArray<readonly [string, TranslationKey]>,
): ConEtiqueta<{ value: string }>[] {
  return pares.map(([value, labelKey]) => conEtiqueta({ value }, labelKey));
}

/** Un mapa `clave → etiqueta` (p. ej. el nombre visible de cada columna del
 *  historial de un empleado) cuyos valores se traducen al leerlos. */
export function etiquetasPorClave(claves: Record<string, TranslationKey>): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [clave, labelKey] of Object.entries(claves)) {
    Object.defineProperty(salida, clave, { get: () => traducir(labelKey), enumerable: true });
  }
  return salida;
}
