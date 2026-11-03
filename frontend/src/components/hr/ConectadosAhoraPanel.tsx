import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Loader2, AlertTriangle, RefreshCw, ChevronRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";
import { useSemaforos, PUNTO_SEM, type Semaforo } from "@/hooks/useSemaforos";

// CONECTADOS AHORA — el TABLERO DE PERSONAL de Argos (Álvaro, 02/11). NO es la
// muralla de fotos (eso es "Pantallazos en vivo"): aquí es QUIÉN está trabajando
// y en qué semáforo va cada quien, en lista limpia SIN pantallazos. Una fila por
// persona: su semáforo, su avatar, su nombre, qué sistema usa (IA) y su % de
// atención de hoy. Filtros por color para guiarse (ver solo los rojos, etc.).
// Clic en alguien → su expediente (ahí sí viven sus fotos). Se refresca solo.
//
// EL SEMÁFORO: el sí-o-no de un vistazo por persona, AHORA (lógica y colores
// compartidos en useSemaforos, iguales a los de Pantallazos en vivo):
// 🟢 trabajando · 🟡 pausa/ojo · 🔴 no está en lo suyo · ⚪ Argos aún no la juzga.

export function ConectadosAhoraPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useCapturasVivo();
  const { semaforoDe } = useSemaforos();

  const labelSem: Record<Semaforo, string> = {
    verde: t("hr.sem.trabajando"),
    amarillo: t("hr.sem.pausa"),
    naranja: t("hr.sem.sinPantalla"),
    rojo: t("hr.sem.problema"),
    gris: t("hr.sem.esperando"),
  };

  // FILTRO por color del semáforo (Alvaro, 02/11): "todos" o un solo estado,
  // para guiarse rápido (p.ej. ver solo los rojos). Cada persona ya trae su
  // semáforo; contamos cuántos hay de cada color para las pastillas.
  const [filtro, setFiltro] = useState<Semaforo | "todos">("todos");
  const semPorPersona = useMemo(() => new Map(personas.map((p) => [p.userId, semaforoDe(p.userId, p.fueraDeLugar, p.veredicto, p.tienePantalla)])), [personas, semaforoDe]);
  const conteo = useMemo(() => {
    const c: Record<Semaforo, number> = { verde: 0, amarillo: 0, naranja: 0, rojo: 0, gris: 0 };
    for (const s of semPorPersona.values()) c[s]++;
    return c;
  }, [semPorPersona]);

  const orden = useMemo(
    () =>
      [...personas]
        .filter((p) => filtro === "todos" || semPorPersona.get(p.userId) === filtro)
        .sort((a, b) => (Number(b.fueraDeLugar) - Number(a.fueraDeLugar)) || (a.ultima < b.ultima ? 1 : -1)),
    [personas, filtro, semPorPersona],
  );
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Radio className="h-[18px] w-[18px]" />
            {personas.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.conectados.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {personas.length > 0 ? t("hr.conectados.contando", { n: personas.length }) : t("hr.conectados.sub")}
            </p>
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

        {/* Filtros por color del semáforo: guiarse de un vistazo (p.ej. solo rojos) */}
        {personas.length > 0 && !error && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([
              { k: "todos", label: t("hr.conectados.filtroTodos"), n: personas.length, punto: "" },
              { k: "rojo", label: labelSem.rojo, n: conteo.rojo, punto: PUNTO_SEM.rojo },
              { k: "naranja", label: labelSem.naranja, n: conteo.naranja, punto: PUNTO_SEM.naranja },
              { k: "amarillo", label: labelSem.amarillo, n: conteo.amarillo, punto: PUNTO_SEM.amarillo },
              { k: "verde", label: labelSem.verde, n: conteo.verde, punto: PUNTO_SEM.verde },
              { k: "gris", label: labelSem.gris, n: conteo.gris, punto: PUNTO_SEM.gris },
            ] as const).map((f) => {
              const activo = filtro === f.k;
              return (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setFiltro(f.k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activo ? "border-primary/60 bg-primary/15 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
                  }`}
                >
                  {f.punto && <span className={`h-1.5 w-1.5 rounded-full ${f.punto}`} />}
                  {f.label}
                  <span className="tabular-nums opacity-70">{f.n}</span>
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.pantallazos.error")}</p>
          </div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Radio className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.conectados.vacio")}</p>
          </div>
        ) : orden.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Radio className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.conectados.sinEnFiltro")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {orden.map((p) => {
              const nombre = p.nombre || t("hr.noName");
              const sem = semPorPersona.get(p.userId) ?? "gris";
              const estado = sem === "verde" ? t("hr.sem.trabajando") : sem === "amarillo" ? t("hr.sem.pausa") : sem === "naranja" ? t("hr.sem.sinPantalla") : sem === "rojo" ? t("hr.sem.problema") : t("hr.sem.esperando");
              const tonoEstado = sem === "verde" ? "text-success" : sem === "amarillo" ? "text-warning" : sem === "naranja" ? "text-orange-500" : sem === "rojo" ? "text-destructive" : "text-muted-foreground";
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => navigate(`/hr/expediente/${p.userId}`, { state: { volverA: "/hr/monitor-ia?t=equipo" } })}
                  title={t("hr.notas.verDia", { nombre })}
                  className={`group flex w-full items-center gap-3 rounded-xl border bg-card/30 px-3 py-2.5 text-left transition-colors hover:bg-card/50 ${p.fueraDeLugar ? "border-destructive/50 hover:border-destructive" : "border-border/40 hover:border-primary/50"}`}
                >
                  {/* El semáforo manda: punto grande a la izquierda */}
                  <span className={`h-3 w-3 shrink-0 rounded-full ${PUNTO_SEM[sem]}`} title={labelSem[sem]} aria-label={labelSem[sem]} />
                  <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" status="online" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{nombre}</span>
                      {p.fueraDeLugar && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold text-destructive-foreground">
                          <AlertTriangle className="h-2.5 w-2.5" />{t("hr.pantallazos.fueraDeLugar")}
                        </span>
                      )}
                    </div>
                    <p className={`flex items-center gap-1 truncate text-xs ${p.fueraDeLugar ? "text-destructive" : "text-muted-foreground"}`}>
                      <Sparkles className="h-3 w-3 shrink-0 opacity-60" />{p.veredicto || t("hr.pantallazos.analizando")}
                    </p>
                  </div>
                  {/* El estado EN VIVO en palabras + la hora del último pantallazo */}
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={`text-xs font-semibold ${tonoEstado}`}>{estado}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{horaDe(p.ultima)}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
