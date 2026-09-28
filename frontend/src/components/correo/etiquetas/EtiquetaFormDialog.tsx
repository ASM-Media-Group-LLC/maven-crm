import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import {
  arbolDeEtiquetas, ramaDe, useActualizarEtiqueta, useCrearEtiqueta, useEtiquetas,
  type EtiquetaDeCorreo,
} from "@/hooks/useEtiquetasCorreo";

/** El diálogo de Gmail para «Crear etiqueta nueva», «Agregar subetiqueta» y
 *  «Modificar»: el nombre y la casilla «Anidar etiqueta en:» con la madre.
 *
 *  - Sin `etiqueta` = crear. `madreInicial` llega marcada cuando se abrió desde
 *    «Agregar subetiqueta».
 *  - Con `etiqueta` = editar.
 *
 *  Al editar NO se ofrece anidarla en sí misma ni en una de sus hijas: sería
 *  un ciclo (la base también lo frena, pero el menú no debe proponerlo). */
export default function EtiquetaFormDialog({
  etiqueta, madreInicial = null, nombreInicial, onCerrar, onCreada,
}: {
  etiqueta?: EtiquetaDeCorreo;
  madreInicial?: string | null;
  /** Lo que ya se escribió en el buscador de «Etiquetar como» / «Mover a». */
  nombreInicial?: string;
  onCerrar: () => void;
  /** Para etiquetar lo seleccionado apenas se crea, como el «Crear nueva» del
   *  «Etiquetar como» de Gmail. */
  onCreada?: (id: string, nombre: string) => void;
}) {
  const { t } = useLanguage();
  const etiquetas = useEtiquetas();
  const crear = useCrearEtiqueta();
  const actualizar = useActualizarEtiqueta();
  const editando = !!etiqueta;

  const [nombre, setNombre] = useState(etiqueta?.nombre ?? nombreInicial ?? "");
  const [anidar, setAnidar] = useState(!!(etiqueta?.parentId ?? madreInicial));
  const [madre, setMadre] = useState<string | null>(etiqueta?.parentId ?? madreInicial);

  const opciones = useMemo(() => {
    const todas = etiquetas.data ?? [];
    const prohibidas = etiqueta ? ramaDe(etiqueta.id, todas) : new Set<string>();
    return arbolDeEtiquetas(todas).filter((n) => !prohibidas.has(n.etiqueta.id));
  }, [etiquetas.data, etiqueta]);

  const parentId = anidar ? madre : null;
  const listo = nombre.trim().length > 0 && (!anidar || !!madre);
  const ocupado = crear.isPending || actualizar.isPending;

  const alFallar = (e: unknown) => {
    const msg = (e as Error).message ?? "";
    toast.error(/duplicate|unique/i.test(msg) ? t("mail.labels.form.duplicateHere") : msg || t("mail.labels.saveError"));
  };

  const guardar = () => {
    if (!listo || ocupado) return;
    const n = nombre.trim();
    if (editando) {
      actualizar.mutate({ id: etiqueta.id, cambios: { nombre: n, parentId } }, {
        onSuccess: () => { toast.success(t("mail.labels.form.saved")); onCerrar(); },
        onError: alFallar,
      });
    } else {
      crear.mutate({ nombre: n, parentId }, {
        onSuccess: (id) => {
          toast.success(t("mail.labels.created"));
          onCreada?.(id, n);
          onCerrar();
        },
        onError: alFallar,
      });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(editando ? "mail.labels.form.editTitle" : "mail.labels.form.newTitle")}</DialogTitle>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); guardar(); }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">
              {t(editando ? "mail.labels.form.name" : "mail.labels.form.newName")}
            </span>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={225}
              autoFocus
            />
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={anidar}
                onCheckedChange={(v) => setAnidar(v === true)}
                disabled={opciones.length === 0}
              />
              {t("mail.labels.form.nest")}
            </label>
            <Select
              value={madre ?? undefined}
              onValueChange={(v) => { setMadre(v); setAnidar(true); }}
              disabled={!anidar || opciones.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("mail.labels.form.pickParent")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {opciones.map((n) => (
                  <SelectItem key={n.etiqueta.id} value={n.etiqueta.id}>
                    {n.ruta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>
              {t("mail.labels.cancel")}
            </Button>
            <Button type="submit" disabled={!listo || ocupado}>
              {t(editando ? "mail.labels.form.save" : "mail.labels.form.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
