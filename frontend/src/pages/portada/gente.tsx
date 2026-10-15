// LAS CARAS DE LA PORTADA.
//
// Son personas INVENTADAS. La portada es pública: no muestra a nadie del
// equipo ni de ningún cliente, ni una conversación real, ni una cifra de
// nadie. Cada seed tiene su retrato de oficina generado con IA (gente que no
// existe), servido como estático; si una foto no carga, se cae a una silueta
// neutra con un tinte estable por seed. Mismo seed → misma persona en toda la
// página, para que se reconozca de una sección a otra.
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

/** La foto de cada persona inventada: retratos de oficina generados con IA
 *  (no son empleados ni clientes reales), servidos como estáticos desde
 *  `public/portada/caras`. Hombres y mujeres repartidos por seed. */
const FOTO: Record<Seed, string> = {
  camilo: "/portada/caras/cara-01.jpg",
  andres: "/portada/caras/cara-02.jpg",
  emilio: "/portada/caras/cara-03.jpg",
  joaquin: "/portada/caras/cara-04.jpg",
  valentina: "/portada/caras/cara-05.jpg",
  luciana: "/portada/caras/cara-06.jpg",
  martina: "/portada/caras/cara-07.jpg",
  sofia: "/portada/caras/cara-08.jpg",
};

/** Una cara: la foto de oficina de esa persona inventada. `alt=""` a propósito:
 *  es decorativa, el nombre va en el texto de al lado. La clase `cara-foto` le
 *  da `object-fit: cover`. Si la foto no carga, cae a la silueta neutra. */
export function Cara({ seed, className, style }: { seed: Seed; className?: string; style?: React.CSSProperties }) {
  const clase = className ? `cara-foto ${className}` : "cara-foto";
  return (
    <img
      src={FOTO[seed]}
      alt=""
      loading="lazy"
      className={clase}
      style={style}
      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = siluetaUri(seed); }}
    />
  );
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
