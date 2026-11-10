import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Building2, CheckCircle2, ExternalLink, Info, Loader2, Maximize2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import type { TranslationKey } from "@/lib/i18n";

// VIRTUAL OFFICE (Alvaro, 05/11, v2 con muñequitos en escena isométrica).
// Edificio de 6 pisos (uno por departamento). El área central es una ESCENA:
// escritorios 3D con monitor y muñequito SVG sentado atrás; glow del escritorio
// según estado; chip ERROR flotando en los que tienen problema; clic → ficha.
// Esta es la v1 de los muñequitos (SVG simples): cuando aprobemos el pack real
// (Kenney o similar) se reemplazan sin tocar la escena.

type EstadoAgente = "trabajando" | "esperando" | "error" | "offline";

interface AgenteDemo {
  id: string;
  nombre: string;
  rol: string;
  estado: EstadoAgente;
  tarea: string | null;
  hechas: number;
  errores: number;
  exito: number;
  depto: string;
  seed: number; // semilla para variar colores del sprite
}

interface Piso {
  numero: number;
  slug: string;
  agentes: AgenteDemo[];
}

// Datos DEMO hasta conectar Paperclip.
// Orden del edificio (Alvaro 05/11): Chatters en la PLANTA BAJA; de ahí para
// arriba: Editores, PR, Finanzas, Operaciones, y el ADMIN (dueño/admin/manager)
// en el último piso. No va Closers.
const DEMO: Piso[] = [
  { numero: 6, slug: "admin",
    agentes: [
      { id: "admin-owner", nombre: "Owner Agent", rol: "Dueño", estado: "trabajando", tarea: "Revisando panel ejecutivo", hechas: 24, errores: 0, exito: 100, depto: "Admin", seed: 2 },
      { id: "admin-admin", nombre: "Admin Agent", rol: "Administración", estado: "trabajando", tarea: "Auditando permisos", hechas: 18, errores: 0, exito: 100, depto: "Admin", seed: 4 },
      { id: "admin-mgr", nombre: "Manager Agent", rol: "Manager", estado: "esperando", tarea: null, hechas: 12, errores: 0, exito: 100, depto: "Admin", seed: 6 },
    ],
  },
  { numero: 5, slug: "operaciones",
    agentes: [{ id: "op-1", nombre: "Ops Agent #1", rol: "Coordina el flujo de trabajo", estado: "trabajando", tarea: "Ruteando tareas del día", hechas: 86, errores: 1, exito: 99, depto: "Operaciones", seed: 31 }],
  },
  { numero: 4, slug: "finanzas",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `fi-${i + 1}`, nombre: `Finance Agent #${i + 1}`, rol: "Concilia pagos y payouts", estado: "trabajando",
      tarea: "Conciliando payout de Luciana", hechas: 8 + i, errores: 0, exito: 100, depto: "Finanzas", seed: i + 29,
    })),
  },
  { numero: 3, slug: "pr",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `pr-${i + 1}`, nombre: `PR Agent #${i + 1}`, rol: "Agenda contenido con creadoras", estado: "trabajando",
      tarea: `Programando feed del mes`, hechas: 28 + i * 4, errores: 0, exito: 100, depto: "PR", seed: i + 11,
    })),
  },
  { numero: 2, slug: "editores",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `ed-${i + 1}`, nombre: `Editor Agent #${i + 1}`, rol: "Corta y limpia videos", estado: i === 2 ? "esperando" : "trabajando",
      tarea: i === 2 ? null : "Cortando entrega #" + (300 + i), hechas: 12 + i * 2, errores: 0, exito: 100, depto: "Editores", seed: i + 19,
    })),
  },
  {
    numero: 1, slug: "chatters",
    agentes: Array.from({ length: 11 }, (_, i): AgenteDemo => ({
      id: `chatter-${i + 1}`,
      nombre: `Chatter Agent #${i + 1}`,
      rol: "Responde consultas en Messenger",
      estado: i === 5 ? "error" : i === 3 || i === 8 ? "esperando" : i === 9 ? "offline" : "trabajando",
      tarea: i === 5 ? "Error: token expirado al procesar tarea #4802" : i === 3 || i === 8 ? null : `Respondiendo a cliente #${4810 + i}`,
      hechas: 80 + (i * 17) % 90,
      errores: (i * 3) % 7,
      exito: 90 + (i * 3) % 10,
      depto: "Chatters",
      seed: i + 7,
    })),
  },
];

