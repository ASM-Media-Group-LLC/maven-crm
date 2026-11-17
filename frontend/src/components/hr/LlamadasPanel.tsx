import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, AudioLines, Gauge, Loader2, PhoneOff, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  type FilaLlamadas, type Tono, cortesPorHora, estimacionConSentido, horasAVer, tonoBajada, tonoNC, tonoSubida, useLlamadasHoy,
} from "@/hooks/useLlamadasHoy";

// ARGOS › LLAMADAS (Alvaro, 13/11/2026). Hoy hubo 87 cortes en 12 horas, casi
// todos parpadeos que se recuperan. Esta pestaña dice A QUIÉN y POR QUÉ: una
// fila por persona con cortes hoy (los que más arriba), lo grave aparte, la
// causa en palabras y qué hacer, la velocidad de internet MEDIDA (prueba real,
// no la estimación de WebRTC) y si la cancelación de ruido le está corriendo.
// Arriba, una tirita con los cortes de todo el equipo por hora.

const CAUSA: Record<string, TranslationKey> = {
  computador: "hr.llamadas.causa.computador",
  internet_subida: "hr.llamadas.causa.internet_subida",
  internet_inestable: "hr.llamadas.causa.internet_inestable",
  pestana_dormida: "hr.llamadas.causa.pestana_dormida",
  recargas: "hr.llamadas.causa.recargas",
  sin_datos: "hr.llamadas.causa.sin_datos",
  sin_causa_clara: "hr.llamadas.causa.sin_causa_clara",
};
const CONSEJO: Record<string, TranslationKey> = {
  computador: "hr.llamadas.consejo.computador",
  internet_subida: "hr.llamadas.consejo.internet_subida",
  internet_inestable: "hr.llamadas.consejo.internet_inestable",
  pestana_dormida: "hr.llamadas.consejo.pestana_dormida",
  recargas: "hr.llamadas.consejo.recargas",
  sin_datos: "hr.llamadas.consejo.sin_datos",
  sin_causa_clara: "hr.llamadas.consejo.sin_causa_clara",
};
const NC: Record<string, TranslationKey> = {
  fuerte: "hr.llamadas.nc.fuerte",
  activa: "hr.llamadas.nc.activa",
  solo_puerta: "hr.llamadas.nc.solo_puerta",
  fallo: "hr.llamadas.nc.fallo",
  no_soportada: "hr.llamadas.nc.no_soportada",
  sin_micro: "hr.llamadas.nc.sin_micro",
};
// Qué causas son culpa de la conexión o del equipo (punto ámbar) y cuáles no
// dicen nada todavía (punto gris).
const CAUSA_CON_PUNTO = new Set(["computador", "internet_subida", "internet_inestable", "pestana_dormida", "recargas"]);

const PUNTO: Record<Tono, string> = { bien: "bg-success", flojo: "bg-warning", sin_dato: "bg-muted-foreground/50" };
const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-0.5 text-xs font-medium";

const horaBogota = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const horaActualBogota = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false })) % 24;
const mbps = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));

