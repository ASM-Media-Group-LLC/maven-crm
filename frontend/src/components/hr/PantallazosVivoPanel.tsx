import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MonitorPlay, Loader2, AlertTriangle, RefreshCw, LayoutGrid, Grid3x3, X, FileClock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCapturasVivo, type PersonaVivo } from "@/hooks/useCapturasVivo";
import { useSemaforos, PUNTO_SEM, type Semaforo } from "@/hooks/useSemaforos";
import { separar } from "@/components/hr/TarjetaArgos";

// LA MURALLA EN VIVO de Argos (modelo Hubstaff): las FOTOS de lo que pasa en los
// últimos minutos, con identidad propia de MURAL — NO es la lista de Conectados
// ahora (esa es el tablero de personal). Dos vistas, ambas con cuadritos (Álvaro):
//   · Muralla   — tarjetas grandes (pantalla + cámara + qué hace).
//   · Cuadrícula — celdas compactas, muchos de un vistazo.
// El mismo dato (useCapturasVivo), dos formas. La vista elegida se recuerda.

type Modo = "muralla" | "cuadricula";
const MODO_KEY = "argos.muralla.modo";

function leerModo(): Modo {
  // "lista" quedó retirada (era un clon de Conectados): cae a muralla.
  try { const m = localStorage.getItem(MODO_KEY); if (m === "muralla" || m === "cuadricula") return m; } catch { /* sin storage */ }
  return "muralla";
}

