import { Link } from "react-router-dom";
import { ArrowRight, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { pctUsado, tamanoNas, tonoDelNas, type ResumenNas } from "@/lib/espacioNas";
import { RUTA_ESPACIO_NAS, useResumenNas } from "./EspacioNasBloque";

// EL NAS EN EL CENTRO DE OPERACIONES, CERRADO (Alvaro, 10/11/2026): "no quiero
// que venga todo abierto... quiero un botón para entrar a ver más adentro". Una
// sola línea con lo justo y «Entrar al NAS». Si pasa del 80 % se pone en
// amarillo (rojo al 90 %) para verlo sin entrar. Solo dueño/admin.

const TONO_TEXTO = { ok: "text-muted-foreground", atento: "text-warning", urgente: "text-destructive" } as const;
const TONO_BARRA = { ok: "bg-primary/60", atento: "bg-warning", urgente: "bg-destructive" } as const;

export default function EspacioNasLinea() {
  const { puede, q } = useResumenNas();
  if (!puede) return null;
  return <EspacioNasLineaVista resumen={q.data} cargando={q.isLoading} fallo={q.isError} onReintentar={() => void q.refetch()} />;
}

export function EspacioNasLineaVista({ resumen: r, cargando, fallo, onReintentar }: {
  resumen: ResumenNas | undefined; cargando: boolean; fallo: boolean; onReintentar: () => void;
}) {
  const { t, language } = useLanguage();
  const pct = r && !r.sin_muestras ? pctUsado(r) : 0;
  const tono = tonoDelNas(pct);

  return (
    <section className="vidrio sube flex flex-wrap items-center gap-3 px-4 py-3" style={{ animationDelay: "0.14s" }}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary"><HardDrive className="h-4 w-4" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{t("dashboard.centro.nas.titulo")}</span>
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : fallo ? (
              <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
                <RefreshCw className="h-3 w-3" />{t("dashboard.centro.nas.fallo")}
              </button>
            ) : r && !r.sin_muestras ? (
              <span className={`text-xs tabular-nums ${TONO_TEXTO[tono]}`}>
                {t("dashboard.centro.nas.linea", { usado: tamanoNas(r.usado, language), total: tamanoNas(r.total, language), pct: Math.round(pct) })}
              </span>
            ) : null}
        </div>
        {r && !r.sin_muestras && (
          <div className="h-1 max-w-md overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${TONO_BARRA[tono]}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
      </div>
      <Link to={RUTA_ESPACIO_NAS} className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
        {t("dashboard.centro.nas.entrar")}<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