export function LlamadasPanel() {
  const { t } = useLanguage();
  const q = useLlamadasHoy();
  const filas = useMemo(() => q.data ?? [], [q.data]);
  const totalHoras = useMemo(() => cortesPorHora(filas), [filas]);
  const resumen = useMemo(() => ({
    cortes: filas.reduce((s, f) => s + f.cortes, 0),
    graves: filas.reduce((s, f) => s + f.graves, 0),
    personas: filas.length,
    sinNC: filas.filter((f) => tonoNC(f.nc) === "flojo").length,
  }), [filas]);

  if (q.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.isError) {
    // Un fallo no es «nadie tiene cortes»: se dice y se ofrece reintentar.
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("hr.llamadas.fallo")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.llamadas.reintentar")}</Button>
      </div>
    );
  }

  const horas = horasAVer(totalHoras, horaActualBogota());
  const maxHora = Math.max(1, ...horas.map((h) => totalHoras[h]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><PhoneOff className="h-4 w-4 text-primary" />{t("hr.llamadas.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("hr.llamadas.sub")}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{t("hr.llamadas.actualizar")}</span>
        </Button>
      </div>

      {/* Los números del día, como tiles. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["hr.llamadas.tile.cortes", resumen.cortes],
          ["hr.llamadas.tile.graves", resumen.graves],
          ["hr.llamadas.tile.personas", resumen.personas],
          ["hr.llamadas.tile.sinNc", resumen.sinNC],
        ] as Array<[TranslationKey, number]>).map(([k, n]) => (
          <div key={k} className="vidrio flex flex-col gap-0.5 p-3">
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">{n}</span>
            <span className="text-[11px] text-muted-foreground">{t(k)}</span>
          </div>
        ))}
      </div>

      {!filas.length ? (
        <p className="vidrio p-6 text-sm text-muted-foreground">{t("hr.llamadas.vacio")}</p>
      ) : (
        <>
          {/* Cortes de todo el equipo por hora (hora de Bogotá). */}
          <section className="vidrio flex flex-col gap-2 p-4" aria-label={t("hr.llamadas.porHora")}>
            <h3 className="text-sm font-semibold text-foreground">{t("hr.llamadas.porHora")}</h3>
            <div className="flex h-24 items-end gap-1" role="list">
              {horas.map((h) => {
                const n = totalHoras[h];
                return (
                  <div key={h} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={t("hr.llamadas.porHoraTip", { h: String(h).padStart(2, "0"), n })}>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{n > 0 ? n : ""}</span>
                    <div className="w-full rounded-t-[3px] bg-primary/70" style={{ height: `${Math.max(n > 0 ? 6 : 2, Math.round((n / maxHora) * 64))}px`, opacity: n > 0 ? 1 : 0.25 }} />
                    <span className="text-[10px] tabular-nums text-muted-foreground">{h % 2 === 0 ? String(h).padStart(2, "0") : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <ul className="flex flex-col gap-2" aria-label={t("hr.llamadas.titulo")}>
            {filas.map((f) => <FilaPersona key={f.user_id} f={f} />)}
          </ul>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">{t("hr.llamadas.notaPrueba")}</p>
    </div>
  );
}

function FilaPersona({ f }: { f: FilaLlamadas }) {
  const { t } = useLanguage();
  const causa = f.causa ?? "sin_datos";
  const estimada = estimacionConSentido(f.subida_estimada_kbps);
  const hayPrueba = f.prueba_subida_mbps !== null || f.prueba_bajada_mbps !== null;
  const ncTono = tonoNC(f.nc);
  return (
    <li className="vidrio flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/hr/expediente/${f.user_id}`} className="flex min-w-[12rem] flex-1 items-center gap-3 rounded-lg transition hover:opacity-90">
          <UserAvatar name={f.nombre ?? "—"} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-foreground">{f.nombre ?? "—"}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {[f.equipo, f.ultimo_corte ? t("hr.llamadas.ultimo", { hora: horaBogota(f.ultimo_corte) }) : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
        <div className="flex gap-2">
          <div className="flex min-w-[64px] flex-col items-center rounded-panel border border-border/60 bg-foreground/[0.03] px-3 py-1.5">
            <span className="font-display text-xl font-semibold tabular-nums text-foreground">{f.cortes}</span>
            <span className="text-[10px] text-muted-foreground">{t("hr.llamadas.cortes")}</span>
          </div>
          <div className="flex min-w-[64px] flex-col items-center rounded-panel border border-border/60 bg-foreground/[0.03] px-3 py-1.5">
            <span className={`font-display text-xl font-semibold tabular-nums ${f.graves > 0 ? "text-foreground" : "text-muted-foreground"}`}>{f.graves}</span>
            <span className="text-[10px] text-muted-foreground">{t("hr.llamadas.graves")}</span>
          </div>
        </div>
      </div>

      {/* La causa y qué hacer. */}
      <div className="flex flex-col gap-1">
        <span className={PASTILLA + " self-start text-foreground/90"}>
          <span className={`h-1.5 w-1.5 rounded-full ${CAUSA_CON_PUNTO.has(causa) ? "bg-warning" : "bg-muted-foreground/50"}`} aria-hidden />
          {CAUSA[causa] ? t(CAUSA[causa]) : (f.causa_texto ?? causa)}
        </span>
        <p className="text-xs text-muted-foreground">
          {CONSEJO[causa] ? t(CONSEJO[causa]) : (f.consejo ?? "")}
        </p>
      </div>

      {/* Internet medido de verdad, la llamada y el equipo. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3 text-xs">
        {hayPrueba ? (
          <>
            <span className={PASTILLA} title={f.prueba_at ? t("hr.llamadas.medidoA", { hora: horaBogota(f.prueba_at) }) : undefined}>
              <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tonoSubida(f.prueba_subida_mbps)]}`} aria-hidden />
              <Gauge className="h-3 w-3 text-muted-foreground" aria-hidden />
              {f.prueba_subida_mbps !== null
                ? t(f.prueba_subida_tope ? "hr.llamadas.subidaMenorQue" : "hr.llamadas.subida", { n: mbps(f.prueba_subida_mbps) })
                : t("hr.llamadas.subidaSinDato")}
            </span>
            <span className={PASTILLA}>
              <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tonoBajada(f.prueba_bajada_mbps)]}`} aria-hidden />
              {f.prueba_bajada_mbps !== null ? t("hr.llamadas.bajada", { n: mbps(f.prueba_bajada_mbps) }) : t("hr.llamadas.bajadaSinDato")}
            </span>
          </>
        ) : (
          <span className={PASTILLA + " text-muted-foreground"}>
            <span className={`h-1.5 w-1.5 rounded-full ${PUNTO.sin_dato}`} aria-hidden />
            {t("hr.llamadas.sinPrueba")}
          </span>
        )}
        {f.rtt_ms !== null && <span className={PASTILLA}>{t("hr.llamadas.rtt", { n: f.rtt_ms })}</span>}
        {f.perdida_pct !== null && <span className={PASTILLA}>{t("hr.llamadas.perdida", { n: f.perdida_pct })}</span>}
        {f.nav && <span className={PASTILLA + " text-muted-foreground"}>{f.nav === "other · other" ? t("hr.llamadas.navOtro") : f.nav}</span>}
        <span className={PASTILLA}>
          <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[ncTono]}`} aria-hidden />
          <AudioLines className="h-3 w-3 text-muted-foreground" aria-hidden />
          {t(NC[f.nc ?? ""] ?? "hr.llamadas.nc.sinDato")}
        </span>
        {estimada !== null && (
          <span className="text-[11px] text-muted-foreground" title={t("hr.llamadas.estimadaTip")}>
            {t("hr.llamadas.estimada", { n: estimada })}
          </span>
        )}
      </div>
    </li>
  );
}
