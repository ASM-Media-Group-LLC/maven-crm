import { useState } from "react";
import { Download, History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import { useMiRolDrive, type DriveItem } from "@/hooks/useDrive";
import { bajarVersion, useRestaurarVersion, useVersionesDrive, type VersionDrive } from "@/hooks/useVersionesDrive";
import { tamano } from "@/lib/drive/formato";

/**
 * «Administrar versiones», como el de Google Drive: las versiones de un
 * archivo editado en la Oficina, de la más nueva a la más vieja, con fecha,
 * quién y tamaño. Cualquiera que lo ve puede bajar una; restaurarla, solo
 * quien puede editarlo (dueño o editor: lo mismo que pide la edge).
 */
export default function DriveVersionesDialog({
  item, nombreDe, onCerrar,
}: {
  item: Pick<DriveItem, "id" | "nombre">;
  /** El nombre de una persona (como en la lista). */
  nombreDe: (id: string | null) => string;
  onCerrar: () => void;
}) {
  const { t } = useLanguage();
  const fechas = useFechasDeArchivos();
  const versiones = useVersionesDrive(item.id);
  const rol = useMiRolDrive(item.id);
  const puedeEditar = rol.data === "dueno" || rol.data === "editor";
  const restaurar = useRestaurarVersion();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);

  const lista = versiones.data ?? [];
  const bajar = async (v: VersionDrive) => {
    setBajando(v.id);
    try { await bajarVersion(v.id); } catch (e) { toast.error(t("drive.versiones.errorBajar", { motivo: (e as Error).message })); }
    finally { setBajando(null); }
  };
  const confirmarRestaurar = (v: VersionDrive) => restaurar.mutate(v.id, {
    onSuccess: () => { setConfirmando(null); toast.success(t("drive.versiones.restaurada", { fecha: fechas.completa(v.created_at) })); },
    onError: (e) => toast.error(t("drive.versiones.errorRestaurar", { motivo: (e as Error).message })),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t("drive.versiones.titulo")}</DialogTitle>
          <DialogDescription className="break-words">{t("drive.versiones.ayuda", { name: item.nombre })}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[8rem] flex-1 overflow-y-auto rounded-panel border border-border/60">
          {versiones.isLoading ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : versiones.error ? (
            <p className="p-4 text-sm text-destructive">{t("drive.versiones.error")}: {(versiones.error as Error).message}</p>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <History className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t("drive.versiones.vacio")}</p>
            </div>
          ) : (
            <ul>
              {lista.map((v, n) => {
                const quien = v.saved_by ? nombreDe(v.saved_by) : null;
                const esOriginal = n === lista.length - 1;
                return (
                  <li key={v.id} className={cn("border-b border-border/40 px-3 py-2.5 last:border-b-0", v.actual && "bg-primary/5")}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                          <time dateTime={v.created_at}>{fechas.completa(v.created_at)}</time>
                          {v.actual && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">{t("drive.versiones.actual")}</span>
                          )}
                          {esOriginal && !v.actual && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("drive.versiones.original")}</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {quien ? t("drive.versiones.por", { name: quien }) : t("drive.versiones.sinAutor")} · {tamano(v.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void bajar(v)}
                        disabled={bajando === v.id}
                        aria-label={t("drive.versiones.descargarLa", { fecha: fechas.completa(v.created_at) })}
                      >
                        {bajando === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        <span className="ml-1.5 hidden sm:inline">{t("drive.accion.descargar")}</span>
                      </Button>
                      {puedeEditar && !v.actual && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmando(v.id)}
                          disabled={restaurar.isPending}
                          aria-label={t("drive.versiones.restaurarLa", { fecha: fechas.completa(v.created_at) })}
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="ml-1.5 hidden sm:inline">{t("drive.versiones.restaurar")}</span>
                        </Button>
                      )}
                    </div>
                    {confirmando === v.id && (
                      <div role="alert" className="mt-2 flex flex-col gap-2 rounded-control bg-muted/60 p-2.5 text-xs sm:flex-row sm:items-center">
                        <p className="min-w-0 flex-1">{t("drive.versiones.confirmar")}</p>
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(null)}>{t("drive.cancelar")}</Button>
                          <Button type="button" size="sm" onClick={() => confirmarRestaurar(v)} disabled={restaurar.isPending}>
                            {restaurar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                            {t("drive.versiones.restaurar")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!puedeEditar && rol.isSuccess && lista.length > 1 && (
          <p className="text-xs text-muted-foreground">{t("drive.versiones.soloEditores")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
