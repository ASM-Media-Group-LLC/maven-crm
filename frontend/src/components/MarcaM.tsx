import { useId } from "react";

/** La M de Maven: la «M de cinta» del logo nuevo (Alvaro, 16/11/2026).
 *
 *  Caja de 96 × 56 con dos «Λ» de trazo 16 y puntas redondas. Las SUBIDAS van
 *  en el verde de la marca y las BAJADAS, por debajo, con un pliegue: arrancan
 *  en un verde más hondo junto a la cima y se aclaran hacia el pie. Es la misma
 *  M en todos lados —menú de la app, portada, portal— y la de los iconos
 *  (favicon, celular), que salen de frontend/scripts/genera-iconos.py con esta
 *  misma geometría. Va en verde fijo a propósito: es la marca, no sigue al skin. */

/** Cuánto más ancha que alta es la M. Para calcular el ancho a partir del alto. */
export const M_RATIO = 96 / 56;

/** El verde de la marca y el del pliegue (iguales a los de genera-iconos.py). */
export const VERDE_MARCA = "#4fd88d";
export const VERDE_PLIEGUE = "#2a9a5c";

interface MarcaMProps {
  /** Alto de la M como longitud CSS ("11px", "0.48em"). El ancho sale solo. */
  alto: string;
  /** El verde de las subidas (y del pie de las bajadas). */
  claro?: string;
  /** El verde hondo del pliegue, junto a la cima de cada bajada. */
  oscuro?: string;
  className?: string;
}

export function MarcaM({
  alto,
  claro = VERDE_MARCA,
  oscuro = VERDE_PLIEGUE,
  className,
}: MarcaMProps) {
  // Dos degradados por M; el id único evita que dos logos en la misma página
  // (barra y pie) se pisen los degradados.
  const id = useId().replace(/:/g, "");
  const p1 = `marca-pliegue1-${id}`;
  const p2 = `marca-pliegue2-${id}`;
  return (
    <svg
      viewBox="0 0 96 56"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ height: alto, width: `calc(${alto} * ${M_RATIO})`, display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={p1} gradientUnits="userSpaceOnUse" x1="29" y1="10" x2="48" y2="46">
          <stop offset="0" stopColor={oscuro} />
          <stop offset=".6" stopColor={claro} />
        </linearGradient>
        <linearGradient id={p2} gradientUnits="userSpaceOnUse" x1="67" y1="10" x2="86" y2="46">
          <stop offset="0" stopColor={oscuro} />
          <stop offset=".6" stopColor={claro} />
        </linearGradient>
      </defs>
      <g strokeWidth="16" strokeLinecap="round">
        {/* Las bajadas van debajo: el pliegue asoma bajo cada subida. */}
        <line x1="29" y1="10" x2="48" y2="46" stroke={`url(#${p1})`} />
        <line x1="67" y1="10" x2="86" y2="46" stroke={`url(#${p2})`} />
        <line x1="10" y1="46" x2="29" y2="10" stroke={claro} />
        <line x1="48" y1="46" x2="67" y2="10" stroke={claro} />
      </g>
    </svg>
  );
}

export default MarcaM;
