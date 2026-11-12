import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { EstadoMinuto } from "@/lib/argosJornada";

// Piezas de Argos con las REGLAS DE DISEÑO de Alvaro (11/11/2026: «la plataforma
// se ve poco seria; es este mismo diseño pero más serio»): tarjetas PLANAS (fondo
// sólido, borde de 1 px, radio de 8 px; sin brillo, degradé ni sombra), todas las
// cifras en tinta neutra y SOLO lo malo en rojo (van mal, fallas, nota bajo 60,
// minutos de falla), una inicial gris para cada persona y más aire.

export type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

/** La tarjeta plana de Argos (reemplaza al vidrio en lo que se tocó). */
export const TARJETA = "rounded-control border border-border bg-card";
/** Un cuadrito o una fila dentro de una tarjeta. */
export const CUADRO = "rounded-control border border-border bg-background";

const rojo = (a: number) => `hsl(var(--destructive) / ${a})`;
const tinta = (a: number) => `hsl(var(--foreground) / ${a})`;
const rayado = (color: string) => `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 6px)`;

/** El relleno de cada estado en la barra y la leyenda: lo bueno en tinta, lo malo en rojo. */
export const RELLENO: Record<EstadoMinuto, CSSProperties> = {
  bien: { background: tinta(0.62) },
  pausa: { background: tinta(0.22) },
  sin_pantalla: { background: rojo(0.85) },
  sin_camara: { background: rojo(0.6) },
  fuera_de_camara: { background: rojo(0.42) },
  distraido: { background: rojo(0.7) },
  pausa_de_mas: { background: rojo(0.32) },
  fuera_cowork: { backgroundImage: rayado(rojo(0.85)), backgroundColor: rojo(0.18) },
  no_entro: { backgroundImage: rayado(rojo(0.45)), backgroundColor: rojo(0.06) },
  se_fue: { backgroundImage: rayado(rojo(0.45)), backgroundColor: rojo(0.06) },
  pendiente: { background: tinta(0.06) },
};

/** Rojo solo si es malo (nota o % bajo 60). */
export const tonoNota = (n: number | null | undefined) => (n != null && n < 60 ? "text-destructive" : undefined);

/** Cómo se dice cada estado. */
export const NOMBRE_ESTADO: Record<EstadoMinuto, TranslationKey> = {
  bien: "argos.estado.bien",
  pausa: "argos.estado.pausa",
  sin_pantalla: "argos.estado.sin_pantalla",
  sin_camara: "argos.estado.sin_camara",
  fuera_de_camara: "argos.estado.fuera_de_camara",
  distraido: "argos.estado.distraido",
  pausa_de_mas: "argos.estado.pausa_de_mas",
  fuera_cowork: "argos.estado.fuera_cowork",
  no_entro: "argos.estado.no_entro",
  se_fue: "argos.estado.se_fue",
  pendiente: "argos.estado.pendiente",
};

/** La hora de Bogotá de un instante: «9:41 a. m.». */
export function hora(ms: number | string | null | undefined, lang: string): string {
  if (ms === null || ms === undefined) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(lang === "es" ? "es-CO" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
}

/** Solo la hora en punto: «9 a. m.». */
export function horaRedonda(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(lang === "es" ? "es-CO" : "en-US", { hour: "numeric", timeZone: "America/Bogota" });
}

/** «45 min» o «2 h 05 min». */
export function textoMin(min: number, t: Tr): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return t("argos.min", { n: m });
  return t("argos.hMin", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

/** El puntito de la leyenda (como en el desglose de la nota). */
export function Punto({ estado, className }: { estado: EstadoMinuto; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={RELLENO[estado]} />;
}

/** Un cuadrito de cifra: número grande en tinta neutra, etiqueta legible y un
 *  detalle opcional. Si es malo, el número en rojo y a lo sumo un borde rojo fino. */
export function Cuadrito({ valor, etiqueta, detalle, tono, title, className, malo = false }: {
  valor: string;
  etiqueta: string;
  detalle?: string;
  /** Clases del número (solo «text-destructive» cuando es malo). */
  tono?: string;
  title?: string;
  className?: string;
  malo?: boolean;
}) {
  return (
    <div title={title} className={cn("flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-1 px-3 py-3 text-center", CUADRO, malo && "border-destructive/60", className)}>
      <div className={cn("font-display text-2xl font-semibold leading-tight tabular-nums", malo ? "text-destructive" : tono)}>{valor}</div>
      <div className="text-xs font-medium leading-tight text-foreground/80">{etiqueta}</div>
      {detalle && <div className="text-[11px] leading-tight text-muted-foreground">{detalle}</div>}
    </div>
  );
}
