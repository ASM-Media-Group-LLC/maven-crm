import { useMemo, useState } from "react";
import { Gauge, Loader2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useNotasEquipo, type NotaDePersona, type PeriodoNota } from "@/hooks/useNotasEquipo";
import type { BandaNota, FactorNota } from "@/lib/notaEmpleado";
import type { TranslationKey } from "@/lib/i18n";

// La vista "Notas del equipo" del Monitor IA (Argos): una tarjeta por el equipo
// con la nota 0–100 de cada persona (color verde/ámbar/rojo), peor primero, y al
// tocar a alguien se abre su ficha con el desglose de los cuatro factores. Todo
// el texto va por t(); los datos salen de useNotasEquipo (horas+faltas+pausas,
// puntualidad cuando hay horario).

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;

const COLOR: Record<BandaNota, { tx: string; bar: string; chip: string; glow: string; ring: string }> = {
  bien: { tx: "text-success", bar: "bg-success", chip: "bg-success/10 text-success", glow: "glow-g", ring: "ring-success/30" },
  ojo: { tx: "text-warning", bar: "bg-warning", chip: "bg-warning/10 text-warning", glow: "glow-a", ring: "ring-warning/30" },
  mal: { tx: "text-destructive", bar: "bg-destructive", chip: "bg-destructive/10 text-destructive", glow: "glow-b", ring: "ring-destructive/30" },
};
const bandaKey: Record<BandaNota, TranslationKey> = {
  bien: "hr.notas.banda.bien",
  ojo: "hr.notas.banda.ojo",
  mal: "hr.notas.banda.mal",
};
const factorKey: Record<FactorNota["clave"], TranslationKey> = {
  horas: "hr.notas.factor.horas",
  faltas: "hr.notas.factor.faltas",
  puntualidad: "hr.notas.factor.puntualidad",
  pausas: "hr.notas.factor.pausas",
};

/** Texto corto bajo cada factor, armado con t() a partir de los datos crudos. */
function detalleFactor(f: FactorNota, p: NotaDePersona, t: Tr): string {
  switch (f.clave) {
    case "horas":
      return t("hr.notas.detHoras", { h: p.horas.toFixed(1), meta: p.metaHoras });
    case "faltas":
      return p.faltas === 0 ? t("hr.notas.detFaltasCero") : p.faltas === 1 ? t("hr.notas.detFalta1") : t("hr.notas.detFaltas", { n: p.faltas });
    case "puntualidad":
      return t("hr.notas.detSinHorario"); // v1: sin horario para casi todos
    case "pausas":
      if (f.sub === null || p.minutosPausaDeMas === null) return t("hr.notas.detSinDato");
      return p.minutosPausaDeMas <= 0 ? t("hr.notas.detPausaOk") : t("hr.notas.detPausaMal", { n: Math.round(p.minutosPausaDeMas) });
  }
}

function colorDe(banda: BandaNota | null) {
  return banda ? COLOR[banda] : { tx: "text-muted-foreground", bar: "bg-muted-foreground/40", chip: "bg-muted/40 text-muted-foreground", glow: "glow-v", ring: "ring-border/40" };
}

