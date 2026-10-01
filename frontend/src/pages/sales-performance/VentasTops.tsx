import { Crown, HeadphonesIcon, Megaphone, Minus, TrendingUp, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";
import { useVentasTops } from "./useVentasTops";

/**
 * Los tres rankings del equipo de ventas, cada rol medido por SU objetivo —
 * la misma regla que rige la nota de los cortes (`corte_objetivos`):
 *
 *  · **Chatters**: lo que vendieron en BLU.
 *  · **Closers**: las plataformas que vendieron (valor MENSUAL recurrente).
 *  · **Managers**: que su roster promocione (promolog).
 *
 * Donde existe, se muestra además la **nota del corte** que el bot publica en
 * los grupos de WhatsApp, que es la otra vara con la que ya se los mide.
 */

const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

/** Medalla del puesto. El 1º se lleva la corona; del 4º en adelante, solo número. */
const MEDALLA = ["bg-amber-400/90 text-amber-950", "bg-zinc-300/80 text-zinc-800", "bg-orange-700/80 text-orange-50"];

interface Fila {
  nombre: string;
  /** Número grande de la derecha. */
  valor: string;
  /** Línea chica bajo el nombre. */
  detalle: string;
  /** 0-1, para la barra de proporción contra el líder. */
  proporcion: number;
  nota?: number | null;
}

// Barra de proporción: hace el ranking legible de un vistazo, sin leer números.
function Podio({ filas, tono, vacio }: { filas: Fila[]; tono: string; vacio: string }) {
  const { t } = useLanguage();
  if (filas.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <Minus className="h-4 w-4 text-muted-foreground/60" />
        </span>
        <p className="text-xs text-muted-foreground">{vacio}</p>
      </div>
    );
  }
  return (
    <ol className="flex-1 divide-y divide-white/5">
      {filas.map((f, i) => (
        <li key={f.nombre} className={`relative px-4 py-2.5 ${i === 0 ? "bg-white/[0.03]" : ""}`}>
          <div className="flex items-center gap-3">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                MEDALLA[i] ?? "bg-white/5 text-muted-foreground"
              }`}
            >
              {i === 0 ? <Crown className="h-3 w-3" /> : i + 1}
            </span>
            <UserAvatar name={f.nombre} size="xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{f.nombre}</p>
              <p className="truncate text-[11px] text-muted-foreground">{f.detalle}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums leading-tight">{f.valor}</p>
              {f.nota != null && (
                <p className="text-[10px] text-muted-foreground">{t("sales.tops.score", { n: f.nota.toFixed(1) })}</p>
              )}
            </div>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${tono} transition-[width] duration-700`}
              style={{ width: `${Math.max(4, Math.round(f.proporcion * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Tarjeta({
  titulo, ayuda, icono: Icono, acento, tono, filas, cargando, vacio, pie,
}: {
  titulo: string;
  ayuda: string;
  icono: typeof Crown;
  /** Degradé del encabezado, del color del rol. */
  acento: string;
  /** Color plano de la barra. */
  tono: string;
  filas: Fila[];
  cargando: boolean;
  vacio: string;
  /** Texto del pie. Cierra la tarjeta y explica de qué es la suma. */
  pie?: string;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5 backdrop-blur-sm">
      <header className={`flex items-center gap-2 bg-gradient-to-r ${acento} px-4 py-3`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
          <Icono className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold tracking-tight">{titulo}</h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-muted-foreground"><Info className="h-3.5 w-3.5" /></span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px] text-xs">{ayuda}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>
      {cargando ? (
        <div className="flex-1 space-y-2 p-4">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : (
        <Podio filas={filas} tono={tono} vacio={vacio} />
      )}
      {/* Pie pegado abajo: cierra la tarjeta y de paso dice de qué es la suma.
          Sin esto, la tarjeta corta quedaba flotando y dejaba un hueco negro
          al lado de la más larga. */}
      {pie && (
        <footer className="mt-auto border-t border-white/5 px-4 py-2 text-[11px] text-muted-foreground">
          {pie}
        </footer>
      )}
    </section>
  );
}

export default function VentasTops({ desde, hasta }: { desde: string | undefined; hasta: string | undefined }) {
  const { t } = useLanguage();
  const { tops, cargando, error } = useVentasTops(desde, hasta);

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm">
        <p className="font-medium text-destructive">{t("sales.tops.loadError")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const maxChatter = Math.max(...tops.chatters.map((c) => c.ventas), 1);
  const maxCloser = Math.max(...tops.closers.map((c) => c.usd_mensual), 1);

  return (
    // Las tres del MISMO alto: cada una llena su caja con el pie abajo y el
    // vacío centrado. Con `items-start` (como estaba) la tarjeta corta dejaba
    // un hueco negro al lado de la larga.
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Tarjeta
        titulo={t("sales.tops.chatters")}
        ayuda={t("sales.tops.chattersHelp")}
        icono={HeadphonesIcon}
        acento="from-sky-500/20 via-sky-500/5 to-transparent"
        tono="bg-sky-500"
        cargando={cargando}
        vacio={t("sales.tops.chattersEmpty")}
        pie={tops.chatters.length > 0 ? t("sales.tops.sum", { n: tops.chatters.length, total: money(tops.chatters.reduce((s, c) => s + c.ventas, 0)) }) : undefined}
        filas={tops.chatters.map((c) => ({
          nombre: c.nombre,
          valor: money(c.ventas),
          // El reparto por agencia va A LA VISTA: el ranking anterior salía de
          // una tabla que dejó de traer Plus y no había forma de notarlo.
          detalle: [
            t(c.dias === 1 ? "sales.tops.day1" : "sales.tops.dayN", { n: c.dias }),
            c.plus > 0 ? `Plus ${money(c.plus)}` : null,
            c.massive > 0 ? `Massive ${money(c.massive)}` : null,
          ].filter(Boolean).join(" · "),
          proporcion: c.ventas / maxChatter,
        }))}
      />

      <Tarjeta
        titulo={t("sales.tops.closers")}
        ayuda={t("sales.tops.closersHelp")}
        icono={TrendingUp}
        acento="from-violet-500/20 via-violet-500/5 to-transparent"
        tono="bg-violet-500"
        cargando={cargando}
        vacio={t("sales.tops.closersEmpty")}
        pie={tops.closers.length > 0 ? t("sales.tops.sumMonthly", { n: tops.closers.length, total: money(tops.closers.reduce((s, c) => s + c.usd_mensual, 0)) }) : undefined}
        filas={tops.closers.map((c) => ({
          nombre: c.nombre,
          valor: t("sales.tops.perMonth", { amount: money(c.usd_mensual) }),
          detalle: t(c.ganadas === 1 ? "sales.tops.sold1" : "sales.tops.soldN", { n: c.ganadas }),
          proporcion: c.usd_mensual / maxCloser,
          nota: c.nota_corte,
        }))}
      />

      <Tarjeta
        titulo={t("sales.tops.managers")}
        ayuda={t("sales.tops.managersHelp")}
        icono={Megaphone}
        acento="from-amber-500/20 via-amber-500/5 to-transparent"
        tono="bg-amber-500"
        cargando={cargando}
        vacio={t("sales.tops.managersEmpty")}
        pie={tops.managers.length > 0 ? t("sales.tops.managersSum", { a: tops.managers.reduce((s, m) => s + m.promocionaron, 0), b: tops.managers.reduce((s, m) => s + m.creadoras, 0) }) : undefined}
        filas={tops.managers.map((m) => ({
          nombre: m.nombre,
          valor: `${m.pct_dias.toFixed(0)}%`,
          detalle: t("sales.tops.managerDetail", { promoted: m.promocionaron, creators: m.creadoras, days: m.dias_con_promo, measured: m.dias_medidos }),
          proporcion: m.pct_dias / 100,
          nota: m.nota_corte,
        }))}
      />
    </div>
  );
}