export function PantallazosVivoPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useCapturasVivo();
  const { semaforoDe } = useSemaforos();
  const [modo, setModo] = useState<Modo>(leerModo);
  // Filtro por empleado (Alvaro, 04/11): elige una persona y ves solo lo suyo.
  // Si el filtrado desaparece de la ventana, cae solo a "Todos".
  const [persona, setPersona] = useState<string>("todos");
  // Clic en una tarjeta = ver ESE pantallazo en grande (no ir al expediente).
  const [verPantallazo, setVerPantallazo] = useState<PersonaVivo | null>(null);
  const lista = persona !== "todos" && personas.some((p) => p.userId === persona)
    ? personas.filter((p) => p.userId === persona)
    : personas;

  const elegir = (m: Modo) => { setModo(m); try { localStorage.setItem(MODO_KEY, m); } catch { /* sin storage */ } };
  const irA = (userId: string) => navigate(`/hr/expediente/${userId}`, { state: { volverA: "/hr/monitor-ia?t=ahora" } });
  // El minuto exacto del pantallazo (no "ahora"): Argos captura cada ~2 min.
  const hace = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const vistas: Array<{ m: Modo; icon: typeof LayoutGrid; k: string }> = [
    { m: "muralla", icon: LayoutGrid, k: "hr.pantallazos.modo.muralla" },
    { m: "cuadricula", icon: Grid3x3, k: "hr.pantallazos.modo.cuadricula" },
  ];

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <MonitorPlay className="h-[18px] w-[18px]" />
            {personas.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.pantallazos.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {personas.length > 0 ? t("hr.pantallazos.contando", { n: personas.length }) : t("hr.pantallazos.sub")}
            </p>
          </div>
          {/* Filtro por empleado */}
          {personas.length > 0 && (
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              aria-label={t("hr.pantallazos.filtroPersona")}
              className="h-8 max-w-[10rem] rounded-lg border border-border/50 bg-background/40 px-2 text-xs text-foreground outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="todos">{t("hr.conectados.filtroTodos")}</option>
              {personas.map((p) => (
                <option key={p.userId} value={p.userId}>{p.nombre || t("hr.noName")}</option>
              ))}
            </select>
          )}
          {/* Selector de vista */}
          <div className="inline-flex gap-0.5 rounded-xl border border-border/50 bg-background/40 p-0.5">
            {vistas.map((v) => {
              const Icono = v.icon;
              return (
                <button
                  key={v.m}
                  type="button"
                  onClick={() => elegir(v.m)}
                  title={t(v.k as Parameters<typeof t>[0])}
                  aria-label={t(v.k as Parameters<typeof t>[0])}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${modo === v.m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icono className="h-4 w-4" />
                  <span className="hidden sm:inline">{t(v.k as Parameters<typeof t>[0])}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void refrescar()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            title={t("hr.pantallazos.reintentar")}
            aria-label={t("hr.pantallazos.reintentar")}
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.pantallazos.error")}</p>
          </div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MonitorPlay className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.pantallazos.vacio")}</p>
          </div>
        ) : modo === "muralla" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lista.map((p) => <CardMuralla key={p.userId} p={p} t={t} hace={hace} sem={semaforoDe(p.userId, p.fueraDeLugar, p.veredicto, p.tienePantalla)} onClick={() => setVerPantallazo(p)} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {lista.map((p) => <CeldaCuadricula key={p.userId} p={p} t={t} sem={semaforoDe(p.userId, p.fueraDeLugar, p.veredicto, p.tienePantalla)} onClick={() => setVerPantallazo(p)} />)}
          </div>
        )}
      </div>

      {verPantallazo && (
        <VisorVivo
          p={verPantallazo}
          t={t}
          hace={hace}
          onClose={() => setVerPantallazo(null)}
          onExpediente={() => { const id = verPantallazo.userId; setVerPantallazo(null); irA(id); }}
        />
      )}
    </section>
  );
}

// Visor del pantallazo en vivo (Alvaro, 05/11): clic en una tarjeta abre ESE
// pantallazo en grande (pantalla + cámara + qué hace), con botón al expediente.
function VisorVivo({ p, t, hace, onClose, onExpediente }: {
  p: PersonaVivo; t: Tr; hace: (iso: string) => string; onClose: () => void; onExpediente: () => void;
}) {
  const nombre = p.nombre || t("hr.noName");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <DialogTitle className="sr-only">{nombre}</DialogTitle>
        <div className="relative aspect-[16/10] w-full bg-muted/40">
          {p.pantallaUrl ? (
            <img src={p.pantallaUrl} alt={nombre} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          )}
          {p.camaraUrl && (
            <img src={p.camaraUrl} alt={nombre} className="absolute bottom-2 right-2 h-24 w-32 rounded-lg border-2 border-background/80 object-cover shadow-lg" />
          )}
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{nombre}</div>
            <div className="truncate text-xs text-muted-foreground">{hace(p.ultima)} · {p.veredicto || t("hr.pantallazos.analizando")}</div>
          </div>
          <button type="button" onClick={onExpediente} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20">
            <FileClock className="h-3.5 w-3.5" />{t("hr.pantallazos.verExpedienteBtn")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Tr = ReturnType<typeof useLanguage>["t"];

// El mensaje corto de estado por color de semáforo (el "sí o no" en palabras).
const MSG_SEM: Record<Semaforo, string> = {
  verde: "hr.sem.msg.verde", amarillo: "hr.sem.msg.amarillo", naranja: "hr.sem.msg.naranja", rojo: "hr.sem.msg.rojo", gris: "hr.sem.msg.gris",
};
// Borde y color de texto por semáforo, para las tarjetas. Sin el verde prendido
// (Alvaro, 12/11/2026): bordes neutros (solo lo malo con un filo de color fino)
// y el mensaje en gris; el color queda en el puntito.
const BORDE_SEM: Record<Semaforo, string> = {
  verde: "border-border/40 hover:border-foreground/25",
  amarillo: "border-warning/40 hover:border-warning/70",
  naranja: "border-warning/40 hover:border-warning/70",
  rojo: "border-destructive/50 hover:border-destructive/80",
  gris: "border-border/40 hover:border-foreground/25",
};

// EL SELLO del estado, uno solo (Alvaro, 12/11/2026: «lo que sale en rojo sí
// podría ser un poco más llamativo»). Lo MALO (no está en lo suyo, o Argos vio
// algo que no es trabajo) va en placa ROJA sólida con su ícono: se ve de lejos.
// Lo demás, en vidrio oscuro con un puntito del color del semáforo.
function SelloEstado({ p, t, sem, chico }: { p: PersonaVivo; t: Tr; sem: Semaforo; chico?: boolean }) {
  const malo = sem === "rojo" || p.fueraDeLugar === true;
  const tam = chico ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[11px]";
  if (malo) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-destructive font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] ${tam}`}>
        <AlertTriangle className={chico ? "h-2.5 w-2.5" : "h-3 w-3"} />{t(MSG_SEM.rojo as Parameters<typeof t>[0])}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/55 font-medium text-white ring-1 ring-white/10 backdrop-blur-md ${tam}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_SEM[sem]}`} aria-hidden />{t(MSG_SEM[sem] as Parameters<typeof t>[0])}
    </span>
  );
}

// ── Vista MURALLA (12–13/11/2026: «cada cuadrito no se mira estético», y luego
// «no tan chiquitas: como antes, pero con mejor diseño»). La tarjeta GRANDE de
// siempre —foto arriba, texto abajo— con orden: la foto con sombreo suave, el
// estado arriba a la izquierda (rojo sólido si algo anda mal) y la cámara abajo
// a la derecha; debajo, la persona y la hora, el estado en una línea y lo que vio
// Argos (la app en una pastilla y la frase). Lo malo: filo rojo y estado en rojo.
function CardMuralla({ p, t, hace, sem, onClick }: { p: PersonaVivo; t: Tr; hace: (iso: string) => string; sem: Semaforo; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  const malo = sem === "rojo" || p.fueraDeLugar === true;
  const { app, que } = separar(p.veredicto);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${nombre}${p.veredicto ? ` · ${p.veredicto}` : ""}`}
      className={`group relative flex w-full flex-col overflow-hidden rounded-[14px] border bg-background/60 text-left shadow-[0_1px_2px_rgba(0,0,0,0.10),0_12px_28px_-16px_rgba(0,0,0,0.55)] transition-colors ${malo ? "border-destructive ring-1 ring-destructive/50" : "border-border/50 hover:border-foreground/25"}`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
        {p.principalUrl ? (
          <img src={p.principalUrl} alt={nombre} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {/* Sombreo suave: la pantalla se ve, pero no grita. */}
        <div className="pointer-events-none absolute inset-0 bg-black/20 transition-opacity duration-300 group-hover:opacity-0" aria-hidden />
        <span className="absolute left-2 top-2"><SelloEstado p={p} t={t} sem={sem} /></span>
        {p.camaraUrl && p.tienePantalla && (
          <img src={p.camaraUrl} alt="" loading="lazy" className="absolute bottom-2 right-2 h-14 w-20 rounded-[8px] border border-white/40 object-cover shadow-md" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3.5 pt-3">
        {/* La persona y la hora. */}
        <div className="flex items-center gap-2.5">
          <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-foreground">{nombre}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{hace(p.ultima)}</span>
        </div>
        {/* El estado, en una línea: rojo si algo anda mal; si no, gris con su puntito. */}
        <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${malo ? "text-destructive" : "text-muted-foreground"}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${malo ? "bg-destructive" : PUNTO_SEM[sem]}`} aria-hidden />
          {t((malo ? MSG_SEM.rojo : MSG_SEM[sem]) as Parameters<typeof t>[0])}
        </p>
        {/* Lo que vio Argos: la app en su pastilla y la frase. */}
        <div className="flex flex-col items-start gap-1.5">
          {app && (
            <span className="max-w-full truncate rounded-full border border-border/60 bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-foreground/80">{app}</span>
          )}
          <p className="line-clamp-3 text-[13px] leading-snug text-foreground/70">{que || p.veredicto || t("hr.pantallazos.analizando")}</p>
        </div>
      </div>
    </button>
  );
}

