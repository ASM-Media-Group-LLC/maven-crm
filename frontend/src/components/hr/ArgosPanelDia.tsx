import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Loader2, AlertTriangle, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, Camera, ScreenShare, Clock, CalendarDays } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useResumenDia, type PersonaResumen, type BajonDia } from "@/hooks/useResumenDia";
import { ArgosTendencia } from "@/components/hr/ArgosTendencia";
import { useTendenciaMes } from "@/hooks/useTendenciaMes";
import type { TranslationKey } from "@/lib/i18n";

// PANEL DEL DÍA — la PORTADA de Argos (Alvaro, 03/11). Responde de un vistazo:
// cómo estuvo HOY cada persona. No compite con el Centro de operaciones (ese mide
// PRODUCCIÓN del equipo: horas, mensajes, respuesta); este mide DISCIPLINA por
// PERSONA: cámara, pantalla, atención, problemas. Arriba los números de hoy; luego
// el podio (mejores / ojo con) por MENOS fallas; abajo el equipo completo, clic →
// su día. Estilo sobrio, poco color (un acento puntual). Todo por t().

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const LBL_BAJON: Record<string, TranslationKey> = {
  sin_pantalla: "hr.sem.sinPantalla",
  camara_apagada: "hr.resumen.bajon.camara",
  camara_tapada: "hr.resumen.bajon.camara",
  fuera_de_lugar: "hr.sem.problema",
  se_fue: "hr.resumen.bajon.seFue",
  sin_senal: "hr.resumen.bajon.sinSenal",
  pausa_de_mas: "hr.resumen.bajon.pausa",
};

const prom = (arr: number[]): number | null =>
  arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

