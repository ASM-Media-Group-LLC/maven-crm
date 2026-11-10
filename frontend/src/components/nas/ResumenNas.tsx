import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Copy, FolderSearch, History, PieChart, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { estadoDeMedicion, pctUsado, type EstadoChequeo, type FichaNas, type ResumenNas } from "@/lib/espacioNas";
import type { EstadoDe } from "./comun";

// EL RESUMEN DEL ÁREA DEL NAS (Alvaro, 10/11/2026): "no algo tan extendido...
// quiero meterme a ciertas cosas que me lleven a ver ciertas cosas y saber que
// todo está corriendo bien". Arriba los chequeos de que todo corre bien; abajo,
// botones a cada parte. El detalle vive en cada pestaña.

export type VistaNas = "resumen" | "explorador" | "quehay" | "historia" | "liberar" | "copia";

const ICONO_ESTADO: Record<EstadoChequeo, LucideIcon> = { ok: CheckCircle2, revisar: CircleAlert, mal: AlertTriangle };
const COLOR_ESTADO: Record<EstadoChequeo, string> = { ok: "text-success", revisar: "text-warning", mal: "text-destructive" };

const ENTRADAS = [
  { vista: "explorador", icono: FolderSearch, titulo: "dashboard.centro.nas.entrada.explorador", texto: "dashboard.centro.nas.entrada.exploradorTexto" },
  { vista: "quehay", icono: PieChart, titulo: "dashboard.centro.nas.entrada.quehay", texto: "dashboard.centro.nas.entrada.quehayTexto" },
  { vista: "historia", icono: History, titulo: "dashboard.centro.nas.entrada.historia", texto: "dashboard.centro.nas.entrada.historiaTexto" },
  { vista: "liberar", icono: Copy, titulo: "dashboard.centro.nas.entrada.liberar", texto: "dashboard.centro.nas.entrada.liberarTexto" },
  { vista: "copia", icono: ShieldAlert, titulo: "dashboard.centro.nas.entrada.copia", texto: "dashboard.centro.nas.entrada.copiaTexto" },
] as const;

type ClaveChequeo =
  | "dashboard.centro.nas.chequeo.nasCaido" | "dashboard.centro.nas.chequeo.nasArriba"
  | "dashboard.centro.nas.chequeo.medicionOk" | "dashboard.centro.nas.chequeo.medicionVieja"
  | "dashboard.centro.nas.chequeo.aportesOk" | "dashboard.centro.nas.chequeo.aportesEsperando"
  | "dashboard.centro.nas.chequeo.espacio" | "dashboard.centro.nas.chequeo.sinCopia";
export type Chequeo = { estado: EstadoChequeo; clave: ClaveChequeo; params?: Record<string, number> };

/** Los chequeos de "todo está corriendo bien". null = todavía cargando. La copia
 *  de seguridad va aparte: es un pendiente conocido, no algo que se rompió. */
export function chequeosDelNas(resumen: ResumenNas | undefined, ficha: FichaNas | undefined): Chequeo[] | null {
  if (!resumen || !ficha) return null;
  const pct = resumen.sin_muestras ? 0 : pctUsado(resumen);
  const esperando = ficha.aportes_esperando ?? 0;
  const medicion = estadoDeMedicion(resumen.sin_muestras ? null : resumen.medido_at);
  return [
    ficha.nas?.caido
      ? { estado: "mal", clave: "dashboard.centro.nas.chequeo.nasCaido" }
      : { estado: "ok", clave: "dashboard.centro.nas.chequeo.nasArriba" },
    { estado: medicion, clave: medicion === "ok" ? "dashboard.centro.nas.chequeo.medicionOk" : "dashboard.centro.nas.chequeo.medicionVieja" },
    esperando === 0
      ? { estado: "ok", clave: "dashboard.centro.nas.chequeo.aportesOk" }
      : { estado: ficha.nas?.caido ? "mal" : "revisar", clave: "dashboard.centro.nas.chequeo.aportesEsperando", params: { n: esperando } },
    { estado: pct >= 90 ? "mal" : pct >= 80 ? "revisar" : "ok", clave: "dashboard.centro.nas.chequeo.espacio", params: { pct: Math.round(pct) } },
    { estado: "revisar", clave: "dashboard.centro.nas.chequeo.sinCopia" },
  ];
}

/** ¿Está todo corriendo? (la falta de copia es un pendiente, no una falla). */
export function todoCorriendo(chequeos: Chequeo[]): boolean {
  return chequeos.every((c) => c.estado === "ok" || c.clave === "dashboard.centro.nas.chequeo.sinCopia");
}

export function ResumenNasVista({ bloque, resumen, ficha, onIr }: {
  /** El bloque compacto de lo lleno (lo pone el contenedor). */
  bloque: ReactNode;
  resumen: ResumenNas | undefined;
  ficha: EstadoDe<FichaNas>;
  onIr: (v: Exclude<VistaNas, "resumen">) => void;
}) {
  const { t } = useLanguage();
  const chequeos = chequeosDelNas(resumen, ficha.data);

  return (
    <div className="flex flex-col gap-4">
      <section className="vidrio sube p-4">
        <h2 className="text-sm font-semibold">
          {chequeos == null ? t("dashboard.centro.nas.chequeo.titulo")
            : todoCorriendo(chequeos) ? t("dashboard.centro.nas.chequeo.todoBien") : t("dashboard.centro.nas.chequeo.algoRevisar")}
        </h2>
        {ficha.isError ? (
          <button type="button" onClick={() => void ficha.refetch()} className="mt-2 text-xs text-destructive hover:underline">
            {t("dashboard.centro.nas.fallo")} · {t("dashboard.centro.nas.reintentar")}
          </button>
        ) : chequeos == null ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.centro.nas.chequeo.cargando")}</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {chequeos.map((c) => {
              const Icono = ICONO_ESTADO[c.estado];
              return (
                <li key={c.clave} className="flex items-start gap-2 text-sm">
                  <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR_ESTADO[c.estado]}`} />
                  <span>{t(c.clave, c.params)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {bloque}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRADAS.map((e) => {
          const Icono = e.icono;
          return (
            <button key={e.vista} type="button" onClick={() => onIr(e.vista)}
              className="vidrio vidrio-lift sube flex items-start gap-3 p-4 text-left transition hover:brightness-110">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">{t(e.titulo)}<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(e.texto)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
