import { Download, FolderInput, Loader2, RotateCcw, Trash2, X, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

/** Lo que se puede hacer con lo elegido. Una acción que la vista no permite
 *  no se pasa y no se muestra. */
export interface AccionesDeSeleccion {
  descargar?: () => void;
  mover?: () => void;
  papelera?: () => void;
  restaurar?: () => void;
  borrar?: () => void;
}

/** La barra que reemplaza los títulos de las columnas cuando hay algo
 *  elegido, como en Google Drive: cuántos, qué hacer, y ✕ para soltar. */
export default function BarraDeSeleccion({
  n, acciones, ocupado, onLimpiar,
}: { n: number; acciones: AccionesDeSeleccion; ocupado: boolean; onLimpiar: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="toolbar" aria-label={t("drive.seleccion.barra")} className="flex min-w-0 flex-wrap items-center gap-1">
      <span className="mr-1 text-sm font-medium text-foreground">
        {n === 1 ? t("drive.seleccion.uno") : t("drive.seleccion.n", { n })}
      </span>
      {ocupado && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {acciones.descargar && <Accion icono={Download} etiqueta={t("drive.accion.descargar")} onClick={acciones.descargar} disabled={ocupado} />}
      {acciones.mover && <Accion icono={FolderInput} etiqueta={t("drive.accion.mover")} onClick={acciones.mover} disabled={ocupado} />}
      {acciones.papelera && <Accion icono={Trash2} etiqueta={t("drive.accion.papelera")} onClick={acciones.papelera} disabled={ocupado} />}
      {acciones.restaurar && <Accion icono={RotateCcw} etiqueta={t("drive.accion.restaurar")} onClick={acciones.restaurar} disabled={ocupado} />}
      {acciones.borrar && <Accion icono={Trash2} etiqueta={t("drive.accion.borrar")} onClick={acciones.borrar} disabled={ocupado} peligro />}
      <button
        type="button"
        onClick={onLimpiar}
        aria-label={t("drive.seleccion.ninguna")}
        title={t("drive.seleccion.ninguna")}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Accion({ icono: Icono, etiqueta, onClick, disabled, peligro }: {
  icono: LucideIcon; etiqueta: string; onClick: () => void; disabled?: boolean; peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={etiqueta}
      aria-label={etiqueta}
      className={
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 " +
        (peligro ? "text-destructive" : "text-foreground/80 hover:text-foreground")
      }
    >
      <Icono className="h-4 w-4" />
      <span className="hidden sm:inline">{etiqueta}</span>
    </button>
  );
}
