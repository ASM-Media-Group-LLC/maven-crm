import { dicebearUri } from "@/lib/avatar";

// LAS CARAS DE LA PORTADA.
//
// Son personas INVENTADAS. La portada es pública: no muestra a nadie del
// equipo ni de ningún cliente, ni una conversación real, ni una cifra de
// nadie. Lo que sí es real es el dibujo: sale del mismo generador
// determinista que usa la app (mismo seed → mismo muñequito), así que quien
// después entra al producto reconoce el estilo de lo que vio en la web.
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

/** Una cara. `alt=""` a propósito: son ilustraciones decorativas, el nombre
 *  siempre está en el texto de al lado y repetirlo solo ensucia el lector de
 *  pantalla. */
export function Cara({ seed, className, style }: { seed: Seed; className?: string; style?: React.CSSProperties }) {
  return <img src={dicebearUri(seed)} alt="" className={className} style={style} />;
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
