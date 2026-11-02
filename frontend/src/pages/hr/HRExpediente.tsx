import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, AlertTriangle, ScreenShare, Camera, ImageIcon, Loader2, Gauge, CalendarDays } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useExpedienteEmpleado, type DiaExpediente, type CapturaDia } from "@/hooks/useExpedienteEmpleado";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
import type { BandaNota } from "@/lib/notaEmpleado";
import type { TranslationKey } from "@/lib/i18n";

// Expediente del empleado, estilo Hubstaff: se abre en HOY, con su nota y sus
// horas arriba, y la TIRA de pantallazos del día —cada pantalla con su cámara
// pegada en la esquina— agrupada por hora. Para otros días, flechas ‹ ayer / hoy ›
// y un calendario opcional. Todo por t().

const TONO: Record<BandaNota, { bg: string; tx: string; bar: string; chip: string }> = {
  bien: { bg: "bg-success/15 border-success/30", tx: "text-success", bar: "bg-success", chip: "bg-success/10 text-success" },
  ojo: { bg: "bg-warning/15 border-warning/30", tx: "text-warning", bar: "bg-warning", chip: "bg-warning/10 text-warning" },
  mal: { bg: "bg-destructive/15 border-destructive/30", tx: "text-destructive", bar: "bg-destructive", chip: "bg-destructive/10 text-destructive" },
};

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

