// LAS CARAS DE LA PORTADA.
//
// Son personas INVENTADAS. La portada es pública: no muestra a nadie del
// equipo ni de ningún cliente, ni una conversación real, ni una cifra de
// nadie. En vez de caras, se dibuja una SILUETA NEUTRA: una figura genérica
// sobre un círculo con un tinte estable por seed (mismo seed → mismo color),
// para distinguir quién es quién sin mostrar un rostro caricaturesco.
export const GENTE = [
  { seed: "camilo", nombre: "Camilo" },
  { seed: "valentina", nombre: "Valentina" },
  { seed: "luciana", nombre: "Luciana" },
  { seed: "andres", nombre: "Andrés" },
  { seed: "martina", nombre: "Martina" },
  { seed: "emilio", nombre: "Emilio" },
  { seed: "joaquin", nombre: "Joaquín" },
  { seed: "sofia", nombre: "Sofía" },
] as const;

export type Seed = (typeof GENTE)[number]["seed"];

const POR_SEED = new Map(GENTE.map((p) => [p.seed, p]));

export const nombreDe = (seed: Seed) => POR_SEED.get(seed)?.nombre ?? "";

/** Un tinte estable por persona (mismo seed → mismo color), apagado a
 *  propósito para que la silueta se vea neutra y no caricaturesca. */
function tono(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** La silueta neutra, como data-URI SVG. Se entrega dentro de un <img> igual
 *  que antes, para no tocar el CSS que ya le da tamaño y borde redondo. */
export function siluetaUri(seed: string): string {
  const h = tono(seed);
  const fondo = `hsl(${h} 22% 24%)`;
  const figura = `hsl(${h} 16% 70%)`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>` +
    `<rect width='80' height='80' fill='${fondo}'/>` +
    `<circle cx='40' cy='31' r='13' fill='${figura}'/>` +
    `<path d='M18 68c0-12.5 9.8-20 22-20s22 7.5 22 20z' fill='${figura}'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Una cara (ahora una silueta neutra). `alt=""` a propósito: es decorativa,
 *  el nombre siempre está en el texto de al lado y repetirlo solo ensucia el
 *  lector de pantalla. */
export function Cara({ seed, className, style }: { seed: Seed; className?: string; style?: React.CSSProperties }) {
  return <img src={siluetaUri(seed)} alt="" className={className} style={style} />;
}

/** La fila de caras superpuestas, como en el sidebar de la app. */
export function Pila({ cuantas = 5, desde = 0 }: { cuantas?: number; desde?: number }) {
  return (
    <span className="pila" aria-hidden="true">
      {GENTE.slice(desde, desde + cuantas).map((p) => (
        <Cara key={p.seed} seed={p.seed} />
      ))}
    </span>
  );
}
