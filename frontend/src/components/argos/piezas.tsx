import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { EstadoMinuto } from "@/lib/argosJornada";

// Piezas del turno minuto a minuto, con la paleta de siempre de Argos (Alvaro,
// 11/11/2026: «no quiero cambiar gran parte del diseño que tenemos; es cómo
// hacemos lo que tenemos un poquito mejor»): primario para lo trabajado, ámbar
// (warning) para cámara y pantalla, rojo apagado para lo que es salirse, gris
// rayado para lo que no había empezado o ya se fue. Tonos apagados, no neón.

export type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const rayado = (color: string) => `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 6px)`;

/** El relleno de cada estado en la barra, la leyenda y la semana. */
export const RELLENO: Record<EstadoMinuto, CSSProperties> = {
  bien: { background: "hsl(var(--primary) / 0.85)" },
  pausa: { background: "hsl(var(--primary) / 0.3)" },
  sin_pantalla: { background: "hsl(var(--warning) / 0.85)" },
  sin_camara: { background: "hsl(var(--warning) / 0.55)" },
  fuera_de_camara: { background: "hsl(var(--warning) / 0.35)" },
  distraido: { background: "hsl(var(--destructive) / 0.55)" },
  pausa_de_mas: { background: "hsl(var(--destructive) / 0.35)" },
  fuera_cowork: { background: "hsl(var(--destructive) / 0.75)" },
  no_entro: { backgroundImage: rayado("hsl(var(--muted-foreground) / 0.45)"), backgroundColor: "hsl(var(--muted-foreground) / 0.08)" },
  se_fue: { backgroundImage: rayado("hsl(var(--muted-foreground) / 0.45)"), backgroundColor: "hsl(var(--muted-foreground) / 0.08)" },
  pendiente: { background: "hsl(var(--foreground) / 0.06)" },
};

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

/** Un cuadrito de cifra del expediente: número, etiqueta y un detalle opcional,
 *  con contraste para que se lea (antes la etiqueta casi no se veía). */
export function Cuadrito({ valor, etiqueta, detalle, tono, title, className }: {
  valor: string;
  etiqueta: string;
  detalle?: string;
  /** Clases del número (p. ej. el color de la banda de la nota). */
  tono?: string;
  title?: string;
  /** El fondo de la banda (la nota conserva su tinte de siempre). */
  className?: string;
}) {
  return (
    <div title={title} className={cn("flex h-full min-h-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-panel border border-border/60 bg-card/60 px-2 py-2.5 text-center", className)}>
      <div className={cn("font-display text-xl font-bold leading-tight tabular-nums", tono)}>{valor}</div>
      <div className="text-[11px] font-medium leading-tight text-foreground/75">{etiqueta}</div>
      {detalle && <div className="text-[10px] leading-tight text-muted-foreground">{detalle}</div>}
    </div>
  );
}