// ── Vista CUADRÍCULA: celda compacta (con punto de semáforo y análisis en hover) ──
function CeldaCuadricula({ p, t, sem, onClick }: { p: PersonaVivo; t: Tr; sem: Semaforo; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${nombre} · ${t(MSG_SEM[sem] as Parameters<typeof t>[0])}${p.veredicto ? ` · ${p.veredicto}` : ""}`}
      className={`group relative block w-full overflow-hidden rounded-xl border bg-background/60 text-left transition-colors ${sem === "rojo" || p.fueraDeLugar === true ? "border-destructive ring-1 ring-destructive/50" : BORDE_SEM[sem]}`}
    >
      <div className="relative aspect-[16/10] w-full bg-muted/40">
        {p.principalUrl ? (
          <img src={p.principalUrl} alt={nombre} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        )}
        {p.camaraUrl && p.tienePantalla && (
          <img src={p.camaraUrl} alt="" loading="lazy" className="absolute bottom-1 right-1 h-8 w-12 rounded border border-background/80 object-cover shadow" />
        )}
        {/* El estado, el mismo sello que la muralla (rojo sólido si algo anda mal). */}
        <span className="absolute left-1 top-1"><SelloEstado p={p} t={t} sem={sem} chico /></span>
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-semibold text-white">{nombre}</span>
      </div>
    </button>
  );
}
