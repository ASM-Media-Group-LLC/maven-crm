// El paisaje nocturno que comparten las vistas de pausa de Cowork y el tipo con
// el que el tablero arma la pausa de una sala. La miniatura SalaEnPausa que
// vivía aquí (mock de Álvaro, 10/09) se retiró con el rediseño v5 del tablero
// (10/2026): ya nadie la montaba; quedan MiPausa y SupervisorEnPausa, que
// dibujan este mismo fondo.
import { useId } from "react";

export interface PausaDeSala {
  /** "meet" = la sala entera está en un meet grupal del supervisor: no es una
   *  pausa (el reloj sigue sumando), pero la miniatura se apaga igual. */
  kind: "bano" | "break" | "almuerzo" | "meet";
  /** Segundos que lleva ESTA pausa. */
  segundos: number;
  /** Epoch ms de cuándo arrancó. */
  desde: number | null;
  /** Tope en minutos (break: por pausa; baño: presupuesto del día). null = sin tope. */
  limiteMin: number | null;
  /** Baño: segundos ya gastados hoy en pausas anteriores. */
  consumidoSeg: number;
  excedida: boolean;
  /** Segundos CERRADOS hoy por tipo de pausa (baño/break/almuerzo) de la
   *  persona que se muestra, para el resumen "Hoy en pausas" de la tarjeta.
   *  Si falta, la tarjeta no dibuja los recuadros (p. ej. el meet grupal). */
  resumenHoy?: Record<string, number>;
  /** Topes en minutos por tipo, para los recuadros. */
  limites?: Record<string, number>;
}

// El "paisaje" de fondo de las vistas en pausa del mock (Jhon, 10/09: "tienen
// hasta una especie de paisaje detrás"). Dibujado en SVG —noche, luna, cerros y
// pinos— para no depender de una foto ni de la red, y siempre oscuro para que
// el ámbar del tiempo y el texto claro se lean igual en los dos temas.
const ESTRELLAS: Array<[number, number, number]> = [
  [22, 26, 1.2], [58, 14, 0.8], [96, 40, 1], [132, 18, 0.7], [166, 52, 1.1], [190, 22, 0.8],
  [214, 86, 0.7], [292, 30, 1], [306, 74, 0.7], [76, 78, 0.8], [40, 96, 0.6], [150, 84, 0.6],
];
const PINOS: Array<[number, number]> = [[26, 44], [44, 60], [60, 36], [236, 40], [256, 58], [276, 34], [296, 48]];

export function PaisajeDePausa({ excedida }: { excedida: boolean }) {
  // Cada panel lleva sus propios degradados: con varios en pantalla, ids
  // repetidos harían que todos usaran los del primero.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cielo = `${id}-cielo`, luna = `${id}-luna`, velo = `${id}-velo`;
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={cielo} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#090c1f" />
          <stop offset="0.55" stopColor="#151a44" />
          <stop offset="1" stopColor="#3b2a6e" />
        </linearGradient>
        <radialGradient id={luna} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#fde68a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={velo} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070f" stopOpacity="0.5" />
          <stop offset="1" stopColor="#05070f" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill={`url(#${cielo})`} />
      {ESTRELLAS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#e9e6ff" opacity="0.7" />)}
      <circle cx="248" cy="58" r="44" fill={`url(#${luna})`} />
      <circle cx="248" cy="58" r="14" fill="#fef3c7" opacity="0.95" />
      {/* cerros lejanos y cercanos */}
      <path d="M0 168 L48 118 L86 150 L128 104 L172 146 L214 112 L258 152 L292 128 L320 150 L320 240 L0 240 Z" fill="#1c2150" />
      <path d="M0 196 L40 166 L92 190 L150 156 L206 188 L262 162 L320 192 L320 240 L0 240 Z" fill="#111538" />
      {PINOS.map(([x, h]) => <path key={x} d={`M${x} ${240 - h} L${x - h * 0.28} 240 L${x + h * 0.28} 240 Z`} fill="#0a0d24" />)}
      <rect width="320" height="240" fill={`url(#${velo})`} />
      {excedida && <rect width="320" height="240" fill="#7f1d1d" opacity="0.5" />}
    </svg>
  );
}
