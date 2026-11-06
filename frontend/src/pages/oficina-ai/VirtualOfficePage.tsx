import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Building2, CheckCircle2, ExternalLink, Info, Loader2, Maximize2, Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TranslationKey } from "@/lib/i18n";

// VIRTUAL OFFICE (Alvaro, 05/11) — Primera versión del centro de visualización
// de agentes AI de Paperclip. Mismo lenguaje glassy del Pulso (sin muñequitos
// feos a propósito: cuando elijamos los sprites reales decoramos). Un "piso =
// sala" por departamento, agentes DEMO como fichas; estado en vivo, clic abre
// ficha con tarea actual + métricas del día + historial + botón "Abrir en
// Paperclip". Cuando conecte Paperclip, cambia la fuente de datos.

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
}

interface Piso {
  numero: number;
  slug: string;
  nombre: TranslationKey;
  agentes: AgenteDemo[];
}

// Datos DEMO hasta conectar Paperclip. Cuando lleguen agentes reales, esto se
// reemplaza por un hook `useAgentesPaperclip()`.
const DEMO: Piso[] = [
  {
    numero: 6, slug: "chatters", nombre: "dashboard.virtualOffice.piso",
    agentes: Array.from({ length: 11 }, (_, i): AgenteDemo => ({
      id: `chatter-${i + 1}`,
      nombre: `Chatter Agent #${i + 1}`,
      rol: "Responde consultas en Messenger",
      estado: i === 5 ? "error" : i === 3 || i === 8 ? "esperando" : i === 9 ? "offline" : "trabajando",
      tarea: i === 5 ? "Error: token expirado" : i === 3 || i === 8 ? null : i === 9 ? null : `Respondiendo a cliente #${4810 + i}`,
      hechas: 80 + (i * 17) % 90,
      errores: (i * 3) % 7,
      exito: 90 + (i * 3) % 10,
      depto: "Chatters",
    })),
  },
  { numero: 5, slug: "pr", nombre: "dashboard.virtualOffice.piso",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `pr-${i + 1}`, nombre: `PR Agent #${i + 1}`, rol: "Agenda contenido con creadoras", estado: "trabajando",
      tarea: `Programando feed del mes`, hechas: 28 + i * 4, errores: 0, exito: 100, depto: "PR",
    })),
  },
  { numero: 4, slug: "editores", nombre: "dashboard.virtualOffice.piso",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `ed-${i + 1}`, nombre: `Editor Agent #${i + 1}`, rol: "Corta y limpia videos", estado: i === 2 ? "esperando" : "trabajando",
      tarea: i === 2 ? null : "Cortando entrega #" + (300 + i), hechas: 12 + i * 2, errores: 0, exito: 100, depto: "Editores",
    })),
  },
  { numero: 3, slug: "closers", nombre: "dashboard.virtualOffice.piso",
    agentes: Array.from({ length: 6 }, (_, i): AgenteDemo => ({
      id: `cl-${i + 1}`, nombre: `Closer Agent #${i + 1}`, rol: "Cierra ventas PPV", estado: i === 5 ? "offline" : "trabajando",
      tarea: i === 5 ? null : "Cerrando lead #" + (1200 + i), hechas: 44 + i * 6, errores: i, exito: 92 + i, depto: "Closers",
    })),
  },
  { numero: 2, slug: "finanzas", nombre: "dashboard.virtualOffice.piso",
    agentes: Array.from({ length: 3 }, (_, i): AgenteDemo => ({
      id: `fi-${i + 1}`, nombre: `Finance Agent #${i + 1}`, rol: "Concilia pagos y payouts", estado: "trabajando",
      tarea: "Conciliando payout de Luciana", hechas: 8 + i, errores: 0, exito: 100, depto: "Finanzas",
    })),
  },
  { numero: 1, slug: "operaciones", nombre: "dashboard.virtualOffice.piso",
    agentes: [{ id: "op-1", nombre: "Ops Agent #1", rol: "Coordina el flujo de trabajo", estado: "trabajando", tarea: "Ruteando tareas del día", hechas: 86, errores: 1, exito: 99, depto: "Operaciones" }],
  },
];

