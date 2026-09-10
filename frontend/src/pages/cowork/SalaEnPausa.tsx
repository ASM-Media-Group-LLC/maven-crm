// La miniatura de una sala cuando TODOS los que están en ella marcaron pausa.
//
// Mock de Álvaro (10/09), que reemplaza al panel gris del 08/09: la miniatura
// sigue APAGADA (nada de video ni punto verde), pero ahora se lee de un vistazo
// también en el teléfono, donde la anterior no cabía (cuatro renglones en 98 px
// de alto y el "le quedan 13" se cortaba). Taza en un anillo, el tiempo grande
// al lado, un renglón con desde cuándo y cuánto queda, y una frase corta para
// que la pausa no parezca una falta. Rojo y latiendo si se pasó.
import { useId } from "react";
import { Coffee, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { fraseDePausa } from "@/lib/frasesDePausa";

export interface PausaDeSala {
  /** "meet" = la sala entera está en un meet grupal del supervisor: no es una
   *  pausa (el reloj sigue sumando), pero la miniatura se apaga igual. */
  kind: "bano" | "break" | "meet";
  /** Segundos que lleva ESTA pausa. */
  segundos: number;
  /** Epoch ms de cuándo arrancó. */
  desde: number | null;
  /** Tope en minutos (break: por pausa; baño: presupuesto del día). null = sin tope. */
  limiteMin: number | null;
  /** Baño: segundos ya gastados hoy en pausas anteriores. */
  consumidoSeg: number;
  excedida: boolean;
}

const mmss = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const horaCorta = (epoch: number | null) =>
  epoch ? new Date(epoch).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : null;

// El "paisaje" de fondo de las miniaturas en pausa del mock (Jhon, 10/09:
// "tienen hasta una especie de paisaje detrás"). Dibujado en SVG —noche, luna,
// cerros y pinos— para no depender de una foto ni de la red, y siempre oscuro
// para que el ámbar del tiempo y el texto claro se lean igual en los dos temas.
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

/** Textos y proporción del tope. Puro, para probarlo. */
export function describirPausa(p: PausaDeSala): { titulo: string; detalle: string; pct: number; tono: "ok" | "poco" | "excedida" } {
  const esBano = p.kind === "bano";
  const titulo = p.kind === "meet" ? "En meet grupal" : esBano ? "En el baño" : "En break";
  const partes: string[] = [];
  const desde = horaCorta(p.desde);
  if (desde) partes.push(`Desde ${desde}`);
  // El meet no tiene tope ni se "pasa": solo desde cuándo.
  if (p.kind === "meet") return { titulo, detalle: partes.join(" · "), pct: 0, tono: "ok" };
  let pct = 0;
  let tono: "ok" | "poco" | "excedida" = "ok";
  if (p.limiteMin != null) {
    const topeSeg = p.limiteMin * 60;
    const usado = (esBano ? p.consumidoSeg : 0) + p.segundos;
    pct = Math.min(100, Math.round((usado / topeSeg) * 100));
    const deMas = usado - topeSeg;
    if (deMas >= 0) {
      tono = "excedida";
      partes.push(esBano ? `Pasó los ${p.limiteMin} min de baño de hoy` : `${Math.ceil(deMas / 60)} min de más`);
    } else {
      tono = pct >= 75 ? "poco" : "ok";
      partes.push(esBano
        ? `Hoy lleva ${Math.round(usado / 60)} de ${p.limiteMin} min`
        : `Quedan ${Math.ceil((topeSeg - usado) / 60)} min`);
    }
  } else {
    partes.push("Sin tope");
  }
  return { titulo: tono === "excedida" ? `${titulo} · pasado` : titulo, detalle: partes.join(" · "), pct, tono };
}

export default function SalaEnPausa({ pausa, className }: { pausa: PausaDeSala; className?: string }) {
  const d = describirPausa(pausa);
  const excedida = d.tono === "excedida";
  const esMeet = pausa.kind === "meet";
  // Ámbar es pausa; el meet grupal es trabajo y va en el color de la marca.
  const acento = excedida ? "text-destructive" : esMeet ? "text-primary" : "text-warning";
  // En la miniatura el título va en una línea al lado del anillo: "En break ·
  // pasado" no cabe en el teléfono, así que pasado el tope se acorta.
  const etiqueta = excedida ? (pausa.kind === "bano" ? "Baño pasado" : "Break pasado") : d.titulo;
  // "Desde 1:51 p. m." y "Quedan 24 min": en el teléfono (163 px de ancho útil)
  // van en dos renglones limpios; en escritorio, en uno separados por el punto.
  const partes = d.detalle.split(" · ");
  return (
    <div
      data-testid="sala-en-pausa"
      data-tono={d.tono}
      className={cn(
        // Medidas del teléfono primero (la tarjeta mide 179 px y el área 4:3 da 122 px
        // de alto); en escritorio (300 px, 16:9) todo crece un punto.
        "relative h-36 overflow-hidden rounded-xl border flex flex-col items-center justify-center gap-1 px-3 py-1.5 text-center md:gap-1.5 md:py-2",
        excedida ? "border-destructive/40" : "border-border",
        className,
      )}
    >
      <PaisajeDePausa excedida={excedida} />
      <div className="relative flex items-center gap-2.5 md:gap-3">
        <div className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 md:h-10 md:w-10",
          excedida
            ? "bg-destructive/15 text-destructive ring-destructive/40 animate-pulse motion-reduce:animate-none"
            : esMeet ? "bg-primary/15 text-primary ring-primary/50" : "bg-warning/15 text-warning ring-warning/50",
        )}>
          {pausa.kind === "bano"
            ? <span aria-hidden className="text-base leading-none md:text-lg">🚻</span>
            : esMeet ? <Video className="h-4 w-4 md:h-5 md:w-5" /> : <Coffee className="h-4 w-4 md:h-5 md:w-5" />}
        </div>
        <div className="text-left">
          <div className={cn("whitespace-nowrap text-[11px] font-semibold leading-none", acento)}>{etiqueta}</div>
          <div className={cn("font-display text-xl font-bold tabular-nums leading-tight md:text-2xl", acento)}>{mmss(pausa.segundos)}</div>
        </div>
      </div>
      <div className={cn("relative text-[10px] leading-snug md:text-[11px]", excedida ? "text-red-100/85" : "text-white/80")}>
        {partes.map((p, i) => (
          <span key={p} className="whitespace-nowrap">
            {i > 0 && <span className="hidden md:inline"> · </span>}
            {i > 0 && <br className="md:hidden" />}
            {p}
          </span>
        ))}
      </div>
      {/* La frase es del break y de cuando va bien: pasado el tope, sobra. */}
      {pausa.kind === "break" && !excedida && (
        <p className="relative line-clamp-2 max-w-[30ch] text-[10px] italic leading-snug text-white/60">{fraseDePausa(pausa.desde)}</p>
      )}
    </div>
  );
}
