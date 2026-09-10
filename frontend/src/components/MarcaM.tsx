/** La M de Maven.
 *
 *  Caja de 53 × 33 (apaisada, 1,6 veces más ancha que alta) con cuatro cintas
 *  de ancho 10 y puntas redondas: las dos patas de AFUERA van apagadas y la V
 *  del medio, CLARA, pasa por encima. Es el dibujo del mock que aprobó Jhon el
 *  10/09/2026, medido píxel a píxel sobre su recorte (cimas en x 14,5 y 38,5;
 *  pies en x 5 y 48; vértice del medio en x 26,5).
 *
 *  Va dentro de la baldosa de la marca, así que por defecto se pinta en blanco
 *  sobre el color de la baldosa. El mismo dibujo sirve para el menú, la portada
 *  y los iconos (ver frontend/scripts/genera-iconos.py). */

/** Cuánto más ancha que alta es la M. Para calcular el ancho a partir del alto. */
export const M_RATIO = 53 / 33;

interface MarcaMProps {
  /** Alto de la M como longitud CSS ("11px", "0.48em"). El ancho sale solo. */
  alto: string;
  /** La V del medio. */
  claro?: string;
  /** Las dos patas de afuera. */
  oscuro?: string;
  className?: string;
}

export function MarcaM({
  alto,
  claro = "#fff",
  oscuro = "rgba(255,255,255,.55)",
  className,
}: MarcaMProps) {
  return (
    <svg
      viewBox="0 0 53 33"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ height: alto, width: `calc(${alto} * ${M_RATIO})`, display: "block" }}
    >
      <g strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 5.5 5 27" stroke={oscuro} />
        <path d="M38.5 5.5 48 27" stroke={oscuro} />
        <path d="M14.5 5.5 26.5 27.5 38.5 5.5" stroke={claro} />
      </g>
    </svg>
  );
}

export default MarcaM;
