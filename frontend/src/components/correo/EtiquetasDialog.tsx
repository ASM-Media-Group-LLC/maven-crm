import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  arbolDeEtiquetas, ramaDe, useActualizarEtiqueta, useBorrarEtiqueta, useEtiquetas,
  type CambiosDeEtiqueta, type EtiquetaDeCorreo, type NodoEtiqueta,
} from "@/hooks/useEtiquetasCorreo";
import EtiquetaFormDialog from "@/components/correo/etiquetas/EtiquetaFormDialog";
import PastillaEtiqueta from "@/components/correo/etiquetas/PastillaEtiqueta";

/** «Administrar etiquetas»: la pestaña Etiquetas de la configuración de
 *  Gmail. Una fila por etiqueta —en el orden del árbol— con las mismas dos
 *  columnas de mostrar/ocultar que el ⋮ y las acciones «Quitar» y «Editar».
 *  La opción elegida va en negrita y sin link, como en Gmail. */
export default function EtiquetasDialog(
  { abierto, onCerrar }: { abierto: boolean; onCerrar: () => void },
) {
  const { t } = useLanguage();
  const etiquetas = useEtiquetas();
  const actualizar = useActualizarEtiqueta();
  const borrar = useBorrarEtiqueta();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<EtiquetaDeCorreo | null>(null);
  const [eliminando, setEliminando] = useState<NodoEtiqueta | null>(null);

  const todas = etiquetas.data ?? [];
  const nodos = useMemo(() => arbolDeEtiquetas(etiquetas.data ?? []), [etiquetas.data]);

  const cambiar = (id: string, cambios: CambiosDeEtiqueta) =>
    actualizar.mutate({ id, cambios }, {
      onError: (e) => toast.error(t("mail.labels.saveError"), { description: (e as Error).message }),
    });

  const hijasDe = (n: NodoEtiqueta) => ramaDe(n.etiqueta.id, todas).size - 1;

  return (
    <>
      <Dialog open={abierto && !creando && !editando && !eliminando} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("mail.labels.manage")}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto">
            {todas.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t("mail.labels.empty")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 font-medium">{t("mail.labels")}</th>
                    <th className="py-2 pr-3 font-medium">{t("mail.labels.menu.inLabelList")}</th>
                    <th className="py-2 pr-3 font-medium">{t("mail.labels.menu.inMessageList")}</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {nodos.map((n) => {
                    const e = n.etiqueta;
                    return (
                      <tr key={e.id} className="border-b border-border/40 align-middle">
                        <td className="py-2 pr-3">
                          <span className="inline-flex max-w-[16rem] items-center" style={{ paddingLeft: n.nivel * 14 }}>
                            <PastillaEtiqueta nombre={e.nombre} color={e.color} className="max-w-full text-xs" />
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <Opciones
                            opciones={[
                              { valor: "mostrar", texto: t("mail.labels.menu.show") },
                              { valor: "ocultar", texto: t("mail.labels.menu.hide") },
                              { valor: "si_no_leidas", texto: t("mail.labels.menu.showIfUnread") },
                            ]}
                            actual={e.enListaEtiquetas}
                            onElegir={(v) => cambiar(e.id, { enListaEtiquetas: v })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Opciones
                            opciones={[
                              { valor: true, texto: t("mail.labels.menu.show") },
                              { valor: false, texto: t("mail.labels.menu.hide") },
                            ]}
                            actual={e.enListaMensajes}
                            onElegir={(v) => cambiar(e.id, { enListaMensajes: v })}
                          />
                        </td>
                        <td className="whitespace-nowrap py-2 text-right">
                          <button type="button" className="text-primary hover:underline" onClick={() => setEliminando(n)}>
                            {t("mail.labels.remove.confirm")}
                          </button>
                          <button type="button" className="ml-3 text-primary hover:underline" onClick={() => setEditando(e)}>
                            {t("mail.labels.menu.edit")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <Button variant="outline" className="rounded-full" onClick={() => setCreando(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("mail.labels.new")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {creando && <EtiquetaFormDialog onCerrar={() => setCreando(false)} />}
      {editando && <EtiquetaFormDialog etiqueta={editando} onCerrar={() => setEditando(null)} />}
      <AlertDialog open={!!eliminando} onOpenChange={(v) => !v && setEliminando(null)}>
        {eliminando && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("mail.labels.remove.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("mail.labels.remove.body", { name: eliminando.ruta })}
                {hijasDe(eliminando) > 0 && (
                  <> {t("mail.labels.remove.withSublabels", { n: hijasDe(eliminando) })}</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("mail.labels.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => borrar.mutate(eliminando.etiqueta.id, {
                  // Se avisa que se quita de los correos, porque borrar una
                  // etiqueta NO borra correo y conviene que quede claro.
                  onSuccess: () => toast.success(t("mail.labels.deleted"), {
                    description: t("mail.labels.deletedHelp"),
                  }),
                  onError: (err) => toast.error((err as Error).message),
                })}
              >
                {t("mail.labels.remove.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}

function Opciones<T extends string | boolean>({
  opciones, actual, onElegir,
}: {
  opciones: { valor: T; texto: string }[];
  actual: T;
  onElegir: (v: T) => void;
}) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {opciones.map((o) => (
        o.valor === actual ? (
          <span key={String(o.valor)} className="font-semibold text-foreground">{o.texto}</span>
        ) : (
          <button
            key={String(o.valor)}
            type="button"
            onClick={() => onElegir(o.valor)}
            className={cn("text-primary hover:underline")}
          >
            {o.texto}
          </button>
        )
      ))}
    </span>
  );
}