const EST_UI: Record<EstadoAgente, { punto: string; anillo: string; texto: string; lbl: TranslationKey; monitor: string; halo: string }> = {
  trabajando: { punto: "bg-success", anillo: "ring-success/40", texto: "text-success", lbl: "dashboard.virtualOffice.trabajando",
    monitor: "#49e3a6", halo: "rgba(73,227,166,.35)" },
  esperando: { punto: "bg-warning", anillo: "ring-warning/40", texto: "text-warning", lbl: "dashboard.virtualOffice.esperando",
    monitor: "#ffb36b", halo: "rgba(255,179,107,.35)" },
  error: { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive", lbl: "dashboard.virtualOffice.error",
    monitor: "#f05a6e", halo: "rgba(240,90,110,.45)" },
  offline: { punto: "bg-muted-foreground/30", anillo: "ring-transparent", texto: "text-muted-foreground", lbl: "dashboard.virtualOffice.offline",
    monitor: "#2a3150", halo: "transparent" },
};

const PIEL = ["#f3cfa3", "#d9a070", "#a26c40", "#f3e3cc", "#8a5a3a", "#c18a5a"];
const PELO = ["#2a1810", "#4a3020", "#c9803f", "#8b4513", "#ddbf67", "#704214", "#1a1a1a", "#6b3410"];
const ROPA = ["#6d5efc", "#4ea2ff", "#49e3a6", "#ff8e4b", "#f05a6e", "#a78bfa", "#38bdf8", "#fbbf24", "#ec4899"];

/** Muñequito SVG sentado atrás del escritorio. Colores por semilla; animación por estado. */
function Munequito({ seed, estado }: { seed: number; estado: EstadoAgente }) {
  const piel = PIEL[seed % PIEL.length];
  const pelo = PELO[(seed * 3 + 1) % PELO.length];
  const ropa = ROPA[(seed * 7 + 2) % ROPA.length];
  const anim = estado === "trabajando" ? "teclea" : estado === "esperando" ? "respira" : estado === "error" ? "sacude" : "";
  return (
    <svg viewBox="0 0 48 44" width="100%" height="100%" shapeRendering="crispEdges" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`sh-${seed}`} cx="0.5" cy="0.5"><stop offset="0%" stopColor="#000" stopOpacity="0.35" /><stop offset="100%" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="24" cy="41" rx="14" ry="2.5" fill={`url(#sh-${seed})`} />
      <g className={anim}>
        <rect x="14" y="20" width="20" height="18" rx="2" fill={ropa} stroke="#0a0d18" strokeWidth="1" />
        <rect x="12" y="22" width="2" height="10" fill={ropa} stroke="#0a0d18" strokeWidth="0.8" />
        <rect x="34" y="22" width="2" height="10" fill={ropa} stroke="#0a0d18" strokeWidth="0.8" />
        <g className={estado === "trabajando" ? "brazos" : ""} style={{ transformOrigin: "24px 30px" }}>
          <rect x="10" y="30" width="6" height="3" rx="1.5" fill={piel} stroke="#0a0d18" strokeWidth="0.8" />
          <rect x="32" y="30" width="6" height="3" rx="1.5" fill={piel} stroke="#0a0d18" strokeWidth="0.8" />
        </g>
        <rect x="21" y="17" width="6" height="4" fill={piel} stroke="#0a0d18" strokeWidth="0.8" />
        <rect x="16" y="6" width="16" height="13" rx="3" fill={piel} stroke="#0a0d18" strokeWidth="1" />
        <path d="M 15 9 Q 15 4 24 4 Q 33 4 33 9 L 33 11 L 29 10 L 28 8 L 24 7 L 20 8 L 19 10 L 15 11 Z" fill={pelo} stroke="#0a0d18" strokeWidth="0.8" />
        {estado === "offline" ? (
          <>
            <line x1="19" y1="13" x2="22" y2="13" stroke="#0a0d18" strokeWidth="1" />
            <line x1="26" y1="13" x2="29" y2="13" stroke="#0a0d18" strokeWidth="1" />
          </>
        ) : estado === "error" ? (
          <>
            <text x="19.5" y="15" fontSize="5" fill="#0a0d18" fontFamily="monospace" fontWeight="bold">×</text>
            <text x="26.5" y="15" fontSize="5" fill="#0a0d18" fontFamily="monospace" fontWeight="bold">×</text>
          </>
        ) : (
          <>
            <rect x="19" y="12" width="2" height="2" fill="#0a0d18" />
            <rect x="27" y="12" width="2" height="2" fill="#0a0d18" />
          </>
        )}
        {estado === "trabajando" || estado === "esperando" ? (
          <rect x="22" y="16" width="4" height="1" fill="#0a0d18" />
        ) : estado === "error" ? (
          <path d="M 21 17 Q 24 15 27 17" fill="none" stroke="#0a0d18" strokeWidth="1" />
        ) : (
          <rect x="22" y="16" width="4" height="0.5" fill="#0a0d18" />
        )}
      </g>
      <style>{`
        .teclea { animation: teclea 1.2s ease-in-out infinite; transform-origin: 24px 28px }
        .respira { animation: respira 3s ease-in-out infinite; transform-origin: 24px 28px }
        .sacude { animation: sacude 0.4s ease-in-out infinite; transform-origin: 24px 24px }
        .brazos { animation: brazos 0.3s ease-in-out infinite alternate }
        @keyframes teclea { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
        @keyframes respira { 0%,100% { transform: translateY(0) scale(1) } 50% { transform: translateY(0) scale(1.02) } }
        @keyframes sacude { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-1px) } 75% { transform: translateX(1px) } }
        @keyframes brazos { 0% { transform: translateY(0) } 100% { transform: translateY(-1.5px) } }
      `}</style>
    </svg>
  );
}

