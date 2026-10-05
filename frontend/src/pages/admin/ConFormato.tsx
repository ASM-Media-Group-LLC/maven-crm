import { Fragment, type ReactNode } from "react";

/**
 * Un párrafo traducido con sus pedazos de formato adentro.
 *
 * El diccionario guarda cada párrafo ENTERO en una clave (ver lib/i18n/admin.ts)
 * para que se traduzca como una frase y no como tres pedazos sueltos alrededor
 * de un <strong>. Acá se vuelve a armar:
 *   · **texto**  → negrita (con `claseNegrita` si hace falta otro color)
 *   · {nombre}   → el nodo de `piezas.nombre` (un badge, un nombre resaltado).
 *     Solo si NO se pasó como parámetro de t(): lo que t() ya reemplazó llega
 *     como texto.
 */
export function ConFormato({
  texto,
  piezas,
  claseNegrita,
}: {
  texto: string;
  piezas?: Record<string, ReactNode>;
  claseNegrita?: string;
}) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*|\{\w+\})/g).map((trozo, i) => {
        if (trozo.startsWith("**") && trozo.endsWith("**") && trozo.length > 4) {
          return <strong key={i} className={claseNegrita}>{trozo.slice(2, -2)}</strong>;
        }
        const pieza = /^\{(\w+)\}$/.exec(trozo)?.[1];
        if (pieza && piezas && pieza in piezas) return <Fragment key={i}>{piezas[pieza]}</Fragment>;
        return trozo ? <Fragment key={i}>{trozo}</Fragment> : null;
      })}
    </>
  );
}
