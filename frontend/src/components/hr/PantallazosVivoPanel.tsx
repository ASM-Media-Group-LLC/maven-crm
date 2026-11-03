import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MonitorPlay, Loader2, AlertTriangle, ScreenShare, RefreshCw, Sparkles, LayoutGrid, Grid3x3 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo, type PersonaVivo } from "@/hooks/useCapturasVivo";
import { useSemaforos, PUNTO_SEM, type Semaforo } from "@/hooks/useSemaforos";

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

  const elegir = (m: Modo) => { setModo(m); try { localStorage.setItem(MODO_KEY, m); } catch { /* sin storage */ } };
  const irA = (userId: string) => navigate(`/hr/expediente/${userId}`, { state: { volverA: "/hr/monitor-ia?t=envivo" } });
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
            {personas.map((p) => <CardMuralla key={p.userId} p={p} t={t} hace={hace} sem={semaforoDe(p.userId, p.fueraDeLugar, p.veredicto, p.tienePantalla)} onClick={() => irA(p.userId)} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {personas.map((p) => <CeldaCuadricula key={p.userId} p={p} t={t} sem={semaforoDe(p.userId, p.fueraDeLugar, p.veredicto, p.tienePantalla)} onClick={() => irA(p.userId)} />)}
          </div>
        )}
      </div>
    </section>
  );
}

type Tr = ReturnType<typeof useLanguage>["t"];

// El mensaje corto de estado por color de semáforo (el "sí o no" en palabras).
const MSG_SEM: Record<Semaforo, string> = {
  verde: "hr.sem.msg.verde", amarillo: "hr.sem.msg.amarillo", naranja: "hr.sem.msg.naranja", rojo: "hr.sem.msg.rojo", gris: "hr.sem.msg.gris",
};
// Borde y color de texto por semáforo, para las tarjetas.
const BORDE_SEM: Record<Semaforo, string> = {
  verde: "border-border/40 hover:border-primary/60",
  amarillo: "border-warning/50 hover:border-warning",
  naranja: "border-orange-500/50 hover:border-orange-500",
  rojo: "border-destructive/60 hover:border-destructive",
  gris: "border-border/40 hover:border-primary/60",
};
const TEXTO_SEM: Record<Semaforo, string> = {
  verde: "text-success", amarillo: "text-warning", naranja: "text-orange-500", rojo: "text-destructive", gris: "text-muted-foreground",
};

// ── Vista MURALLA: tarjeta grande (foto + semáforo + mensaje + análisis) ──
function CardMuralla({ p, t, hace, sem, onClick }: { p: PersonaVivo; t: Tr; hace: (iso: string) => string; sem: Semaforo; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("hr.pantallazos.verExpediente", { nombre })}
      className={`group relative block w-full overflow-hidden rounded-2xl border bg-card/30 text-left transition-colors ${BORDE_SEM[sem]}`}
    >
      <div className="relative aspect-[16/10] w-full bg-muted/40">
        {p.principalUrl ? (
          <img src={p.principalUrl} alt={nombre} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {p.tienePantalla && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <ScreenShare className="h-3 w-3" />{t("hr.pantallazos.pantalla")}
          </span>
        )}
        {p.fueraDeLugar && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
            <AlertTriangle className="h-3 w-3" />{t("hr.pantallazos.fueraDeLugar")}
          </span>
        )}
        {p.camaraUrl && p.tienePantalla && (
          <img src={p.camaraUrl} alt={nombre} loading="lazy" className="absolute bottom-1.5 right-1.5 h-14 w-20 rounded-lg border-2 border-background/80 object-cover shadow-md" />
        )}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* El semáforo también en el pantallazo: el sí-o-no en color */}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO_SEM[sem]}`} />
        <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombre}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{hace(p.ultima)}</span>
      </div>
      {/* El MENSAJE (estado en palabras) + el ANÁLISIS de la IA */}
      <div className="border-t border-border/40 px-2.5 py-2 text-muted-foreground">
        <p className={`text-[11px] font-bold uppercase tracking-wide ${TEXTO_SEM[sem]}`}>
          {t(MSG_SEM[sem] as Parameters<typeof t>[0])}
        </p>
        <p className="mt-0.5 flex items-start gap-1.5 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 leading-snug">{p.veredicto || t("hr.pantallazos.analizando")}</span>
        </p>
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
      className={`group relative block w-full overflow-hidden rounded-xl border bg-card/30 text-left transition-colors ${BORDE_SEM[sem]}`}
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
        {/* El semáforo en la esquina */}
        <span className={`absolute left-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-black/40 ${PUNTO_SEM[sem]}`} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-semibold text-white">{nombre}</span>
      </div>
    </button>
  );
}
