import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, RefreshCw, TrendingDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuienBaja, type FilaQuienBaja } from "@/hooks/useQuienBaja";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { minutosDesde } from "@/lib/motivosVivos";
import { LetraAvatar, NotaViva, textoDuracion, tonoDePersona, type Tr, ETIQUETA_ESTADO } from "./piezas";
import { fraseCorta } from "@/components/hr/TarjetaArgos";
import { useDisenoPulido } from "@/hooks/useDisenoPulido";
import type { FilaQuienBaja as Fila } from "@/hooks/useQuienBaja";

// «QUIÉN ESTÁ BAJANDO AHORA» (Alvaro, 11/11/2026).
//
// Lo PRIMERO que ve en el teléfono al abrir Maven (y arriba del Pulso en la
// computadora): la lista corta de quién está bajando la nota del equipo en este
// momento. Cada fila: su pantalla de hace segundos, el motivo en palabras, su
// nota viva y cuánto lleva. Un toque abre su vista en vivo con ese motivo arriba.
//
// La ven el dueño, RR. HH. y los supervisores (su equipo). Para el resto no se
// dibuja nada. Un fallo NO es «nadie está bajando»: se dice y se reintenta.

const VISIBLES = 5;

/**
 * Una persona. Arriba: su pantalla de hace segundos, el nombre, cuánto lleva y
 * su nota viva. Abajo, a TODO el ancho, el motivo en palabras (lo que hay que
 * leer de un vistazo) y lo que vio Argos.
 */
