import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Minus, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  type CausaAudio, type Cambio, type DiaDeCalidad, type Metrica, type PersonaDeCalidad, METRICAS, tendencia, useCalidadPorDia, useCalidadPorPersona,
} from "@/hooks/useCalidadLlamadas";

// ¿LAS LLAMADAS MEJORAN DE VERDAD? (Alvaro, 18/11/2026). Solo el dueño lo ve
// (la puerta la pone HRMonitorIA con useEsDueno y la RPC la vuelve a revisar).
//   · Arriba, un cuadrito por métrica: el último día contra la semana anterior
//     («mejoró / empeoró / igual»). Tocar uno lo pone en la gráfica.
//   · La gráfica: 14 días, una barra por día.
//   · Abajo, persona por persona (hoy o 7 días), la peor primero, con la causa
//     del audio en palabras.

const ETIQUETA: Record<Metrica, TranslationKey> = {
  pct_con_problema: "hr.calidad.m.pct_con_problema",
  pct_mala_conexion: "hr.calidad.m.pct_mala_conexion",
  cortes_por_100h: "hr.calidad.m.cortes_por_100h",
  pct_congelado: "hr.calidad.m.pct_congelado",
  pct_cam_limitada: "hr.calidad.m.pct_cam_limitada",
  pct_audio_malo: "hr.calidad.m.pct_audio_malo",
  rtt_mediana_ms: "hr.calidad.m.rtt_mediana_ms",
};
const AYUDA: Record<Metrica, TranslationKey> = {
  pct_con_problema: "hr.calidad.ayuda.pct_con_problema",
  pct_mala_conexion: "hr.calidad.ayuda.pct_mala_conexion",
  cortes_por_100h: "hr.calidad.ayuda.cortes_por_100h",
  pct_congelado: "hr.calidad.ayuda.pct_congelado",
  pct_cam_limitada: "hr.calidad.ayuda.pct_cam_limitada",
  pct_audio_malo: "hr.calidad.ayuda.pct_audio_malo",
  rtt_mediana_ms: "hr.calidad.ayuda.rtt_mediana_ms",
};
const CAUSA_AUDIO: Record<CausaAudio, TranslationKey> = {
  mic_mudo: "hr.calidad.audio.mic_mudo",
  voz_se_pierde: "hr.calidad.audio.voz_se_pierde",
  escucha_cortado: "hr.calidad.audio.escucha_cortado",
};
const CAMBIO: Record<Cambio, { k: TranslationKey; clase: string; Icono: typeof Minus }> = {
  mejor: { k: "hr.calidad.cambio.mejor", clase: "text-success", Icono: ArrowDownRight },
  peor: { k: "hr.calidad.cambio.peor", clase: "text-destructive", Icono: ArrowUpRight },
  igual: { k: "hr.calidad.cambio.igual", clase: "text-muted-foreground", Icono: Minus },
};
const COLUMNAS: Metrica[] = ["pct_mala_conexion", "cortes_por_100h", "pct_congelado", "pct_cam_limitada", "pct_audio_malo", "rtt_mediana_ms"];
const POR_PAGINA = 10;

type Tr = (k: TranslationKey, p?: Record<string, string | number>) => string;

/** «5,9 %», «12,4», «114 ms»; sin dato, «—». */
export function valorLegible(m: Metrica, v: number | null, t: Tr, idioma: string): string {
  if (v === null) return "—";
  const n = v.toLocaleString(idioma, { maximumFractionDigits: 1 });
  if (m === "rtt_mediana_ms") return t("hr.calidad.valor.ms", { n });
  if (m === "cortes_por_100h") return n;
  return t("hr.calidad.valor.pct", { n });
}

