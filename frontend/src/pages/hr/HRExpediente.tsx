import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, AlertTriangle, ScreenShare, Camera, ImageIcon, Loader2, Gauge } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useExpedienteEmpleado, type DiaExpediente, type CapturaDia } from "@/hooks/useExpedienteEmpleado";
import { urlCaptura } from "@/hooks/useMonitorEventos";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
import type { BandaNota } from "@/lib/notaEmpleado";
import type { TranslationKey } from "@/lib/i18n";

// Expediente del empleado: un calendario del mes donde cada día lleva su nota con
// color; al tocar un día, el detalle de ese día (horas, faltas, pausas y los
// pantallazos/capturas que Argos tomó). Todo por t().

const TONO: Record<BandaNota, { bg: string; tx: string; bar: string }> = {
  bien: { bg: "bg-success/15 border-success/30", tx: "text-success", bar: "bg-success" },
  ojo: { bg: "bg-warning/15 border-warning/30", tx: "text-warning", bar: "bg-warning" },
  mal: { bg: "bg-destructive/15 border-destructive/30", tx: "text-destructive", bar: "bg-destructive" },
};

const abrirCaptura = async (path: string) => { const u = await urlCaptura(path); if (u) window.open(u, "_blank", "noopener"); };

// Galería de miniaturas de un día: firma hasta TOPE rutas y las pinta como fotos
// (modelo Hubstaff). Lo malo (fuera de lugar) va con borde rojo. Al tocar, abre
// la foto entera. Re-firma al cambiar de día (las URLs firmadas caducan a 2 min).
function GaleriaCapturas({ capturas, tipo, tope, t }: {
  capturas: CapturaDia[];
  tipo: "pantalla" | "camara";
  tope: number;
  t: (k: TranslationKey, v?: Record<string, string | number>) => string;
}) {
  const lista = useMemo(() => capturas.filter((c) => c.tipo === tipo), [capturas, tipo]);
  const muestra = useMemo(() => lista.slice(0, tope), [lista, tope]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const pares = await Promise.all(muestra.map(async (c) => [c.id, await urlCaptura(c.path)] as const));
      if (vivo) setUrls(Object.fromEntries(pares.filter(([, u]) => !!u) as [string, string][]));
    })();
    return () => { vivo = false; };
  }, [muestra]);

  if (lista.length === 0) return <p className="text-xs text-muted-foreground">{t("hr.exp.sinCapturas")}</p>;

  const esPantalla = tipo === "pantalla";
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${esPantalla ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-4 sm:grid-cols-5"}`}>
        {muestra.map((c) => {
          const u = urls[c.id];
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => abrirCaptura(c.path)}
              title={`${format(new Date(c.createdAt), "HH:mm")}${c.veredicto ? ` · ${c.veredicto}` : ""}`}
              className={`group relative overflow-hidden rounded-xl border bg-muted/40 transition ${
                c.fueraDeLugar ? "border-destructive/60" : "border-border/40 hover:border-primary/50"
              }`}
            >
              <div className={`relative w-full ${esPantalla ? "aspect-[16/10]" : "aspect-square"}`}>
                {u ? (
                  <img src={u} alt={format(new Date(c.createdAt), "HH:mm")} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
                )}
                <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-white backdrop-blur-sm">
                  {format(new Date(c.createdAt), "HH:mm")}
                </span>
                {c.fueraDeLugar && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold text-destructive-foreground">
                    <AlertTriangle className="h-2.5 w-2.5" />{t("hr.exp.fueraDeLugar")}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {lista.length > muestra.length && (
        <p className="text-[11px] text-muted-foreground">{t("hr.exp.masCapturas", { n: lista.length - muestra.length })}</p>
      )}
    </div>
  );
}

function DetalleDia({ dia, esHoy, t }: { dia: DiaExpediente | null; esHoy: boolean; t: (k: TranslationKey, v?: Record<string, string | number>) => string }) {
  if (!dia) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Gauge className="h-7 w-7 opacity-40" />
        <p className="text-sm">{t("hr.exp.elegirDia")}</p>
      </div>
    );
  }
  const c = dia.nota.banda ? TONO[dia.nota.banda] : null;
  const fotos = dia.capturas.filter((x) => x.tipo === "camara");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-primary">
            {esHoy ? t("hr.exp.hoy") : format(new Date(dia.fecha + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <p className="text-xs text-muted-foreground">{t("hr.exp.nota")}</p>
        </div>
        <div className={`ml-auto font-display text-3xl font-bold tabular-nums ${c?.tx ?? "text-muted-foreground"}`}>{dia.nota.valor ?? "—"}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
          <div className="font-display text-base font-bold tabular-nums">{dia.horas.toFixed(1)}h</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.horas")}</div>
        </div>
        <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
          <div className="font-display text-base font-bold tabular-nums">{dia.faltas.length}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.faltas")}</div>
        </div>
        <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
          <div className="font-display text-base font-bold tabular-nums">{Math.round(dia.minutosPausaDeMas)}m</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.pausas")}</div>
        </div>
      </div>

      {/* Los PANTALLAZOS del día, como fotos (lo que hizo) */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ScreenShare className="h-3.5 w-3.5" />{t("hr.exp.pantallazosDia")}
        </p>
        <GaleriaCapturas capturas={dia.capturas} tipo="pantalla" tope={48} t={t} />
      </div>

      {/* Faltas del día */}
      {dia.faltas.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("hr.exp.faltas")}</p>
          <div className="flex flex-col gap-1.5">
            {dia.faltas.slice(0, 20).map((f) => {
              const lbl = LABEL_FALTA[f.tipo as FaltaTipo];
              return (
                <div key={f.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/30 px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive/80" />
                  <span className="min-w-0 flex-1 truncate text-xs">{lbl ? t(lbl) : f.tipo}{f.detalle ? ` · ${f.detalle}` : ""}</span>
                  {f.capturaPath && (
                    <button type="button" onClick={() => abrirCaptura(f.capturaPath!)} className="shrink-0 text-muted-foreground hover:text-primary" title={t("hr.exp.abrir")}><ImageIcon className="h-3.5 w-3.5" /></button>
                  )}
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{format(new Date(f.createdAt), "HH:mm")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* La cámara del día (que estuvo) */}
      {fotos.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Camera className="h-3.5 w-3.5" />{t("hr.exp.camara")}
          </p>
          <GaleriaCapturas capturas={dia.capturas} tipo="camara" tope={24} t={t} />
        </div>
      )}
    </div>
  );
}

export default function HRExpediente() {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useLanguage();
  const [cur, setCur] = useState(() => { const d = new Date(); return { anio: d.getFullYear(), mes: d.getMonth() + 1 }; });
  // Arranca en HOY: lo primero que quiere ver Alvaro es el día de hoy, no un panel vacío.
  const [diaSel, setDiaSel] = useState<string | null>(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));
  const { expediente, cargando, error, hoy } = useExpedienteEmpleado(userId ?? null, cur.anio, cur.mes);

  const mesTexto = useMemo(() => new Date(cur.anio, cur.mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }), [cur]);
  const esMesActual = useMemo(() => { const d = new Date(); return d.getFullYear() === cur.anio && d.getMonth() + 1 === cur.mes; }, [cur]);
  const mover = (d: number) => {
    const m = cur.mes - 1 + d;
    const n = { anio: cur.anio + Math.floor(m / 12), mes: ((m % 12) + 12) % 12 + 1 };
    const esActual = new Date().getFullYear() === n.anio && new Date().getMonth() + 1 === n.mes;
    setCur(n);
    setDiaSel(esActual ? hoy : null); // al volver al mes actual, cae en hoy
  };

  // Grilla del mes (lunes primero).
  const celdas = useMemo(() => {
    const primero = new Date(cur.anio, cur.mes - 1, 1).getDay();           // 0=dom
    const offset = (primero + 6) % 7;                                       // a lunes
    const dias = new Date(cur.anio, cur.mes, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= dias; d++) out.push(`${cur.anio}-${String(cur.mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }, [cur]);

  // El día seleccionado. Si tiene datos, esos; si está seleccionado pero sin datos
  // (p. ej. hoy sin capturas todavía), un día en cero — nunca el cartel "elige un día".
  const diaDetalle = useMemo<DiaExpediente | null>(() => {
    if (!diaSel || !expediente) return null;
    const d = expediente.dias.get(diaSel);
    if (d) return d;
    return { fecha: diaSel, horas: 0, faltas: [], minutosPausaDeMas: 0, capturas: [], nota: { valor: null, banda: null, factores: [] } };
  }, [diaSel, expediente]);
  const nombre = expediente?.nombre || t("hr.noName");

  return (
    <Page>
      <PageHeader
        title={t("hr.exp.title")}
        subtitle={t("hr.exp.sub")}
        icon={<Gauge className="h-5 w-5" />}
      />
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* Calendario */}
        <section className="vidrio sube p-4 lg:p-5">
          <div className="v-cont">
            <div className="mb-4 flex items-center gap-3">
              {expediente && <UserAvatar name={nombre} src={expediente.avatarUrl} seed={expediente.avatarSeed} size="md" />}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-base font-bold leading-tight tracking-tight">{nombre}</h2>
                <p className="text-xs capitalize text-muted-foreground">{mesTexto}</p>
              </div>
              <button onClick={() => mover(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => mover(1)} disabled={esMesActual} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>

            {error ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.exp.error")}</p></div>
            ) : cargando ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <>
                <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {celdas.map((f, i) => {
                    if (!f) return <div key={i} />;
                    const d = expediente?.dias.get(f);
                    const banda = d?.nota.banda ?? null;
                    const c = banda ? TONO[banda] : null;
                    const num = Number(f.slice(8));
                    const esHoy = f === hoy;
                    const sel = f === diaSel;
                    return (
                      <button key={i} onClick={() => setDiaSel(f)}
                        className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition
                          ${c ? c.bg : "border-border/30 bg-card/20"} ${sel ? "ring-2 ring-primary ring-offset-1 ring-offset-transparent" : ""} hover:border-primary/40`}>
                        <span className={`tabular-nums ${esHoy ? "font-bold text-primary" : "text-foreground/80"}`}>{num}</span>
                        {d?.nota.valor != null && <span className={`font-display text-[11px] font-bold tabular-nums ${c?.tx}`}>{d.nota.valor}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-success/60" /> ≥80</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warning/60" /> 60–79</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-destructive/60" /> &lt;60</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Detalle del día */}
        <section className="vidrio sube p-4 lg:p-5" style={{ animationDelay: "0.06s" }}>
          <div className="v-cont"><DetalleDia dia={diaDetalle} esHoy={diaSel === hoy} t={t} /></div>
        </section>
      </div>
    </Page>
  );
}