function FilaBajando({ f, t, onAbrir }: { f: FilaQuienBaja; t: Tr; onAbrir: () => void }) {
  const ahora = Date.now();
  const lleva = textoDuracion(minutosDesde(f.desde, ahora), t);
  const minFoto = f.miniatura ? minutosDesde(f.miniatura.at, ahora) : null;
  const fotoHace = minFoto == null ? null
    : minFoto < 1 ? t("vigilancia.quien.fotoAhora")
    : t("vigilancia.quien.fotoHace", { d: textoDuracion(minFoto, t) });
  const detalle = f.motivo?.detalle?.trim() || null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex w-full min-w-0 flex-col gap-2 rounded-panel border border-border/50 bg-foreground/[0.03] p-2.5 text-left transition-colors hover:border-primary/35 hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex w-full min-w-0 items-center gap-3">
        {/* Su pantalla de hace segundos (o su letra, si no hay foto reciente). */}
        <span className="relative h-[60px] w-[96px] shrink-0 overflow-hidden rounded-control bg-black/85 ring-1 ring-white/10">
          {f.miniatura ? (
            <img src={f.miniatura.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <LetraAvatar nombre={f.nombre} tamano="sm" sobreOscuro />
            </span>
          )}
          {fotoHace && (
            <span className="absolute bottom-1 left-1 whitespace-nowrap rounded bg-black/65 px-1 py-px text-[10px] font-medium leading-tight text-white/85 tabular-nums">
              {fotoHace}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold leading-tight">{f.nombre || "—"}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
            <span>{t("vigilancia.quien.lleva", { d: lleva })}</span>
            {f.otros > 0 && <span>· {t("vigilancia.quien.otros", { n: f.otros })}</span>}
            {f.motivo?.revisadoAt && <span className="text-success">· {t("vigilancia.quien.revisado")}</span>}
          </span>
        </span>
        <NotaViva puntos={f.puntos} t={t} compacta />
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 sm:block" />
      </span>
      <span className="flex w-full min-w-0 flex-col gap-0.5 px-0.5">
        <span className="text-sm font-semibold leading-snug text-destructive">{t(ETIQUETA_ESTADO[f.estado])}</span>
        {detalle && <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{detalle}</span>}
      </span>
    </button>
  );
}

/** Qué tan grave es cada estado: rojo lo que es no estar trabajando, ámbar lo
 *  que es un descuido (pausa larga, cámara, pantalla). Solo se ve un puntito. */
const PUNTO_ESTADO: Partial<Record<Fila["estado"], string>> = {
  pausa_de_mas: "bg-warning", camara_apagada: "bg-warning", sin_pantalla: "bg-warning", pausa: "bg-warning",
  presente: "bg-muted-foreground", trabajando: "bg-success",
};

/**
 * DISEÑO PULIDO (Alvaro, 12/11/2026: «se ve horrible», solo dueño con su link).
 * El mismo lenguaje del Expediente pulido: tarjeta neutra de filo fino, su
 * pantalla con un sombreo suave y la hora en placa de vidrio, el nombre en
 * blanco, el motivo con UN puntito (sin texto rojo), cuánto lleva y lo que vio
 * Argos en corto, y la nota como cifra blanca. Sin rellenos ni brillos rojos.
 * Tres niveles (Alvaro, 12/11: «todo parece importante»): el nombre fuerte, el
 * motivo en gris normal y el tiempo más tenue.
 */
function FilaBajandoPulida({ f, t, onAbrir }: { f: FilaQuienBaja; t: Tr; onAbrir: () => void }) {
  const ahora = Date.now();
  const lleva = textoDuracion(minutosDesde(f.desde, ahora), t);
  const minFoto = f.miniatura ? minutosDesde(f.miniatura.at, ahora) : null;
  const fotoHace = minFoto == null ? null
    : minFoto < 1 ? t("vigilancia.quien.fotoAhora")
    : t("vigilancia.quien.fotoHace", { d: textoDuracion(minFoto, t) });
  const detalle = f.motivo?.detalle?.trim() || null;
  const frase = fraseCorta(detalle);
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={detalle ?? undefined}
      className="group flex w-full min-w-0 items-center gap-3.5 rounded-[12px] border border-border/60 bg-card/30 p-2.5 text-left transition-colors hover:border-foreground/25 hover:bg-card/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        style={f.miniatura ? undefined : ({ "--av-h": tonoDePersona(f.nombre) } as CSSProperties)}
        className={cn("relative h-[68px] w-[108px] shrink-0 overflow-hidden rounded-[8px] border border-border/60 bg-foreground/[0.04]", !f.miniatura && "avatar-fondo")}>
        {f.miniatura ? (
          <>
            <img src={f.miniatura.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 bg-black/40 transition-opacity group-hover:opacity-40" aria-hidden />
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <LetraAvatar nombre={f.nombre} tamano="md" />
          </span>
        )}
        {fotoHace && (
          <span className="absolute bottom-1 left-1 whitespace-nowrap rounded-full bg-black/50 px-1.5 py-px text-[10px] font-medium leading-tight tabular-nums text-white/95 ring-1 ring-white/10 backdrop-blur-md">
            {fotoHace}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{f.nombre || "—"}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PUNTO_ESTADO[f.estado] ?? "bg-destructive")} aria-hidden />
          <span className="truncate">{t(ETIQUETA_ESTADO[f.estado])}</span>
        </span>
        <span className="truncate text-xs leading-tight text-muted-foreground/70 tabular-nums">
          {t("vigilancia.quien.lleva", { d: lleva })}
          {f.otros > 0 && ` · ${t("vigilancia.quien.otros", { n: f.otros })}`}
          {f.motivo?.revisadoAt && ` · ${t("vigilancia.quien.revisado")}`}
          {frase && ` · ${frase}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end pr-0.5" aria-label={t("vigilancia.nota.aria", { n: f.puntos })}>
        <span className="font-display text-xl font-semibold leading-none tabular-nums text-foreground">{f.puntos}</span>
        <span className="mt-1 text-[11px] leading-none text-muted-foreground">{t("vigilancia.nota.corta")}</span>
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 sm:block" />
    </button>
  );
}

/** La vista, solo con props (el banco visual la dibuja con datos de ejemplo). */
export function QuienEstaBajandoVista({ filas, cargando, error, onReintentar, onAbrir, className, pulido = false }: {
  /** Diseño pulido (solo el dueño que lo prendió con su link). */
  pulido?: boolean;
  filas: FilaQuienBaja[];
  cargando: boolean;
  error: Error | null;
  onReintentar: () => void;
  onAbrir: (f: FilaQuienBaja) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const [verTodos, setVerTodos] = useState(false);
  const hay = filas.length > 0;
  const mostradas = verTodos ? filas : filas.slice(0, VISIBLES);

  return (
    <section
      aria-labelledby="quien-baja-titulo"
      className={cn("vidrio sube p-3.5 sm:p-4", hay && !error && !pulido && "vidrio-glow glow-r", pulido && "lg:p-5", className)}
    >
      <div className="v-cont flex flex-col gap-3">
        <header className="flex items-center gap-2.5">
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-panel",
            pulido ? "rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/80"
              : hay ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
          )}>
            {hay ? <TrendingDown className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="quien-baja-titulo" className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
              <span className="truncate">{t("vigilancia.quien.titulo")}</span>
              {hay && (
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  pulido ? "border border-border/70 bg-foreground/[0.04] text-foreground" : "bg-destructive/15 text-destructive")}>
                  {filas.length}
                </span>
              )}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              {hay ? t("vigilancia.quien.sub") : t("vigilancia.quien.enVivo")}
            </p>
          </div>
        </header>

        {cargando && !hay ? (
          <div className="flex flex-col gap-2" aria-busy>
            <Skeleton className="h-[84px] w-full rounded-panel" />
            <Skeleton className="h-[84px] w-full rounded-panel" />
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-panel border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">{t("vigilancia.quien.fallo")}</span>
            <button type="button" onClick={onReintentar}
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-background/40 px-3 text-xs font-semibold hover:bg-background/70">
              <RefreshCw className="h-3.5 w-3.5" />{t("vigilancia.comun.reintentar")}
            </button>
          </div>
        ) : !hay ? (
          <p className="text-sm text-muted-foreground">{t("vigilancia.quien.nadie")}</p>
        ) : (
          <>
            <div className={cn("grid lg:grid-cols-2 2xl:grid-cols-3", pulido ? "gap-2.5" : "gap-2")}>
              {mostradas.map((f) => pulido
                ? <FilaBajandoPulida key={f.userId} f={f} t={t} onAbrir={() => onAbrir(f)} />
                : <FilaBajando key={f.userId} f={f} t={t} onAbrir={() => onAbrir(f)} />)}
            </div>
            {filas.length > VISIBLES && (
              <button type="button" onClick={() => setVerTodos((v) => !v)}
                className={pulido
                  ? "h-10 rounded-[10px] border border-border/60 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  : "h-10 rounded-control text-sm font-semibold text-primary hover:bg-primary/[0.06]"}>
                {verTodos ? t("vigilancia.quien.verMenos") : t("vigilancia.quien.verTodos", { n: filas.length })}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * `lugar="arriba"`: lo primero de la página, SOLO en el teléfono.
 * `lugar="pulso"`: arriba del Pulso, SOLO en la computadora.
 * Así nunca sale dos veces y en el teléfono es lo primero que se ve.
 */
export default function QuienEstaBajando({ lugar, className }: { lugar: "arriba" | "pulso"; className?: string }) {
  const isMobile = useIsMobile();
  const enSuLugar = lugar === "arriba" ? isMobile : !isMobile;
  // Fuera de su lugar no se monta nada (ni consultas): el otro lugar lo dibuja.
  if (!enSuLugar) return null;
  return <QuienEstaBajandoConDatos className={className} />;
}

function QuienEstaBajandoConDatos({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { puede, filas, cargando, error, reintentar } = useQuienBaja();
  const pulido = useDisenoPulido();
  if (!puede) return null;
  return (
    <QuienEstaBajandoVista
      pulido={pulido}
      className={className}
      filas={filas}
      cargando={cargando}
      error={error}
      onReintentar={reintentar}
      onAbrir={(f) => navigate(f.enlace)}
    />
  );
}
