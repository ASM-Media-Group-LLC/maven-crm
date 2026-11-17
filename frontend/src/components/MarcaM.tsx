import { useId } from "react";

/** La M de Maven: la «M de cinta» de la imagen que trajo Alvaro (16/11/2026),
 *  medida píxel a píxel sobre su original (caja de 336 × 158, trazo 68).
 *
 *  Cada «Λ» es una cinta: la SUBIDA, clara, sube desde el pie, pasa por la
 *  cima y baja un poco; la BAJADA va encima y arranca más abajo con su punta
 *  redonda en sombra (el pliegue), y se aclara hacia el pie. La subida del
 *  segundo «Λ» tapa el pie de la primera bajada. Va en el verde de la marca
 *  (el de los botones), fijo: es la marca, no sigue al skin. Es la misma M de
 *  los iconos (frontend/scripts/genera-iconos.py usa esta misma geometría). */

/** Cuánto más ancha que alta es la M. Para calcular el ancho a partir del alto. */
export const M_RATIO = 336 / 158;

/** El verde de la marca, el del pliegue y el del pie de la bajada. */
// El verde del logo de Alvaro, medido en su imagen (16/11/2026).
export const VERDE_MARCA = "#60dc9c";
const PLIEGUE = ["#247c4f", "#309560", "#39a66c", "#40b476", "#47c27f"];

/** Los dos «Λ»: pie, cima, comienzo de la bajada (su punta redonda) y pie. */
const CINTAS = [
  { pie: [34, 124], cima: [99, 34], punta: [142, 90], fin: [168, 124] },
  { pie: [168, 124], cima: [233, 34], punta: [276, 90], fin: [302, 124] },
] as const;
/** Hacia dónde se aclara la sombra de cada bajada (de arriba-izquierda a abajo-derecha). */
const SOMBRA = [0.912, 0.41];
const R = 34;

interface MarcaMProps {
  /** Alto de la M como longitud CSS ("11px", "0.48em"). El ancho sale solo. */
  alto: string;
  className?: string;
}

export function MarcaM({ alto, className }: MarcaMProps) {
  // Un degradado por bajada; el id único evita que dos logos en la misma
  // página (barra y pie) se pisen los degradados.
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 336 158"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ height: alto, width: `calc(${alto} * ${M_RATIO})`, display: "block" }}
    >
      <defs>
        {CINTAS.map(({ punta }, i) => {
          const x1 = punta[0] - R * SOMBRA[0];
          const y1 = punta[1] - R * SOMBRA[1];
          return (
            <linearGradient
              key={i}
              id={`marca-pliegue-${i}-${id}`}
              gradientUnits="userSpaceOnUse"
              x1={x1}
              y1={y1}
              x2={x1 + 2.6 * R * SOMBRA[0]}
              y2={y1 + 2.6 * R * SOMBRA[1]}
            >
              {PLIEGUE.map((color, k) => (
                <stop key={k} offset={k / (PLIEGUE.length - 1)} stopColor={color} />
              ))}
            </linearGradient>
          );
        })}
      </defs>
      <g strokeWidth={2 * R} strokeLinecap="round" strokeLinejoin="round">
        {CINTAS.map(({ pie, cima, punta, fin }, i) => (
          <g key={i}>
            <polyline points={`${pie} ${cima} ${punta}`} stroke={VERDE_MARCA} />
            <line
              x1={punta[0]}
              y1={punta[1]}
              x2={fin[0]}
              y2={fin[1]}
              stroke={`url(#marca-pliegue-${i}-${id})`}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default MarcaM;
