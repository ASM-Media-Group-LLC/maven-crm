import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { EstadoVivo } from "@/lib/motivosVivos";

// Piezas compartidas del monitoreo en vivo: la letra de la persona, la nota viva
// como tile con su barra (nunca anillo), cómo se dice una duración y cómo se
// dice cada estado en palabras simples.

export type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

/** Cada estado, en palabras de la calle («Está en el celular», no «celular»). */
export const ETIQUETA_ESTADO: Record<EstadoVivo, TranslationKey> = {
  trabajando: "vigilancia.estado.trabajando",
  presente: "vigilancia.estado.presente",
  pausa: "vigilancia.estado.pausa",
  pausa_de_mas: "vigilancia.estado.pausa_de_mas",
  celular: "vigilancia.estado.celular",
  distraido: "vigilancia.estado.distraido",
  no_mira: "vigilancia.estado.no_mira",
  camara_apagada: "vigilancia.estado.camara_apagada",
  se_fue: "vigilancia.estado.se_fue",
  fuera_cowork: "vigilancia.estado.fuera_cowork",
  fuera_de_lugar: "vigilancia.estado.fuera_de_lugar",
  sin_pantalla: "vigilancia.estado.sin_pantalla",
  ausente: "vigilancia.estado.ausente",
};

/** «recién», «12 min», «1 h 05 min». */
export function textoDuracion(minutos: number, t: Tr): string {
  if (minutos < 1) return t("vigilancia.tiempo.recien");
  if (minutos < 60) return t("vigilancia.tiempo.min", { n: minutos });
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return t("vigilancia.tiempo.horas", { h, m: String(m).padStart(2, "0") });
}

/** La hora corta en el idioma de quien mira («3:42 p. m.» / «3:42 PM»). */
export function horaCorta(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(lang === "es" ? "es-CO" : "en-US", { hour: "numeric", minute: "2-digit" });
}

/** Banda de color de una nota 0–100. */
export function tonoDeNota(puntos: number): { texto: string; barra: string } {
  if (puntos >= 80) return { texto: "text-success", barra: "bg-success" };
  if (puntos >= 50) return { texto: "text-warning", barra: "bg-warning" };
  return { texto: "text-destructive", barra: "bg-destructive" };
}

/** Tono propio de cada persona (sale del nombre, siempre el mismo). Solo se ve
 *  en Blanco puro (clases .avatar-letra / .avatar-fondo de index.css). Tonos
 *  escogidos a mano para que ninguno salga barroso. */
const TONOS_PERSONA = [212, 160, 28, 268, 340, 190, 135, 248, 8, 300, 45, 176];
export function tonoDePersona(nombre: string): number {
  let h = 0;
  for (const c of nombre.trim().toLowerCase()) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return TONOS_PERSONA[h % TONOS_PERSONA.length];
}

/** Avatar de UNA letra (regla de diseño v5), redondo, sobre vidrio neutro. */
export function LetraAvatar({ nombre, tamano = "sm", sobreOscuro = false, className }: {
  nombre: string;
  tamano?: "sm" | "md" | "lg";
  /** Sobre el fondo negro de un video o una foto (la misma letra en los dos temas). */
  sobreOscuro?: boolean;
  className?: string;
}) {
  const letra = (nombre.trim().match(/\p{L}/u)?.[0] ?? "·").toUpperCase();
  const medidas = tamano === "lg" ? "h-12 w-12 text-lg" : tamano === "md" ? "h-10 w-10 text-base" : "h-8 w-8 text-sm";
  return (
    <span
      aria-hidden
      style={{ "--av-h": tonoDePersona(nombre) } as CSSProperties}
      className={cn(
        "avatar-letra inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1",
        sobreOscuro ? "bg-white/[0.08] text-white/90 ring-white/15" : "bg-foreground/[0.06] text-foreground/90 ring-border",
        medidas,
        className,
      )}
    >
      {letra}
    </span>
  );
}

/** La nota viva como TILE: número grande + barra fina. Nunca anillo. */
export function NotaViva({ puntos, t, compacta = false }: { puntos: number; t: Tr; lang?: string; compacta?: boolean }) {
  const tono = tonoDeNota(puntos);
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-control border border-border/50 bg-foreground/[0.04]",
        compacta ? "w-[52px] gap-1 px-1.5 py-1.5" : "w-[68px] gap-1.5 px-2 py-2",
      )}
      aria-label={t("vigilancia.nota.aria", { n: puntos })}
    >
      <span className={cn("font-display font-semibold leading-none tabular-nums", compacta ? "text-xl" : "text-2xl", tono.texto)}>
        {puntos}
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        <span className={cn("block h-full rounded-full", tono.barra)} style={{ width: `${Math.max(4, Math.min(100, puntos))}%` }} />
      </span>
      <span className="text-[10px] leading-none text-muted-foreground">{t("vigilancia.nota.corta")}</span>
    </span>
  );
}