export function TableroCalidadLlamadas() {
  const { t, language } = useLanguage();
  const diasQ = useCalidadPorDia(14);
  const [rango, setRango] = useState<1 | 7>(1);
  const personasQ = useCalidadPorPersona(rango);
  const [metrica, setMetrica] = useState<Metrica>("pct_con_problema");
  const [pagina, setPagina] = useState(0);

  const dias = useMemo(() => diasQ.data ?? [], [diasQ.data]);
  const personas = useMemo(() => personasQ.data ?? [], [personasQ.data]);
  const paginas = Math.max(1, Math.ceil(personas.length / POR_PAGINA));
  const paginaVigente = Math.min(pagina, paginas - 1);
  const enPagina = personas.slice(paginaVigente * POR_PAGINA, paginaVigente * POR_PAGINA + POR_PAGINA);

  const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(language, { day: "numeric", month: "short" });

  return (
    <section className="flex flex-col gap-3" aria-label={t("hr.calidad.titulo")}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4 text-primary" />{t("hr.calidad.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("hr.calidad.sub")}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" disabled={diasQ.isFetching || personasQ.isFetching}
          onClick={() => { void diasQ.refetch(); void personasQ.refetch(); }}>
          <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${diasQ.isFetching ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{t("hr.llamadas.actualizar")}</span>
        </Button>
      </div>

      {diasQ.isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : diasQ.isError ? (
        <Fallo texto={t("hr.calidad.falloDias")} boton={t("hr.llamadas.reintentar")} onReintentar={() => void diasQ.refetch()} />
      ) : (
        <>
          {/* Un cuadrito por métrica: el último día contra la semana anterior. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" role="tablist" aria-label={t("hr.calidad.metricas")}>
            {METRICAS.map((m) => {
              const tend = tendencia(dias, m);
              const c = tend.cambio ? CAMBIO[tend.cambio] : null;
              const activa = metrica === m;
              return (
                <button key={m} type="button" role="tab" aria-selected={activa} onClick={() => setMetrica(m)} title={t(AYUDA[m])}
                  className={`vidrio vidrio-lift flex min-w-0 flex-col items-start gap-1 px-3 py-2.5 text-left transition ${activa ? "ring-1 ring-primary/60" : ""}`}>
                  <span className="text-[11px] leading-tight text-muted-foreground">{t(ETIQUETA[m])}</span>
                  <span className="font-display text-xl font-semibold tabular-nums text-foreground">{valorLegible(m, tend.hoy, t, language)}</span>
                  {c ? (
                    <span className={`flex items-center gap-1 text-[11px] ${c.clase}`}>
                      <c.Icono className="h-3 w-3" />{t(c.k, { antes: valorLegible(m, tend.antes, t, language) })}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{t(m === "pct_audio_malo" && tend.hoy === null ? "hr.calidad.audioSinMedir" : "hr.calidad.sinComparar")}</span>
                  )}
                </button>
              );
            })}
          </div>

          <Grafica dias={dias} metrica={metrica} t={t} idioma={language} fecha={fecha} />
        </>
      )}

      {/* Persona por persona, la peor primero. */}
      <section className="vidrio flex flex-col overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
          <h3 className="min-w-0 flex-1 text-sm font-semibold">{t("hr.calidad.personas")}</h3>
          <div className="flex gap-1 rounded-full border border-border/40 bg-card/30 p-0.5" role="group">
            {([1, 7] as const).map((r) => (
              <button key={r} type="button" aria-pressed={rango === r} onClick={() => { setRango(r); setPagina(0); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${rango === r ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t(r === 1 ? "hr.calidad.hoy" : "hr.calidad.semana")}
              </button>
            ))}
          </div>
        </div>
        {personasQ.isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : personasQ.isError ? (
          <div className="p-3"><Fallo texto={t("hr.calidad.falloPersonas")} boton={t("hr.llamadas.reintentar")} onReintentar={() => void personasQ.refetch()} /></div>
        ) : !personas.length ? (
          <p className="p-6 text-sm text-muted-foreground">{t("hr.calidad.vacio")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("hr.calidad.col.persona")}</th>
                    <th className="px-3 py-2 font-medium">{t(ETIQUETA.pct_con_problema)}</th>
                    {COLUMNAS.map((m) => <th key={m} className="px-2 py-2 text-right font-medium" title={t(AYUDA[m])}>{t(ETIQUETA[m])}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {enPagina.map((p) => <FilaPersona key={p.user_id} p={p} t={t} idioma={language} />)}
                </tbody>
              </table>
            </div>
            {paginas > 1 && (
              <div className="flex items-center justify-end gap-2 border-t border-border/40 p-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{t("hr.calidad.pagina", { a: paginaVigente + 1, b: paginas })}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={paginaVigente === 0} onClick={() => setPagina(paginaVigente - 1)} aria-label={t("hr.calidad.anterior")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={paginaVigente >= paginas - 1} onClick={() => setPagina(paginaVigente + 1)} aria-label={t("hr.calidad.siguiente")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function Fallo({ texto, boton, onReintentar }: { texto: string; boton: string; onReintentar: () => void }) {
  // Un fallo no es «todo bien»: se dice y se ofrece reintentar.
  return (
    <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{texto}</span>
      <Button variant="outline" size="sm" onClick={onReintentar}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{boton}</Button>
    </div>
  );
}

function Grafica({ dias, metrica, t, idioma, fecha }: { dias: DiaDeCalidad[]; metrica: Metrica; t: Tr; idioma: string; fecha: (d: string) => string }) {
  const max = Math.max(1, ...dias.map((d) => d[metrica] ?? 0));
  return (
    <section className="vidrio flex flex-col gap-2 px-4 py-3" aria-label={t("hr.calidad.grafica", { m: t(ETIQUETA[metrica]) })}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-semibold text-foreground">{t(ETIQUETA[metrica])}</h3>
        <span className="text-[11px] text-muted-foreground">{t(AYUDA[metrica])}</span>
      </div>
      <div className="flex h-28 items-end gap-1" role="list">
        {dias.map((d) => {
          const v = d.minutos > 0 ? d[metrica] : null;
          return (
            <div key={d.dia} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={t("hr.calidad.diaTip", { d: fecha(d.dia), v: valorLegible(metrica, v, t, idioma), h: d.horas_llamada.toLocaleString(idioma, { maximumFractionDigits: 1 }) })}>
              <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:block">{v !== null ? v.toLocaleString(idioma, { maximumFractionDigits: metrica === "rtt_mediana_ms" ? 0 : 1 }) : ""}</span>
              <div className="w-full rounded-t-[3px] bg-primary/70"
                style={{ height: `${v === null ? 2 : Math.max(4, Math.round((v / max) * 72))}px`, opacity: v === null ? 0.25 : 1 }} />
              <span className="whitespace-nowrap text-[9px] tabular-nums text-muted-foreground">{fecha(d.dia).replace(/\.$/, "")}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FilaPersona({ p, t, idioma }: { p: PersonaDeCalidad; t: Tr; idioma: string }) {
  const prob = p.pct_con_problema ?? 0;
  const tono = prob >= 20 ? "bg-destructive" : prob >= 8 ? "bg-warning" : "bg-success";
  return (
    <tr className="border-t border-border/30 align-middle">
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar name={p.nombre ?? "—"} size="xs" />
          <div className="min-w-0">
            <div className="truncate font-medium">{p.nombre ?? "—"}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {[p.equipo, t("hr.calidad.minutos", { n: p.minutos })].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
            <div className={`h-full ${tono}`} style={{ width: `${Math.min(100, prob)}%` }} />
          </div>
          <span className="tabular-nums text-xs">{valorLegible("pct_con_problema", p.pct_con_problema, t, idioma)}</span>
        </div>
      </td>
      {COLUMNAS.map((m) => (
        <td key={m} className="px-2 py-2 text-right text-xs tabular-nums">
          {valorLegible(m, p[m], t, idioma)}
          {m === "pct_audio_malo" && p.causa_audio && (
            <div className="text-[10px] text-warning">{t(CAUSA_AUDIO[p.causa_audio])}</div>
          )}
        </td>
      ))}
    </tr>
  );
}
