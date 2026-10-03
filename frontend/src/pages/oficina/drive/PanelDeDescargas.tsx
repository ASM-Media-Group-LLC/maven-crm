import { AlertTriangle, Check, FileArchive, FolderDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/hooks/useLanguage";
import { tamano } from "@/lib/drive/formato";
import { fraccion } from "@/lib/drive/descargaZip";
import { EN_CURSO, ERROR_DEL_NAS, type DescargaZip } from "@/hooks/useDescargasZip";
import { useCuantos } from "@/pages/oficina/drive/Tamanos";

/** El panelcito de las descargas en .zip (junto al de las subidas, abajo a la
 *  derecha, como en Google Drive): cuánto va, cuánto falta y «Cancelar». */
export default function PanelDeDescargas({
  descargas, onCancelar, onElegirDonde, onCerrar,
}: {
  descargas: DescargaZip[];
  onCancelar: (clave: string) => void;
  onElegirDonde: (clave: string) => void;
  onCerrar: () => void;
}) {
  const { t } = useLanguage();
  const cuantos = useCuantos();
  const enCurso = descargas.filter((d) => EN_CURSO.includes(d.estado)).length;
  return (
    <section aria-label={t("drive.descargas.titulo")} className="overflow-hidden rounded-panel border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between bg-muted/60 px-4 py-2 text-sm font-medium">
        {enCurso ? t("drive.descargas.enCurso", { n: enCurso }) : t("drive.descargas.titulo")}
        <button
          type="button"
          onClick={onCerrar}
          disabled={enCurso > 0}
          aria-label={t("drive.descargas.cerrar")}
          className="rounded-full p-1 hover:bg-muted disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-64 overflow-auto">
        {descargas.map((d) => {
          const nombre = d.nombre || ".zip";
          const pct = Math.round(fraccion(d.recibido, d.total, d.totalExacto) * 100);
          const avance = t(d.totalExacto ? "drive.descargas.avance" : "drive.descargas.avanceAprox", {
            recibido: tamano(d.recibido), total: tamano(d.total),
          });
          return (
            <li key={d.clave} className="flex items-start gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0">
              <FileArchive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={nombre}>{d.estado === "preparando" ? t("drive.zip.preparando") : nombre}</p>
                {d.estado === "preparando" && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
                  </div>
                )}
                {d.estado === "bajando" && (
                  <>
                    <Progress
                      value={pct}
                      aria-label={t("drive.descargas.progreso", { name: nombre })}
                      className="mt-1.5 h-1 bg-foreground/10"
                      indicatorClassName="rounded-full bg-primary"
                    />
                    <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">
                      {avance} · {cuantos.archivos(d.archivos)}
                    </p>
                  </>
                )}
                {d.estado === "elegir" && (
                  <div className="mt-1 flex flex-col items-start gap-1.5">
                    <p className="text-xs text-muted-foreground">{t("drive.descargas.elegirAyuda", { total: tamano(d.total) })}</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => onElegirDonde(d.clave)}>
                      <FolderDown className="mr-1.5 h-4 w-4" />
                      {t("drive.descargas.elegir")}
                    </Button>
                  </div>
                )}
                {d.estado === "lista" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("drive.descargas.lista", { total: tamano(d.recibido) })}</p>
                )}
                {d.estado === "cancelada" && <p className="mt-0.5 text-xs text-muted-foreground">{t("drive.descargas.cancelada")}</p>}
                {d.estado === "navegador" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("drive.descargas.navegador", { total: tamano(d.total) })}</p>
                )}
                {d.estado === "error" && (
                  <p className="mt-0.5 text-xs text-destructive">
                    {d.error === ERROR_DEL_NAS ? t("drive.zip.errorNas") : t("drive.descargas.error", { motivo: d.error ?? "" })}
                  </p>
                )}
              </div>
              {(d.estado === "bajando" || d.estado === "preparando" || d.estado === "elegir") && (
                <button
                  type="button"
                  onClick={() => onCancelar(d.clave)}
                  aria-label={t("drive.descargas.cancelar", { name: nombre })}
                  title={t("drive.descargas.cancelar", { name: nombre })}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {d.estado === "lista" && <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />}
              {d.estado === "error" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