/** Puesto completo: tile + escritorio + monitor + muñequito + halo + chip. Clic → ficha. */
function Puesto({ a, x, y, onClick }: { a: AgenteDemo; x: number; y: number; onClick: () => void }) {
  const ui = EST_UI[a.estado];
  return (
    <div className="absolute" style={{ left: x, top: y, width: 120, height: 120 }}>
      <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotateX(60deg) rotateZ(-45deg)" }}>
        <div style={{ width: 90, height: 90, background: "linear-gradient(135deg,#3b457a,#283055)", border: "2px solid #0a0d18", boxShadow: "inset 0 0 0 1px rgba(109,94,252,.08)" }} />
      </div>
      <div className="absolute pointer-events-none" style={{ left: 10, top: 50, width: 100, height: 50, borderRadius: "50%", background: ui.halo, filter: "blur(16px)" }} />
      <div className="absolute" style={{ left: 22, top: 32, width: 76, height: 28, background: "#3a2a1f", border: "2px solid #0a0d18", borderRadius: 3, boxShadow: "0 4px 0 #1a0f08" }}>
        <div style={{ position: "absolute", top: 1, left: 1, right: 1, height: 5, background: "linear-gradient(90deg,#4a3a2f,#5a4a3f)", borderRadius: "1px 1px 0 0" }} />
      </div>
      <div className="absolute" style={{ left: 50, top: 22, width: 20, height: 14, background: "#0a0d18", border: "2px solid #000", borderRadius: 2, boxShadow: `0 0 10px ${ui.halo}` }}>
        <div style={{ position: "absolute", inset: 2, background: ui.monitor, borderRadius: 1, animation: a.estado === "error" ? "parpadea 1.2s infinite" : "none" }} />
      </div>
      <div className="absolute" style={{ left: 56, top: 34, width: 8, height: 2, background: "#000" }} />
      <button type="button" onClick={onClick}
        className="absolute transition hover:z-20 hover:brightness-125 hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
        style={{ left: 36, top: 2, width: 48, height: 44, zIndex: 10, cursor: "pointer", background: "transparent", border: "none", padding: 0 }}
        aria-label={a.nombre}>
        <Munequito seed={a.seed} estado={a.estado} />
      </button>
      {a.estado === "error" && (
        <div className="absolute" style={{ left: 30, top: -8, zIndex: 20, pointerEvents: "none" }}>
          <div style={{
            background: "#f05a6e", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 7px",
            border: "2px solid #0a0d18", borderRadius: 3, fontFamily: "monospace", letterSpacing: "0.05em",
            boxShadow: "0 2px 0 #0a0d18", animation: "flotar 1.6s ease-in-out infinite", whiteSpace: "nowrap",
          }}>ERROR</div>
        </div>
      )}
    </div>
  );
}

