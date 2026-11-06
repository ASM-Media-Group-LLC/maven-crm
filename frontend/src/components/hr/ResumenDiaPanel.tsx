import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, Loader2, AlertTriangle, RefreshCw, ChevronRight, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useResumenDia, type PersonaResumen, type BajonDia } from "@/hooks/useResumenDia";
import type { TranslationKey } from "@/lib/i18n";

// RESUMEN DEL DÍA (Argos): quién va mejor o peor HOY, en dos grupos —problema
// arriba, bien abajo—. El PROBLEMA del día es el protagonista; la nota va
// discreta y las barras etiquetadas. Diseño sobrio, poco color (Alvaro, 03/11):
// un único punto de acento para lo que está pasando ahora, todo lo demás en
// tono neutro. Los problemas se muestran AGRUPADOS por tipo (ej. "Sin señal ×3
// · 90 min") en vez de un chip por evento. Clic → su expediente. Todo por t().

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

// El nombre legible de cada bajón.
const LBL_BAJON: Record<string, TranslationKey> = {
  sin_pantalla: "hr.sem.sinPantalla",
  camara_apagada: "hr.resumen.bajon.camara",
  camara_tapada: "hr.resumen.bajon.camara",
  fuera_de_lugar: "hr.sem.problema",
  se_fue: "hr.resumen.bajon.seFue",
  sin_senal: "hr.resumen.bajon.sinSenal",
  pausa_de_mas: "hr.resumen.bajon.pausa",
};

// Un problema AGRUPADO por tipo: cuántas veces pasó hoy y cuánto sumó.
interface Grupo {
  tipo: string;
  veces: number;
  minutos: number;
  abierto: boolean; // sigue pasando ahora mismo
}

function agrupar(bajones: BajonDia[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const b of bajones) {
    // "Sin señal" no es un problema del empleado (es fallo del rastreo); fuera
    // (Alvaro, 05/11: "ya no quiero escuchar esa mierda, no tiene nada que ver").
    if (b.tipo === "sin_senal") continue;
    const g = m.get(b.tipo) ?? { tipo: b.tipo, veces: 0, minutos: 0, abierto: false };
    g.veces += 1;
    g.minutos += b.minutos;
    g.abierto = g.abierto || b.abierto;
    m.set(b.tipo, g);
  }
  // Lo que pasa AHORA primero; luego por minutos acumulados (más grave arriba).
  return [...m.values()].sort((a, b) => Number(b.abierto) - Number(a.abierto) || b.minutos - a.minutos);
}

// Una barra etiquetada, sobria: sin semáforo, solo el dato. El número manda.
function Barra({ label, pct }: { label: string; pct: number | null }) {
  const v = pct ?? 0;
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct == null ? "—" : `${v}%`}`}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-foreground/10">
        <span className="block h-full rounded-full bg-foreground/35" style={{ width: `${v}%` }} />
      </span>
      <span className="w-7 text-[11px] tabular-nums text-muted-foreground/80">{pct == null ? "—" : `${v}%`}</span>
    </div>
  );
}

// Un problema agrupado, bajo de color: un puntito (rojo suave si pasa AHORA,
// gris si ya pasó) + el texto en tono neutro.
function Problema({ g, t }: { g: Grupo; t: Tr }) {
  const lbl = LBL_BAJON[g.tipo] ? t(LBL_BAJON[g.tipo]) : g.tipo;
  const detalle = g.veces > 1
    ? `×${g.veces} · ${t("hr.resumen.min", { n: g.minutos })}`
    : t("hr.resumen.min", { n: g.minutos });
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.abierto ? "bg-destructive animate-pulse" : "bg-muted-foreground/40"}`} />
      <span className="font-medium text-foreground/85">{lbl}</span>
      <span className="tabular-nums text-muted-foreground">
        {detalle}{g.abierto ? ` · ${t("hr.resumen.ahora")}` : ""}
      </span>
    </span>
  );
}

function Fila({ p, t, onClick }: { p: PersonaResumen; t: Tr; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  const valor = p.nota.valor;
  // La nota va DISCRETA: el número en tono suave + un único puntito de banda.
  const dot = p.nota.banda === "bien" ? "bg-success"
    : p.nota.banda === "ojo" ? "bg-warning"
    : p.nota.banda === "mal" ? "bg-destructive"
    : "bg-muted-foreground/40";
  const grupos = agrupar(p.bajones);
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("hr.atencion.verExpediente")}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-card/20 px-3.5 py-3 text-left transition-colors hover:border-primary/30 hover:bg-card/40"
    >
      <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{nombre}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <span className="text-sm font-semibold tabular-nums text-foreground/80">{valor ?? "—"}</span>
          </span>
        </div>
        {/* PROTAGONISTA: el problema del día, agrupado y sobrio */}
        {grupos.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {grupos.slice(0, 3).map((g, i) => <Problema key={i} g={g} t={t} />)}
            {grupos.length > 3 && <span className="text-[11px] text-muted-foreground">+{grupos.length - 3}</span>}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{t("hr.resumen.sinNovedad")}</div>
        )}
        {/* Barras etiquetadas, sobrias */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Barra label={t("hr.resumen.pantalla")} pct={p.pantallaPct} />
          <Barra label={t("hr.resumen.camara")} pct={p.camaraPct} />
          <Barra label={t("hr.resumen.atencion")} pct={p.atencionPct} />
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

// Encabezado de grupo, sobrio: un puntito de color y el texto en tono neutro
// (nada de mayúsculas gritonas de antes).
function TituloGrupo({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </p>
  );
}

export function ResumenDiaPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useResumenDia(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));

  // Dos grupos: problema (nota < 60 o con bajón abierto) y bien (≥60). Sin nota → bien (aún sin datos).
  const { problema, bien } = useMemo(() => {
    const prob: PersonaResumen[] = [];
    const ok: PersonaResumen[] = [];
    for (const p of personas) {
      const malo = (p.nota.valor != null && p.nota.valor < 60) || p.bajones.some((b) => b.abierto);
      (malo ? prob : ok).push(p);
    }
    return { problema: prob, bien: ok };
  }, [personas]);

  const irA = (id: string) => navigate(`/hr/expediente/${id}`, { state: { volverA: "/hr/monitor-ia?t=resumen" } });

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <CalendarCheck className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.resumen.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.resumen.sub")}</p>
          </div>
          <button type="button" onClick={() => void refrescar()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" title={t("hr.pantallazos.reintentar")} aria-label={t("hr.pantallazos.reintentar")}>
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.resumen.error")}</p></div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><CalendarCheck className="h-7 w-7 opacity-40" /><p className="text-sm">{t("hr.resumen.vacio")}</p></div>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <TituloGrupo dot="bg-destructive/70">{t("hr.resumen.grupoProblema", { n: problema.length })}</TituloGrupo>
              {problema.length > 0 ? (
                <div className="flex flex-col gap-2">{problema.map((p) => <Fila key={p.userId} p={p} t={t} onClick={() => irA(p.userId)} />)}</div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-card/20 px-3.5 py-3 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-success/70" />{t("hr.resumen.sinProblema")}</div>
              )}
            </div>
            {bien.length > 0 && (
              <div>
                <TituloGrupo dot="bg-success/70">{t("hr.resumen.grupoBien", { n: bien.length })}</TituloGrupo>
                <div className="flex flex-col gap-2">{bien.map((p) => <Fila key={p.userId} p={p} t={t} onClick={() => irA(p.userId)} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