function sumarDias(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Dónde firmar cada captura: si ya está en el NAS (enNas), por su nasPath; si no,
// por su path del buzón.
const claveFoto = (c: CapturaDia | null): string | null => (c ? (c.enNas ? c.nasPath : c.path) : null);

// Abrir una captura entera (buzón o NAS).
const abrirFoto = async (c: CapturaDia) => {
  const u = c.enNas && c.nasPath ? (await urlsDeNas([c.nasPath]))[c.nasPath] : await urlCaptura(c.path);
  if (u) window.open(u, "_blank", "noopener");
};
// Abrir una captura del buzón por su path (las faltas de monitor_eventos nunca van al NAS).
const abrirPath = async (path: string) => { const u = await urlCaptura(path); if (u) window.open(u, "_blank", "noopener"); };

// Un MOMENTO del día: una pantalla con su cámara pegada (o, si no hay pantalla,
// la cámara sola). Se emparejan por cercanía en el tiempo (≤ 90 s).
interface Momento { id: string; createdAt: string; pantalla: CapturaDia | null; camara: CapturaDia | null; fueraDeLugar: boolean | null; veredicto: string | null; }

function construirMomentos(capturas: CapturaDia[]): Momento[] {
  const desc = (a: CapturaDia, b: CapturaDia) => (a.createdAt < b.createdAt ? 1 : -1);
  const pantallas = capturas.filter((c) => c.tipo === "pantalla").sort(desc);
  const camaras = capturas.filter((c) => c.tipo === "camara").sort(desc);
  const usadas = new Set<string>();
  const momentos: Momento[] = [];
  for (const p of pantallas) {
    let best: CapturaDia | null = null;
    let bestD = Infinity;
    for (const cam of camaras) {
      if (usadas.has(cam.id)) continue;
      const d = Math.abs(Date.parse(cam.createdAt) - Date.parse(p.createdAt));
      if (d < bestD) { bestD = d; best = cam; }
    }
    if (best && bestD <= 90_000) usadas.add(best.id); else best = null;
    momentos.push({ id: p.id, createdAt: p.createdAt, pantalla: p, camara: best, fueraDeLugar: p.fueraDeLugar, veredicto: p.veredicto });
  }
  for (const cam of camaras) {
    if (usadas.has(cam.id)) continue;
    momentos.push({ id: cam.id, createdAt: cam.createdAt, pantalla: null, camara: cam, fueraDeLugar: cam.fueraDeLugar, veredicto: cam.veredicto });
  }
  return momentos.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const TOPE_MOMENTOS = 72; // lo más reciente primero; el resto se cuenta aparte

// La TIRA de pantallazos del día (modelo Hubstaff): agrupada por hora, cada
// momento con su pantalla grande y su cámara pegada en la esquina. Firma las URLs
// de lo visible y se re-firma al cambiar de día (caducan a 2 min).
function TiraDelDia({ capturas, t }: { capturas: CapturaDia[]; t: Tr }) {
  const momentos = useMemo(() => construirMomentos(capturas), [capturas]);
  const visibles = useMemo(() => momentos.slice(0, TOPE_MOMENTOS), [momentos]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    void (async () => {
      // Las del buzón se firman con Supabase; las que ya están en el NAS, por la
      // edge argos-foto (un solo viaje). El mapa se indexa por clave (path o nasPath).
      const buzon = new Set<string>();
      const nas = new Set<string>();
      for (const m of visibles) {
        for (const c of [m.pantalla, m.camara]) {
          if (!c) continue;
          if (c.enNas && c.nasPath) nas.add(c.nasPath);
          else if (!c.enNas) buzon.add(c.path);
        }
      }
      const [nasUrls, buzonPairs] = await Promise.all([
        urlsDeNas([...nas]),
        Promise.all([...buzon].map(async (p) => [p, await urlCaptura(p)] as const)),
      ]);
      if (vivo) setUrls({ ...nasUrls, ...Object.fromEntries(buzonPairs.filter(([, u]) => !!u) as [string, string][]) });
    })();
    return () => { vivo = false; };
  }, [visibles]);

  if (momentos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <ScreenShare className="h-7 w-7 opacity-40" />
        <p className="text-sm">{t("hr.exp.sinCapturas")}</p>
      </div>
    );
  }

  // Agrupar por hora (lo más reciente primero).
  const grupos: Array<{ hora: string; items: Momento[] }> = [];
  for (const m of visibles) {
    const hora = format(new Date(m.createdAt), "h a", { locale: es });
    const ult = grupos[grupos.length - 1];
    if (ult && ult.hora === hora) ult.items.push(m);
    else grupos.push({ hora, items: [m] });
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <div key={g.hora}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.hora}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {g.items.map((m) => {
              const principal = m.pantalla ?? m.camara!;
              const claveP = claveFoto(principal);
              const url = claveP ? urls[claveP] : undefined;
              const esPantalla = !!m.pantalla;
              const claveC = m.pantalla && m.camara ? claveFoto(m.camara) : null;
              const camUrl = claveC ? urls[claveC] : null;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrirFoto(principal)}
                  title={`${format(new Date(m.createdAt), "HH:mm")}${m.veredicto ? ` · ${m.veredicto}` : ""}`}
                  className={`group relative overflow-hidden rounded-xl border bg-muted/40 transition ${m.fueraDeLugar ? "border-destructive/60" : "border-border/40 hover:border-primary/50"}`}
                >
                  <div className="relative aspect-[16/10] w-full">
                    {url ? (
                      <img src={url} alt={format(new Date(m.createdAt), "HH:mm")} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
                    )}
                    {/* La cámara pegada en la esquina */}
                    {camUrl && (
                      <img src={camUrl} alt="" loading="lazy" className="absolute bottom-1 right-1 h-11 w-16 rounded-md border-2 border-background/80 object-cover shadow-md" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-white backdrop-blur-sm">
                      {format(new Date(m.createdAt), "HH:mm")}
                    </span>
                    <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                      {esPantalla ? <ScreenShare className="h-2.5 w-2.5" /> : <Camera className="h-2.5 w-2.5" />}
                    </span>
                    {m.fueraDeLugar && (
                      <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold text-destructive-foreground">
                        <AlertTriangle className="h-2.5 w-2.5" />{t("hr.exp.fueraDeLugar")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {momentos.length > visibles.length && (
        <p className="text-[11px] text-muted-foreground">{t("hr.exp.masCapturas", { n: momentos.length - visibles.length })}</p>
      )}
    </div>
  );
}

export default function HRExpediente() {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useLanguage();
  const hoyStr = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  // Se abre en HOY. El día elegido manda; el mes sale de él (para cargar y para el calendario).
  const [diaSel, setDiaSel] = useState<string>(hoyStr);
  const [verCalendario, setVerCalendario] = useState(false);
  const anio = Number(diaSel.slice(0, 4));
  const mes = Number(diaSel.slice(5, 7));
  const { expediente, cargando, error, hoy } = useExpedienteEmpleado(userId ?? null, anio, mes);

  const esHoy = diaSel === hoy;
  const puedeAvanzar = diaSel < hoy;
  const moverDia = (delta: number) => {
    const s = sumarDias(diaSel, delta);
    if (s <= hoy) { setDiaSel(s); setVerCalendario(false); }
  };

  const dia = useMemo<DiaExpediente>(() => {
    const d = expediente?.dias.get(diaSel);
    if (d) return d;
    return { fecha: diaSel, horas: 0, faltas: [], minutosPausaDeMas: 0, capturas: [], nota: { valor: null, banda: null, factores: [] } };
  }, [diaSel, expediente]);

  const nombre = expediente?.nombre || t("hr.noName");
  const c = dia.nota.banda ? TONO[dia.nota.banda] : null;
  const diaTexto = esHoy ? t("hr.exp.hoy") : format(new Date(diaSel + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es });

  // Celdas del mes para el calendario opcional (lunes primero).
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes - 1, 1).getDay();
    const offset = (primero + 6) % 7;
    const dias = new Date(anio, mes, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= dias; d++) out.push(`${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }, [anio, mes]);
  const mesTexto = useMemo(() => new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }), [anio, mes]);

  return (
    <Page>
      <PageHeader title={t("hr.exp.title")} subtitle={t("hr.exp.sub")} icon={<Gauge className="h-5 w-5" />} />

      {/* Identidad + nota + día + flechas */}
      <section className="vidrio sube mt-4 p-4 lg:p-5">
        <div className="v-cont">
          <div className="flex flex-wrap items-center gap-3">
            {expediente && <UserAvatar name={nombre} src={expediente.avatarUrl} seed={expediente.avatarSeed} size="md" />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold leading-tight tracking-tight">{nombre}</h2>
              {dia.nota.banda && (
                <span className={`mt-0.5 inline-flex items-center rounded-control px-1.5 py-0.5 text-[11px] font-semibold ${c?.chip}`}>
                  {dia.nota.valor} / 100
                </span>
              )}
            </div>
            {/* Navegación de día */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => moverDia(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground" aria-label={t("hr.exp.diaAnterior")}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize tabular-nums">{diaTexto}</span>
              <button onClick={() => moverDia(1)} disabled={!puedeAvanzar} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground disabled:opacity-40" aria-label={t("hr.exp.diaSiguiente")}>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setVerCalendario((v) => !v)} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${verCalendario ? "border-primary/50 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`} aria-label={t("hr.exp.calendario")}>
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Calendario opcional */}
          {verCalendario && (
            <div className="mt-4 rounded-2xl border border-border/40 bg-card/30 p-3">
              <p className="mb-2 text-center text-xs capitalize text-muted-foreground">{mesTexto}</p>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((f, i) => {
                  if (!f) return <div key={i} />;
                  const d = expediente?.dias.get(f);
                  const cc = d?.nota.banda ? TONO[d.nota.banda] : null;
                  const futuro = f > hoy;
                  const sel = f === diaSel;
                  return (
                    <button key={i} disabled={futuro} onClick={() => { setDiaSel(f); setVerCalendario(false); }}
                      className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition disabled:opacity-30
                        ${cc ? cc.bg : "border-border/30 bg-card/20"} ${sel ? "ring-2 ring-primary" : "hover:border-primary/40"}`}>
                      <span className={`tabular-nums ${f === hoy ? "font-bold text-primary" : "text-foreground/80"}`}>{Number(f.slice(8))}</span>
                      {d?.nota.valor != null && <span className={`text-[10px] font-bold tabular-nums ${cc?.tx}`}>{d.nota.valor}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats del día */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            <div className={`rounded-panel border p-2.5 text-center ${c ? c.bg : "border-border/40 bg-card/40"}`}>
              <div className={`font-display text-lg font-bold tabular-nums ${c?.tx ?? ""}`}>{dia.nota.valor ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.nota")}</div>
            </div>
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums">{dia.horas.toFixed(1)}h</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.horas")}</div>
            </div>
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums">{dia.faltas.length}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.faltas")}</div>
            </div>
            <div className="rounded-panel border border-border/40 bg-card/40 p-2.5 text-center">
              <div className="font-display text-lg font-bold tabular-nums">{Math.round(dia.minutosPausaDeMas)}m</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.exp.pausas")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* La tira de pantallazos del día (Hubstaff) */}
      <section className="vidrio sube mt-5 p-4 lg:p-5" style={{ animationDelay: "0.05s" }}>
        <div className="v-cont">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ScreenShare className="h-3.5 w-3.5" />{t("hr.exp.pantallazosDia")}
          </p>
          {error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.exp.error")}</p></div>
          ) : cargando ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <TiraDelDia capturas={dia.capturas} t={t} />
          )}

          {/* Faltas del día, si hay */}
          {dia.faltas.length > 0 && (
            <div className="mt-5 border-t border-border/40 pt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("hr.exp.faltas")}</p>
              <div className="flex flex-col gap-1.5">
                {dia.faltas.slice(0, 20).map((f) => {
                  const lbl = LABEL_FALTA[f.tipo as FaltaTipo];
                  return (
                    <div key={f.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/30 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive/80" />
                      <span className="min-w-0 flex-1 truncate text-xs">{lbl ? t(lbl) : f.tipo}{f.detalle ? ` · ${f.detalle}` : ""}</span>
                      {f.capturaPath && (
                        <button type="button" onClick={() => abrirPath(f.capturaPath!)} className="shrink-0 text-muted-foreground hover:text-primary" title={t("hr.exp.abrir")}><ImageIcon className="h-3.5 w-3.5" /></button>
                      )}
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{format(new Date(f.createdAt), "HH:mm")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