export default function VirtualOfficePage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [pisoSel, setPisoSel] = useState<string>("chatters");
  const [abierto, setAbierto] = useState<AgenteDemo | null>(null);

  const piso = useMemo(() => DEMO.find((p) => p.slug === pisoSel) ?? DEMO[0], [pisoSel]);
  const resumen = useMemo(() => {
    const todos = DEMO.flatMap((p) => p.agentes);
    return {
      total: todos.length,
      trabajando: todos.filter((a) => a.estado === "trabajando").length,
      esperando: todos.filter((a) => a.estado === "esperando").length,
      error: todos.filter((a) => a.estado === "error").length,
    };
  }, []);

  const fullscreen = () => {
    try { void document.documentElement.requestFullscreen(); } catch { /* noop */ }
  };

  const COLS = 3, FILAS = 4, TILE = 120;
  const puestos = piso.agentes.slice(0, COLS * FILAS);

  return (
    <Page>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate(-1)} aria-label={t("common.back")} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border/60 bg-card/40 text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <PageHeader
            className="min-w-0 flex-1"
            icon={<Building2 />}
            title={t("dashboard.virtualOffice.titulo")}
            subtitle={t("dashboard.virtualOffice.sub")}
            actions={<>
              <Button variant="outline" size="sm" className="rounded-control" onClick={fullscreen}>
                <Maximize2 className="mr-1.5 h-4 w-4" />{t("dashboard.virtualOffice.pantallaCompleta")}
              </Button>
              <Button size="sm" className="rounded-control" disabled title={t("dashboard.virtualOffice.demo")}>
                <Bot className="mr-1.5 h-4 w-4" />{t("dashboard.virtualOffice.conectar")}
              </Button>
            </>}
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-panel border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <span className="text-foreground/80">{t("dashboard.virtualOffice.demo")}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <TarjetaKpi indice={0} icono={Bot} etiqueta="Total" valor={resumen.total} detalle={t("dashboard.virtualOffice.agentes", { n: resumen.total })} />
          <TarjetaKpi indice={1} icono={CheckCircle2} tono="success" etiqueta={t("dashboard.virtualOffice.trabajando")} valor={resumen.trabajando} detalle="En ejecución ahora" />
          <TarjetaKpi indice={2} icono={Loader2} tono="warning" etiqueta={t("dashboard.virtualOffice.esperando")} valor={resumen.esperando} detalle="Esperan próxima tarea" />
          <TarjetaKpi indice={3} icono={Info} tono="danger" etiqueta={t("dashboard.virtualOffice.error")} valor={resumen.error} detalle={resumen.error === 0 ? "Todo en orden" : "Requieren atención"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="vidrio p-2 space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Pisos</div>
            {DEMO.map((p) => {
              const activo = p.slug === pisoSel;
              const problemas = p.agentes.filter((a) => a.estado === "error").length;
              const trabajando = p.agentes.filter((a) => a.estado === "trabajando").length;
              return (
                <button key={p.slug} onClick={() => setPisoSel(p.slug)}
                  className={`flex w-full items-center gap-3 rounded-panel border px-3 py-2.5 text-left transition ${
                    activo ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-foreground/5"
                  }`}>
                  <span className={`font-display text-xl font-bold tabular-nums w-7 text-center ${activo ? "text-primary" : "text-muted-foreground"}`}>{p.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold capitalize">{p.slug === "operaciones" ? "Operaciones" : p.slug}</span>
                    <span className="block text-[10px] text-muted-foreground">{trabajando}/{p.agentes.length} activos</span>
                  </span>
                  <span className={`h-2 w-2 rounded-full ${problemas > 0 ? "bg-destructive animate-pulse" : "bg-success"}`} />
                </button>
              );
            })}
          </aside>

          <section className="vidrio p-4 overflow-hidden" style={{ minHeight: 560 }}>
            <div className="v-cont flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </span>
                  {t("dashboard.virtualOffice.piso", { n: piso.numero })} · <span className="capitalize">{piso.slug === "operaciones" ? "Operaciones" : piso.slug}</span>
                  <span className="text-xs font-normal text-muted-foreground">· {t("dashboard.virtualOffice.agentes", { n: piso.agentes.length })}</span>
                </h2>
              </div>

              <div className="relative flex-1 rounded-panel overflow-hidden" style={{
                background: "radial-gradient(ellipse at top,#1b2140 0%,#0b0d16 60%,#070912 100%)",
                minHeight: 480,
              }}>
                <div className="absolute inset-0 opacity-30" style={{
                  backgroundImage: "repeating-linear-gradient(90deg, transparent 0 40px, rgba(109,94,252,.15) 40px 44px, transparent 44px 88px, rgba(73,227,166,.1) 88px 92px)",
                  maskImage: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 60%)",
                  WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 60%)",
                }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative" style={{
                    width: COLS * TILE,
                    height: FILAS * TILE,
                    transform: "perspective(900px) rotateX(18deg)",
                    transformStyle: "preserve-3d",
                  }}>
                    {Array.from({ length: COLS * FILAS }, (_, i) => {
                      const r = Math.floor(i / COLS), c = i % COLS;
                      const a = puestos[i];
                      if (!a) return null;
                      return (
                        <Puesto key={a.id} a={a} x={c * TILE} y={r * TILE} onClick={() => setAbierto(a)} />
                      );
                    })}
                  </div>
                </div>
                {piso.agentes.length > COLS * FILAS && (
                  <div className="absolute bottom-3 right-3 rounded-control bg-card/80 border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                    +{piso.agentes.length - COLS * FILAS} más en este piso
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <Dialog open={!!abierto} onOpenChange={(o) => { if (!o) setAbierto(null); }}>
          <DialogContent className="max-w-md">
            {abierto && (() => {
              const ui = EST_UI[abierto.estado];
              return (
                <>
                  <DialogTitle className="flex items-center gap-3">
                    <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-panel bg-card text-base font-bold ring-2 ${ui.anillo} overflow-hidden`}>
                      <Munequito seed={abierto.seed} estado={abierto.estado} />
                      <span className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full ring-2 ring-background ${ui.punto}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base">{abierto.nombre}</span>
                      <span className={`block text-xs font-medium ${ui.texto}`}>{t(ui.lbl)}</span>
                    </span>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">{abierto.depto} · {abierto.rol}</p>

                  <div className="mt-2 space-y-4">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("dashboard.virtualOffice.tareaActual")}</p>
                      <div className="rounded-panel border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                        {abierto.tarea ?? t("dashboard.virtualOffice.sinTarea")}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("dashboard.virtualOffice.hoy")}</p>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                          <div className="font-display text-xl font-bold tabular-nums text-success">{abierto.hechas}</div>
                          <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.hechas")}</div>
                        </div>
                        <div className="min-w-0 flex-1 rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                          <div className="font-display text-xl font-bold tabular-nums text-destructive">{abierto.errores}</div>
                          <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.errores")}</div>
                        </div>
                        <div className="min-w-0 flex-1 rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                          <div className="font-display text-xl font-bold tabular-nums text-primary">{abierto.exito}%</div>
                          <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.exito")}</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("dashboard.virtualOffice.ultimasEjec")}</p>
                      <div className="space-y-1">
                        {Array.from({ length: 5 }, (_, i) => {
                          const ok = !(abierto.estado === "error" && i < 2);
                          return (
                            <div key={i} className="flex items-center gap-2 rounded-panel border border-border/40 bg-card/20 px-2.5 py-1.5 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
                              <span className="min-w-0 flex-1 truncate">{ok ? `Tarea completada` : `Error — token expirado`}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">#{4820 - i}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <Button className="w-full rounded-control" disabled title={t("dashboard.virtualOffice.demo")}>
                      <ExternalLink className="mr-1.5 h-4 w-4" />{t("dashboard.virtualOffice.abrirPaperclip")}
                    </Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        <style>{`
          @keyframes flotar { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-4px) } }
          @keyframes parpadea { 0%,100%{ opacity: 1 } 50%{ opacity: .45 } }
        `}</style>
      </div>
    </Page>
  );
}
