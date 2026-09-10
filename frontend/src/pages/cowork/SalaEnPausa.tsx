// La miniatura de una sala cuando TODOS los que están en ella marcaron pausa.
//
// Mock de Álvaro (10/09), que reemplaza al panel gris del 08/09: la miniatura
// sigue APAGADA (nada de video ni punto verde), pero ahora se lee de un vistazo
// también en el teléfono, donde la anterior no cabía (cuatro renglones en 98 px
// de alto y el "le quedan 13" se cortaba). Taza en un anillo, el tiempo grande
// al lado, un renglón con desde cuándo y cuánto queda, y una frase corta para
// que la pausa no parezca una falta. Rojo y latiendo si se pasó.
import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { fraseDePausa } from "@/lib/frasesDePausa";

export interface PausaDeSala {
  kind: "bano" | "break";
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

/** Textos y proporción del tope. Puro, para probarlo. */
export function describirPausa(p: PausaDeSala): { titulo: string; detalle: string; pct: number; tono: "ok" | "poco" | "excedida" } {
  const esBano = p.kind === "bano";
  const titulo = esBano ? "En el baño" : "En break";
  const partes: string[] = [];
  const desde = horaCorta(p.desde);
  if (desde) partes.push(`Desde ${desde}`);
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
  const acento = excedida ? "text-destructive" : "text-warning";
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
        "h-36 rounded-xl border flex flex-col items-center justify-center gap-1 px-3 py-1.5 text-center md:gap-1.5 md:py-2",
        excedida ? "border-destructive/40 bg-destructive/10" : "border-border bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 md:gap-3">
        <div className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 md:h-10 md:w-10",
          excedida
            ? "bg-destructive/15 text-destructive ring-destructive/40 animate-pulse motion-reduce:animate-none"
            : "bg-warning/10 text-warning ring-warning/40",
        )}>
          {pausa.kind === "bano" ? <span aria-hidden className="text-base leading-none md:text-lg">🚻</span> : <Coffee className="h-4 w-4 md:h-5 md:w-5" />}
        </div>
        <div className="text-left">
          <div className={cn("whitespace-nowrap text-[11px] font-semibold leading-none", acento)}>{etiqueta}</div>
          <div className={cn("font-display text-xl font-bold tabular-nums leading-tight md:text-2xl", acento)}>{mmss(pausa.segundos)}</div>
        </div>
      </div>
      <div className={cn("text-[10px] leading-snug md:text-[11px]", excedida ? "text-destructive/90" : "text-muted-foreground")}>
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
        <p className="line-clamp-2 max-w-[30ch] text-[10px] italic leading-snug text-muted-foreground/70">{fraseDePausa(pausa.desde)}</p>
      )}
    </div>
  );
}