const EST_UI: Record<EstadoAgente, { punto: string; anillo: string; texto: string; lbl: TranslationKey }> = {
  trabajando: { punto: "bg-success", anillo: "ring-success/40", texto: "text-success", lbl: "dashboard.virtualOffice.trabajando" },
  esperando: { punto: "bg-warning", anillo: "ring-warning/40", texto: "text-warning", lbl: "dashboard.virtualOffice.esperando" },
  error: { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive", lbl: "dashboard.virtualOffice.error" },
  offline: { punto: "bg-muted-foreground/30", anillo: "ring-transparent", texto: "text-muted-foreground", lbl: "dashboard.virtualOffice.offline" },
};

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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:p-6 space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-control border border-border/60 bg-card/40 text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{t("dashboard.virtualOffice.titulo")}</h1>
            <p className="text-sm text-muted-foreground">{t("dashboard.virtualOffice.sub")}</p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="rounded-control" onClick={fullscreen}>
            <Maximize2 className="mr-1.5 h-4 w-4" />{t("dashboard.virtualOffice.pantallaCompleta")}
          </Button>
          <Button size="sm" className="rounded-control" disabled title={t("dashboard.virtualOffice.demo")}>
            <Bot className="mr-1.5 h-4 w-4" />{t("dashboard.virtualOffice.conectar")}
          </Button>
        </div>
      </div>

      {/* Aviso DEMO */}
      <div className="flex items-start gap-2.5 rounded-panel border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-warning mt-0.5" />
        <span className="text-foreground/80">{t("dashboard.virtualOffice.demo")}</span>
      </div>

      {/* KPIs (mismo TarjetaKpi que el resto del dashboard) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKpi indice={0} icono={Bot} etiqueta="Total" valor={resumen.total} detalle={t("dashboard.virtualOffice.agentes", { n: resumen.total })} />
        <TarjetaKpi indice={1} icono={CheckCircle2} tono="success" etiqueta={t("dashboard.virtualOffice.trabajando")} valor={resumen.trabajando} detalle="En ejecución ahora" />
        <TarjetaKpi indice={2} icono={Loader2} tono="warning" etiqueta={t("dashboard.virtualOffice.esperando")} valor={resumen.esperando} detalle="Esperan próxima tarea" />
        <TarjetaKpi indice={3} icono={Info} tono="danger" etiqueta={t("dashboard.virtualOffice.error")} valor={resumen.error} detalle={resumen.error === 0 ? "Todo en orden" : "Requieren atención"} />
      </div>

      {/* Shell: pisos (sidebar) + sala actual */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Selector de pisos */}
        <aside className="vidrio p-2 space-y-1">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pisos</div>
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

        {/* Sala actual: agentes como fichas glassy */}
        <section className="vidrio p-4">
          <div className="v-cont space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </span>
                {t("dashboard.virtualOffice.piso", { n: piso.numero })} · <span className="capitalize">{piso.slug === "operaciones" ? "Operaciones" : piso.slug}</span>
                <span className="text-xs font-normal text-muted-foreground">· {t("dashboard.virtualOffice.agentes", { n: piso.agentes.length })}</span>
              </h2>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {piso.agentes.map((a) => {
                const ui = EST_UI[a.estado];
                const iniciales = a.nombre.split(" ").filter((s) => !s.startsWith("#")).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
                return (
                  <button key={a.id} onClick={() => setAbierto(a)}
                    className={`group flex items-start gap-2.5 rounded-panel border px-3 py-2.5 text-left transition ${
                      a.estado === "error" ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
                        : "border-border/40 bg-card/30 hover:border-primary/40 hover:bg-card/60"
                    }`}>
                    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-panel text-sm font-bold ring-2 ${
                      a.estado === "offline" ? "bg-muted/40 text-muted-foreground/70 ring-muted-foreground/20"
                      : "bg-card text-foreground"
                    } ${ui.anillo}`}>
                      {iniciales || "AI"}
                      <span className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full ring-2 ring-background ${ui.punto} ${a.estado === "error" ? "animate-pulse" : ""}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold leading-tight">{a.nombre}</span>
                      <span className={`block text-[11px] font-medium leading-tight ${ui.texto}`}>{t(ui.lbl)}</span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{a.tarea ?? t("dashboard.virtualOffice.sinTarea")}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Ficha del agente */}
      <Dialog open={!!abierto} onOpenChange={(o) => { if (!o) setAbierto(null); }}>
        <DialogContent className="max-w-md">
          {abierto && (() => {
            const ui = EST_UI[abierto.estado];
            const iniciales = abierto.nombre.split(" ").filter((s) => !s.startsWith("#")).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
            return (
              <>
                <DialogTitle className="flex items-center gap-3">
                  <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-panel bg-card text-base font-bold ring-2 ${ui.anillo}`}>
                    {iniciales}
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
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.virtualOffice.tareaActual")}</p>
                    <div className="rounded-panel border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                      {abierto.tarea ?? t("dashboard.virtualOffice.sinTarea")}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.virtualOffice.hoy")}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                        <div className="font-display text-xl font-bold tabular-nums text-success">{abierto.hechas}</div>
                        <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.hechas")}</div>
                      </div>
                      <div className="rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                        <div className="font-display text-xl font-bold tabular-nums text-destructive">{abierto.errores}</div>
                        <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.errores")}</div>
                      </div>
                      <div className="rounded-panel border border-border/40 bg-card/30 p-2.5 text-center">
                        <div className="font-display text-xl font-bold tabular-nums text-primary">{abierto.exito}%</div>
                        <div className="text-[10px] text-muted-foreground">{t("dashboard.virtualOffice.exito")}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.virtualOffice.ultimasEjec")}</p>
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
    </div>
  );
}