// Sumar/restar días a una fecha YYYY-MM-DD (para ‹ ayer / hoy ›).
function sumarDias(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

const fallasDe = (p: PersonaResumen) => ({
  veces: p.bajones.length,
  min: p.bajones.reduce((a, b) => a + b.minutos, 0),
});

// La falla principal (más minutos) para el renglón del equipo. "Sin señal" NO
// cuenta (es fallo del rastreo, no del empleado; Alvaro 05/11).
const fallaPrincipal = (bajones: BajonDia[]): BajonDia | null => {
  const reales = bajones.filter((b) => b.tipo !== "sin_senal");
  return reales.length ? [...reales].sort((a, b) => b.minutos - a.minutos)[0] : null;
};

// Un número grande del día (tile sobrio): etiqueta, cifra y una línea chica.
// `malo` pone la cifra en ROJO (problema que salta). `flojo` marca en ÁMBAR que
// el número NO es de fiar todavía (muestra chica o sin medir) — el "chequeo"
// que pidió Alvaro: nunca mostrar un 100% como si fuera verdad probada.
function Tile({ icon: Icon, label, valor, sub, malo, flojo }: { icon: typeof Camera; label: string; valor: string; sub?: string; malo?: boolean; flojo?: boolean }) {
  // Lenguaje glassy del resto de Maven (Alvaro, 08/11: "el rojo se ve de la
  // verga"). En vez de un cajón con borde rojo plano, tarjeta de vidrio con glow
  // SUTIL: rojo si hay problema, ámbar si el dato no es de fiar, azul normal.
  const glow = malo ? "glow-r" : flojo ? "glow-a" : "glow-b";
  return (
    <div className={`vidrio vidrio-glow ${glow} p-4`}>
      <div className="v-cont flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={`h-4 w-4 shrink-0 ${malo ? "text-destructive/80" : flojo ? "text-warning/80" : ""}`} />
          <span className="truncate text-xs">{label}</span>
        </div>
        <div className={`font-display text-2xl font-bold leading-none tabular-nums ${malo ? "text-destructive" : flojo ? "text-warning" : ""}`}>{valor}</div>
        {sub && (
          <div className={`flex items-center gap-1 text-[11px] ${flojo ? "text-warning/90" : "text-muted-foreground"}`}>
            {flojo && <AlertTriangle className="h-3 w-3 shrink-0" />}
            <span className="truncate">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// El semáforo de una persona (de la banda de su nota): color del borde y texto.
const SEMAFORO: Record<string, { barra: string; texto: string; punto: string }> = {
  bien: { barra: "border-l-success/70", texto: "text-success", punto: "bg-success" },
  ojo: { barra: "border-l-warning/70", texto: "text-warning", punto: "bg-warning" },
  mal: { barra: "border-l-destructive/80", texto: "text-destructive", punto: "bg-destructive" },
  sin: { barra: "border-l-border", texto: "text-muted-foreground", punto: "bg-muted-foreground/40" },
};

// Un factor de la nota (Pantalla/Cámara/Atención/Horas) para explicar el porqué.
// Pantalla baja va en ROJO: es el problema #1 que Alvaro quiere ver marcado.
function FactorChip({ label, sub, alerta }: { label: string; sub: number | null; alerta?: boolean }) {
  const bajo = alerta && sub != null && sub < 50;
  return (
    <span className={`text-[11px] ${bajo ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
      {label} <span className="tabular-nums">{sub == null ? "—" : `${Math.round(sub)}%`}</span>
    </span>
  );
}

// Una persona del podio: puesto, cara, nombre y su resumen de fallas.
// Un renglón del equipo: SEMÁFORO (barra de color = su banda, los rojos saltan),
// cara, nombre, la falla principal, la nota 0–100 EXPLICADA (sus 4 factores) y el
// puntaje. Pantalla baja marcada en rojo (el problema #1 que Alvaro quiere ver).
function EquipoFila({ p, t, onClick }: { p: PersonaResumen; t: Tr; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  const fp = fallaPrincipal(p.bajones);
  const abierto = p.bajones.some((b) => b.abierto);
  const sem = SEMAFORO[p.nota.banda ?? "sin"];
  const factor = (clave: string) => p.nota.factores.find((f) => f.clave === clave)?.sub ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("hr.atencion.verExpediente")}
      className={`group flex w-full items-center gap-3 rounded-2xl border border-l-4 border-border/40 ${sem.barra} bg-card/20 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-card/40`}
    >
      <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{nombre}</span>
          {fp && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${abierto ? "bg-destructive animate-pulse" : "bg-muted-foreground/40"}`} />
              {LBL_BAJON[fp.tipo] ? t(LBL_BAJON[fp.tipo]) : fp.tipo}
              {p.bajones.length > 1 && <span className="text-muted-foreground/70">+{p.bajones.length - 1}</span>}
            </span>
          )}
        </div>
        {/* La nota EXPLICADA: los 3 factores + CONECTADO (el chequeo de Alvaro:
            '0% pantalla con 4h' = trabajó sin compartir; '0% con 0h' = ni se
            conectó). Pantalla baja en rojo. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${p.activo ? "text-foreground/75" : "text-muted-foreground/60"}`}>
            <Clock className="h-3 w-3 shrink-0" />
            {!p.activo ? t("hr.panel.noConecto") : p.horas >= 0.05 ? t("hr.panel.conectadoH", { h: p.horas.toFixed(1) }) : t("hr.panel.activoSinHoras")}
          </span>
          <FactorChip label={t("hr.resumen.pantalla")} sub={factor("pantalla")} alerta />
          <FactorChip label={t("hr.resumen.camara")} sub={factor("camara")} />
          <FactorChip label={t("hr.resumen.atencion")} sub={factor("atencion")} />
        </div>
      </div>
      <span className={`shrink-0 font-display text-lg font-bold tabular-nums ${sem.texto}`}>{p.nota.valor ?? "—"}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

// Una CAJA del equipo por estado (Mal / Ojo / Bien / Sin datos): cabecera con
// su color y conteo, colapsable. Mal y Ojo abren por defecto; Bien y Sin datos
// vienen cerradas, para que el Panel no se vea "todo abierto" (Alvaro, 04/11).
function CajaEquipo({ titulo, punto, gente, abierta, t, onPersona }: {
  titulo: string; punto: string; gente: PersonaResumen[]; abierta: boolean; t: Tr; onPersona: (id: string) => void;
}) {
  const [open, setOpen] = useState(abierta);
  if (gente.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/40 bg-card/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${punto}`} />
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs tabular-nums text-muted-foreground">· {gente.length}</span>
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {gente.map((p) => <EquipoFila key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} />)}
        </div>
      )}
    </div>
  );
}

export function ArgosPanelDia({ sinTendencia = false }: { sinTendencia?: boolean } = {}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // El Panel ya no es solo HOY (Alvaro, 04/11): se puede ver cualquier día pasado
  // con ‹ ayer / hoy ›. El día vive acá y se le pasa a useResumenDia (el RPC ya
  // recibe fecha). No se puede avanzar más allá de hoy.
  const hoy = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  const [dia, setDia] = useState(hoy);
  const [verCalendario, setVerCalendario] = useState(false);
  const esHoy = dia === hoy;
  const moverDia = (delta: number) => {
    const s = sumarDias(dia, delta);
    if (s <= hoy) { setDia(s); setVerCalendario(false); }
  };
  const { personas, cargando, error, refrescar } = useResumenDia(dia);

  // Celdas del mes del día elegido, para el calendario (lunes primero), igual
  // que el Expediente — así se puede saltar a cualquier fecha pasada.
  const anio = Number(dia.slice(0, 4));
  const mes = Number(dia.slice(5, 7));
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes - 1, 1).getDay();
    const offset = (primero + 6) % 7;
    const totalDias = new Date(anio, mes, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let dd = 1; dd <= totalDias; dd++) out.push(`${anio}-${String(mes).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
    return out;
  }, [anio, mes]);
  const mesTexto = useMemo(() => new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }), [anio, mes]);
  // Dato por día del mes (para pintar el calendario: qué días hay info y cómo
  // estuvo la pantalla del equipo). Solo cuando el calendario está abierto.
  const { porDia } = useTendenciaMes(anio, mes, hoy);

  const d = useMemo(() => {
    // Solo quien tuvo actividad hoy (horas, nota o alguna falla) entra al podio
    // y a los promedios; quien no se conectó no es "el mejor" por 0 fallas.
    const activos = personas.filter((p) => p.horas > 0 || p.bajones.length > 0 || p.nota.valor != null);
    const atencion = prom(personas.map((p) => p.atencionPct).filter((x): x is number => x != null));
    const juzgadasTotal = personas.reduce((a, p) => a + p.juzgadas, 0);
    const camaraVals = personas.map((p) => p.camaraPct).filter((x): x is number => x != null);
    const camara = prom(camaraVals);
    const camaraMedidos = camaraVals.length;
    const pantalla = prom(personas.map((p) => p.pantallaPct).filter((x): x is number => x != null));
    const enProblema = personas.filter((p) => p.bajones.some((b) => b.abierto) || (p.nota.valor != null && p.nota.valor < 60)).length;
    // Menos fallas primero (minutos, luego veces). Para "ojo con", al revés.
    const porFallas = [...activos].sort((a, b) => {
      const fa = fallasDe(a), fb = fallasDe(b);
      return (fa.min - fb.min) || (fa.veces - fb.veces);
    });
    // Equipo en CAJAS por estado (semáforo), para no verlo "todo abierto".
    const caja = (b: string | null) => personas.filter((p) => (p.nota.banda ?? "sin") === b);
    return {
      total: personas.length,
      atencion, camara, camaraMedidos, pantalla, enProblema, juzgadasTotal,
      mejores: porFallas.slice(0, 3),
      peores: [...porFallas].reverse().slice(0, 3),
      mal: caja("mal"), ojo: caja("ojo"), bien: caja("bien"), sin: caja("sin"),
    };
  }, [personas]);

  const irA = (id: string) => navigate(`/hr/expediente/${id}`, { state: { volverA: "/hr/monitor-ia?t=dia" } });
  const diaTxt = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont space-y-5">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <LayoutDashboard className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.panel.title")}</h2>
            {/* Navegación de día: ‹ ayer / hoy › (no se puede pasar de hoy). */}
            <div className="mt-0.5 flex items-center gap-1">
              <button type="button" onClick={() => moverDia(-1)} aria-label={t("hr.exp.diaAnterior")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[8.5rem] text-center text-xs capitalize text-muted-foreground">{esHoy ? `${t("hr.panel.hoy")} · ` : ""}{diaTxt}</span>
              <button type="button" onClick={() => moverDia(1)} disabled={esHoy} aria-label={t("hr.exp.diaSiguiente")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setVerCalendario((v) => !v)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${verCalendario ? "border-primary/50 text-primary" : "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`} title={t("hr.exp.calendario")} aria-label={t("hr.exp.calendario")}>
            <CalendarDays className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void refrescar()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" title={t("hr.pantallazos.reintentar")} aria-label={t("hr.pantallazos.reintentar")}>
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Calendario opcional: saltar a cualquier día pasado. Compacto (no ocupa
            toda la pantalla) y cada día con DATO: un punto verde/ámbar/rojo según
            cómo estuvo la pantalla del equipo; los días sin info van apagados. */}
        {verCalendario && (
          <div className="mx-auto w-full max-w-[26rem] rounded-2xl border border-border/40 bg-card/30 p-3">
            <p className="mb-2 text-center text-xs capitalize text-muted-foreground">{mesTexto}</p>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
              {["L", "M", "M", "J", "V", "S", "D"].map((dl, i) => <div key={i}>{dl}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((f, i) => {
                if (!f) return <div key={i} />;
                const futuro = f > hoy;
                const sel = f === dia;
                const info = porDia.get(f);
                const hayDato = !!info && info.personas > 0;
                const banda = !info || info.pantalla == null ? null
                  : info.pantalla >= 70 ? "bg-success" : info.pantalla >= 50 ? "bg-warning" : "bg-destructive";
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={futuro}
                    onClick={() => { setDia(f); setVerCalendario(false); }}
                    title={hayDato ? t("hr.panel.calDiaInfo", { p: info!.pantalla ?? 0, n: info!.personas }) : undefined}
                    className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs tabular-nums transition disabled:opacity-25
                      ${sel ? "border-primary bg-primary/15 ring-1 ring-primary"
                        : hayDato ? "border-border/40 bg-card/40 hover:border-primary/40"
                        : "border-border/20 bg-transparent hover:border-primary/30"}`}
                  >
                    <span className={sel ? "text-primary" : f === hoy ? "font-bold text-primary" : hayDato ? "text-foreground/85" : "text-muted-foreground/50"}>{Number(f.slice(8))}</span>
                    {banda && <span className={`h-1 w-1 rounded-full ${banda}`} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Gráfica de tendencia (últimos 14 días). Se oculta cuando va debajo del
            Historial en "El día" para no duplicar gráfica (Alvaro, 08/11). */}
        {!sinTendencia && <ArgosTendencia />}

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.panel.error")}</p></div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><LayoutDashboard className="h-7 w-7 opacity-40" /><p className="text-sm">{t("hr.panel.vacio")}</p></div>
        ) : (
          <>
            {/* Números de DISCIPLINA del día — 3 claros (Alvaro, 08/11: se quitó el
                de "atención" porque la IA aún no juzga y quedaba siempre en "—").
                Sin podio: estorbaba. Lo importante es quién está mal, abajo. */}
            <div className="grid grid-cols-3 gap-3">
              <Tile icon={Camera} label={t("hr.panel.numCamara")} valor={d.camara == null ? "—" : `${d.camara}%`} sub={d.camaraMedidos > 0 ? t("hr.panel.camaraSobre", { n: d.camaraMedidos }) : t("hr.panel.camaraNadie")} flojo={d.camaraMedidos > 0 && d.camaraMedidos < 3} />
              <Tile icon={ScreenShare} label={t("hr.panel.numPantalla")} valor={d.pantalla == null ? "—" : `${d.pantalla}%`} sub={t("hr.panel.promDe")} malo={d.pantalla != null && d.pantalla < 50} />
              <Tile icon={AlertTriangle} label={t("hr.panel.numProblema")} valor={`${d.enProblema}`} sub={t("hr.panel.numProblemaSub", { n: d.total })} malo={d.enProblema > 0} />
            </div>

            {/* El equipo EN CAJAS por estado — lo accionable: quién está mal.
                Clic en alguien abre su día. */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("hr.panel.equipoTitulo")} · {d.total}</p>
              <CajaEquipo titulo={t("hr.panel.cajaMal")} punto="bg-destructive" gente={d.mal} abierta={false} t={t} onPersona={irA} />
              <CajaEquipo titulo={t("hr.panel.cajaOjo")} punto="bg-warning" gente={d.ojo} abierta={false} t={t} onPersona={irA} />
              <CajaEquipo titulo={t("hr.panel.cajaBien")} punto="bg-success" gente={d.bien} abierta={false} t={t} onPersona={irA} />
              <CajaEquipo titulo={t("hr.panel.cajaSin")} punto="bg-muted-foreground/40" gente={d.sin} abierta={false} t={t} onPersona={irA} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