// ── Ficha de una persona (la nota desglosada) ──
function FichaPersona({ p, t, onClose }: { p: NotaDePersona | null; t: Tr; onClose: () => void }) {
  if (!p) return null;
  const c = colorDe(p.nota.banda);
  const nombre = p.nombre || t("hr.noName");
  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col gap-5">
          {/* Identidad */}
          <div className="flex items-center gap-3">
            <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold leading-tight tracking-tight">{nombre}</p>
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-[11px] font-semibold ${c.chip}`}>
                {p.nota.banda ? t(bandaKey[p.nota.banda]) : t("hr.notas.banda.sinNota")}
              </span>
            </div>
            <div className="text-right">
              <div className={`font-display text-5xl font-bold leading-none tracking-tight tabular-nums ${c.tx}`}>
                {p.nota.valor ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">{t("hr.notas.deCien")}</div>
            </div>
          </div>

          {/* Cómo se arma la nota */}
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("hr.notas.comoSeArma")}</p>
            <div className="flex flex-col gap-3">
              {p.nota.factores.map((f) => {
                const sub = f.sub;
                const fc = sub === null ? colorDe(null) : colorDe(sub >= 80 ? "bien" : sub >= 60 ? "ojo" : "mal");
                return (
                  <div key={f.clave}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium">
                        {t(factorKey[f.clave])}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{detalleFactor(f, p, t)}</span>
                      </span>
                      <span className={`text-[13px] font-bold tabular-nums ${fc.tx}`}>{sub === null ? "—" : Math.round(sub)}</span>
                    </div>
                    <span className="block h-2 overflow-hidden rounded-full bg-primary/10">
                      <span className={`block h-full rounded-full ${fc.bar}`} style={{ width: `${sub ?? 0}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-base font-bold tabular-nums">{p.horas.toFixed(1)}h</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.ficha.horas")}</div>
            </div>
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-base font-bold tabular-nums">{p.faltas}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.ficha.faltas")}</div>
            </div>
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-base font-bold tabular-nums">{p.minutosPausaDeMas === null ? "—" : `${Math.round(p.minutosPausaDeMas)}m`}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.ficha.pausas")}</div>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("hr.notas.pie")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NotasEquipoPanel() {
  const { t } = useLanguage();
  const [periodo, setPeriodo] = useState<PeriodoNota>("hoy");
  const [ficha, setFicha] = useState<NotaDePersona | null>(null);
  const { notas, cargando, error } = useNotasEquipo(periodo);

  const resumen = useMemo(() => {
    const conNota = notas.filter((n) => n.nota.valor !== null);
    const prom = conNota.length ? Math.round(conNota.reduce((a, n) => a + (n.nota.valor ?? 0), 0) / conNota.length) : null;
    const verde = notas.filter((n) => n.nota.banda === "bien").length;
    const rojo = notas.filter((n) => n.nota.banda === "mal").length;
    return { prom, verde, rojo, total: notas.length };
  }, [notas]);

  const periodos: Array<{ k: PeriodoNota; tk: TranslationKey }> = [
    { k: "hoy", tk: "hr.notas.hoy" },
    { k: "semana", tk: "hr.notas.semana" },
  ];

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        {/* Cabecera */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Gauge className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.notas.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.notas.sub")}</p>
          </div>
          <div className="inline-flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {periodos.map((pp) => (
              <button
                key={pp.k}
                onClick={() => setPeriodo(pp.k)}
                className={periodo === pp.k
                  ? "rounded-lg bg-gradient-to-r from-accent to-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"
                  : "rounded-lg px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"}
              >
                {t(pp.tk)}
              </button>
            ))}
          </div>
        </div>

        {/* Mini resumen del equipo */}
        {resumen.total > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-panel border border-border/40 bg-card/40 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums">{resumen.prom ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.promedio")}</div>
            </div>
            <div className="rounded-panel border border-success/20 bg-success/5 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums text-success">{resumen.verde}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.enVerde")}</div>
            </div>
            <div className="rounded-panel border border-destructive/20 bg-destructive/5 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums text-destructive">{resumen.rojo}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.notas.enRojo")}</div>
            </div>
          </div>
        )}

        {/* Lista */}
        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.notas.error")}</p>
          </div>
        ) : cargando ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : notas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Gauge className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.notas.vacio")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {notas.map((p) => {
              const c = colorDe(p.nota.banda);
              const nombre = p.nombre || t("hr.noName");
              return (
                <button
                  key={p.userId}
                  onClick={() => setFicha(p)}
                  className="flex items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-border/50 hover:bg-primary/5"
                >
                  <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.horas.toFixed(1)}h · {p.faltas === 0 ? t("hr.notas.detFaltasCero") : p.faltas === 1 ? t("hr.notas.detFalta1") : t("hr.notas.detFaltas", { n: p.faltas })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-display text-xl font-bold leading-none tabular-nums ${c.tx}`}>{p.nota.valor ?? "—"}</span>
                    <span className="block h-1.5 w-14 overflow-hidden rounded-full bg-primary/15">
                      <span className={`block h-full rounded-full ${c.bar}`} style={{ width: `${p.nota.valor ?? 0}%` }} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FichaPersona p={ficha} t={t} onClose={() => setFicha(null)} />
    </section>
  );
}
