// ARGOS › HISTORIAL DEL HUB (Alvaro, 19/11/2026: «quiero saber si los
// supervisores lo apagan a propósito o si falla el sistema»).
//   · Arriba, el día: Hoy / Ayer / otro día.
//   · Un renglón por supervisor con el resumen del día: cuántas veces quitó la
//     pantalla él y cuántas falló, cuántas apagó la cámara, cuántas salió del
//     Hub (y cuántas por falla) y los minutos sin pantalla / cámara / fuera.
//   · Al abrirlo, su línea de tiempo: hora · qué pasó · por qué · a propósito
//     o falla del sistema.
// Lo decide la base (hub_historial). Un fallo se dice como fallo, con
// «Reintentar»; nunca como «sin movimientos».
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Camera, CameraOff, ChevronDown, LogIn, LogOut, Monitor, MonitorOff, RefreshCw, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { horaUI } from "@/lib/formatoHora";
import { cn } from "@/lib/utils";
import {
  claveDeCausaDeEvento, claveDeEvento, diaBogota, leerHistorialHub, quienFue,
  type EventoHub, type HistorialHub, type QuienFue, type ResumenHub,
} from "@/lib/historialHub";

const sinTipar = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const QUIEN: Record<Exclude<QuienFue, "bien">, { k: TranslationKey; clase: string }> = {
  proposito: { k: "hr.hubHist.quien.proposito", clase: "bg-warning/15 text-warning" },
  falla: { k: "hr.hubHist.quien.falla", clase: "bg-primary/10 text-primary" },
  dudoso: { k: "hr.hubHist.quien.dudoso", clase: "bg-muted text-muted-foreground" },
};

function IconoEvento({ e }: { e: EventoHub }) {
  const bien = quienFue(e) === "bien";
  const clase = cn("h-4 w-4", bien ? "text-success" : "text-muted-foreground");
  if (e.tipo === "pantalla") return bien ? <Monitor className={clase} aria-hidden /> : <MonitorOff className={clase} aria-hidden />;
  if (e.tipo === "camara") return bien ? <Camera className={clase} aria-hidden /> : <CameraOff className={clase} aria-hidden />;
  return bien ? <LogIn className={clase} aria-hidden /> : <LogOut className={clase} aria-hidden />;
}

function Cifra({ n, k, alerta }: { n: number; k: TranslationKey; alerta?: boolean }) {
  const { t } = useLanguage();
  return (
    <span className={cn("vidrio inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs", alerta && n > 0 ? "text-foreground ring-1 ring-warning/40" : "text-muted-foreground")}>
      <span className="font-semibold tabular-nums">{n}</span> {t(k)}
    </span>
  );
}

function Supervisor({ r, eventos }: { r: ResumenHub; eventos: EventoHub[] }) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const inicial = r.nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="vidrio rounded-2xl">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full flex-col gap-2 p-3 text-left sm:flex-row sm:items-center"
      >
        <span className="flex min-w-0 items-center gap-2 sm:w-44">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary" aria-hidden>{inicial}</span>
          <span className="truncate font-medium">{r.nombre}</span>
        </span>
        <span className="flex flex-1 flex-wrap gap-1.5">
          <Cifra n={r.pantallaQuitada} k="hr.hubHist.res.pantallaQuitada" alerta />
          <Cifra n={r.pantallaFalla} k="hr.hubHist.res.pantallaFalla" />
          <Cifra n={r.camaraApagada} k="hr.hubHist.res.camaraApagada" alerta />
          <Cifra n={r.salidasPropias} k="hr.hubHist.res.salidasPropias" alerta />
          <Cifra n={r.salidasFalla} k="hr.hubHist.res.salidasFalla" />
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{t("hr.hubHist.res.minutos", { p: r.minSinPantalla, c: r.minSinCamara, f: r.minFuera })}</span>
          <ChevronDown className={cn("h-4 w-4 transition", abierto && "rotate-180")} aria-hidden />
        </span>
      </button>
      {abierto && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2">
          {eventos.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t("hr.hubHist.sinMovimientosPersona")}</p>
          ) : (
            <ol className="flex flex-col">
              {eventos.map((e) => {
                const q = quienFue(e);
                const causa = claveDeCausaDeEvento(e);
                return (
                  <li key={e.id} className="flex items-start gap-3 border-b border-border/20 py-2 last:border-0">
                    <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{horaUI(e.creado)}</span>
                    <span className="pt-0.5"><IconoEvento e={e} /></span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{t(claveDeEvento(e))}</span>
                      {causa && <span className="block text-xs text-muted-foreground">{t(causa)}</span>}
                    </span>
                    {q !== "bien" && (
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", QUIEN[q].clase)}>{t(QUIEN[q].k)}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function HistorialHubPanel() {
  const { t } = useLanguage();
  const hoy = diaBogota();
  const ayer = diaBogota(new Date(), 1);
  const [dia, setDia] = useState(hoy);
  const [datos, setDatos] = useState<HistorialHub | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  const leer = useCallback(async (d: string) => {
    setCargando(true);
    setFallo(false);
    try {
      const { data, error } = await sinTipar.rpc("hub_historial", { _desde: d });
      if (error) throw new Error(error.message);
      setDatos(leerHistorialHub(data));
    } catch (e) {
      console.warn("[hub] no pude leer el historial del Hub", e);
      setDatos(null);
      setFallo(true);
    }
    setCargando(false);
  }, []);

  useEffect(() => { void leer(dia); }, [dia, leer]);

  const boton = (activo: boolean) =>
    cn("rounded-xl px-3 py-1.5 text-sm font-medium transition", activo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("hr.hubHist.titulo")}</h2>
          <p className="text-sm text-muted-foreground">{t("hr.hubHist.subtitulo")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/50 bg-background/40 p-1">
          <button type="button" className={boton(dia === hoy)} onClick={() => setDia(hoy)}>{t("hr.hubHist.hoy")}</button>
          <button type="button" className={boton(dia === ayer)} onClick={() => setDia(ayer)}>{t("hr.hubHist.ayer")}</button>
          <input
            type="date"
            aria-label={t("hr.hubHist.otroDia")}
            value={dia}
            max={hoy}
            onChange={(e) => { if (e.target.value) setDia(e.target.value); }}
            className="rounded-xl bg-transparent px-2 py-1 text-sm text-foreground [color-scheme:light_dark]"
          />
        </div>
      </div>

      {cargando && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("hr.hubHist.cargando")}
        </div>
      )}

      {!cargando && fallo && (
        <div role="alert" className="vidrio flex flex-col items-center gap-3 rounded-2xl p-6 text-center text-sm">
          <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
          <span>{t("hr.hubHist.error")}</span>
          <button type="button" onClick={() => { void leer(dia); }} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-sm hover:bg-muted/40">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {t("hr.hubHist.reintentar")}
          </button>
        </div>
      )}

      {!cargando && !fallo && datos && (datos.eventos.length === 0 ? (
        <div className="vidrio rounded-2xl p-8 text-center text-sm text-muted-foreground">{t("hr.hubHist.vacio")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("hr.hubHist.leyenda")}</p>
          {datos.resumen.map((r) => (
            <Supervisor key={r.userId} r={r} eventos={datos.eventos.filter((e) => e.userId === r.userId)} />
          ))}
        </div>
      ))}
    </section>
  );
}
