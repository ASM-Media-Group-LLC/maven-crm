import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";
import { useSemaforos, PUNTO_SEM, type Semaforo } from "@/hooks/useSemaforos";

// Sin el verde prendido (Alvaro, 12/11/2026: «está muy prendido el color
// verde»): el anillo de cada cara es neutro y el estado va en gris; el color
// queda SOLO en el puntito del semáforo. Lo malo se lee en blanco, no en rojo.
const ANILLO_SEM: Record<Semaforo, string> = {
  verde: "ring-border/70",
  amarillo: "ring-border/70",
  naranja: "ring-border/70",
  rojo: "ring-border/70",
  gris: "ring-border/50",
};
const TONO_SEM: Record<Semaforo, string> = {
  verde: "text-muted-foreground",
  amarillo: "text-foreground/85",
  naranja: "text-foreground/85",
  rojo: "text-foreground/85",
  gris: "text-muted-foreground",
};

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
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
            <Radio className="h-[18px] w-[18px]" />
            {personas.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success/80" />}
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
                    activo ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
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
          /* MURALLA DE CARAS (Alvaro, 04/11): una rejilla de caras con ANILLO de
             color = su semáforo, para leer el piso de un vistazo como una pared
             de monitoreo. Los rojos (anillo rojo) saltan. Clic → su día. */
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {orden.map((p) => {
              const nombre = p.nombre || t("hr.noName");
              const sem = semPorPersona.get(p.userId) ?? "gris";
              const estado = sem === "verde" ? t("hr.sem.trabajando") : sem === "amarillo" ? t("hr.sem.pausa") : sem === "naranja" ? t("hr.sem.sinPantalla") : sem === "rojo" ? t("hr.sem.problema") : t("hr.sem.esperando");
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => navigate(`/hr/expediente/${p.userId}`, { state: { volverA: "/hr/monitor-ia?t=ahora" } })}
                  title={`${nombre} · ${estado}`}
                  className={`group flex flex-col items-center gap-1.5 rounded-2xl border bg-card/20 px-2 py-3 text-center transition-colors hover:bg-card/40 border-border/40 hover:border-foreground/25`}
                >
                  {/* La cara con su anillo de color + el punto del semáforo */}
                  <span className={`relative rounded-full p-0.5 ring-2 ${ANILLO_SEM[sem]}`}>
                    <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="lg" />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${PUNTO_SEM[sem]}`} title={labelSem[sem]} aria-label={labelSem[sem]} />
                  </span>
                  <span className="w-full truncate text-xs font-semibold">{nombre}</span>
                  <span className={`truncate text-[10px] font-medium ${TONO_SEM[sem]}`}>{estado}</span>
                  <span className="text-[9px] tabular-nums text-muted-foreground/70">{horaDe(p.ultima)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
