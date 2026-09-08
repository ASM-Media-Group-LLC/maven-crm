// La miniatura de una sala cuando TODOS los que están en ella marcaron pausa.
//
// Mock aprobado por Jhon (08/09): en pausa la miniatura se APAGA. Nada de video
// ni punto verde: un panel gris que dice en grande qué pausa es y cuánto lleva,
// con la barra del tope. Rojo y latiendo si se pasó. Antes la persona en pausa
// seguía mostrando su video (o la silla vacía) con un chip chiquito encima, y
// el jefe veía a dos personas "en almuerzo" en verde.
import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

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
  epoch ? new Date(epoch).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : null;

/** Textos y proporción de la barra. Puro, para probarlo. */
export function describirPausa(p: PausaDeSala): { titulo: string; detalle: string; pct: number; tono: "ok" | "poco" | "excedida" } {
  const esBano = p.kind === "bano";
  const titulo = esBano ? "En el baño" : "En break";
  const partes: string[] = [];
  const desde = horaCorta(p.desde);
  if (desde) partes.push(`desde ${desde}`);
  let pct = 0;
  let tono: "ok" | "poco" | "excedida" = "ok";
  if (p.limiteMin != null) {
    const topeSeg = p.limiteMin * 60;
    const usado = (esBano ? p.consumidoSeg : 0) + p.segundos;
    pct = Math.min(100, Math.round((usado / topeSeg) * 100));
    const deMas = usado - topeSeg;
    if (deMas >= 0) {
      tono = "excedida";
      partes.push(esBano ? `pasó los ${p.limiteMin} min de baño de hoy` : `límite ${p.limiteMin} min · ${Math.ceil(deMas / 60)} min de más`);
    } else {
      tono = pct >= 75 ? "poco" : "ok";
      partes.push(esBano
        ? `hoy lleva ${Math.round(usado / 60)} de ${p.limiteMin} min de baño`
        : `límite ${p.limiteMin} min · le quedan ${Math.ceil((topeSeg - usado) / 60)}`);
    }
  } else {
    partes.push("sin tope configurado");
  }
  return { titulo: tono === "excedida" ? `${titulo} · pasado` : titulo, detalle: partes.join(" · "), pct, tono };
}

export default function SalaEnPausa({ pausa, className }: { pausa: PausaDeSala; className?: string }) {
  const d = describirPausa(pausa);
  const excedida = d.tono === "excedida";
  return (
    <div
      data-testid="sala-en-pausa"
      data-tono={d.tono}
      className={cn(
        "h-36 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 px-3 text-center",
        excedida ? "border-destructive/50 bg-destructive/10" : "border-border bg-muted/40",
        className,
      )}
    >
      <div className={cn(
        "grid h-9 w-9 place-items-center rounded-full",
        excedida ? "bg-destructive/20 text-destructive animate-pulse motion-reduce:animate-none" : "bg-muted text-muted-foreground",
      )}>
        {pausa.kind === "bano" ? <span aria-hidden className="text-base leading-none">🚻</span> : <Coffee className="h-4 w-4" />}
      </div>
      <div className={cn("font-display text-base font-bold leading-tight", excedida ? "text-destructive" : "text-foreground")}>{d.titulo}</div>
      <div className={cn("font-display text-xl font-semibold tabular-nums leading-none", excedida ? "text-destructive" : "text-foreground")}>{mmss(pausa.segundos)}</div>
      <div className={cn("text-[11px] leading-snug", excedida ? "text-destructive/90" : "text-muted-foreground")}>{d.detalle}</div>
      {pausa.limiteMin != null && (
        <div className="mt-1 h-1 w-3/5 overflow-hidden rounded-full bg-muted-foreground/20">
          <div
            className={cn("h-full rounded-full", d.tono === "excedida" ? "bg-destructive" : d.tono === "poco" ? "bg-warning" : "bg-success")}
            style={{ width: `${d.pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
