import { useEffect, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectorDePersonas } from "@/components/SelectorDePersonas";
import { invokeRecordings, type RecordingRow } from "@/hooks/useRecordings";
import { diffDestinatarios } from "@/lib/compartirGrabacion";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir } from "@/lib/i18n";

// Compartir una grabación con gente de Maven: a quien elijas le aparece en
// SU lista de Grabaciones y se le avisa por correo. La lista completa la
// guarda la edge (action "share"); acá solo se elige.
export function CompartirGrabacionDialog({
  grabacion, miId, onClose,
}: { grabacion: RecordingRow | null; miId: string | null; onClose: () => void }) {
  const { t } = useLanguage();
  const [actuales, setActuales] = useState<string[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!grabacion) return;
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const res = await invokeRecordings("recipients", { recording_id: grabacion.id });
        const ids = ((res.user_ids as string[]) ?? []).filter((u) => u !== grabacion.started_by);
        if (!vivo) return;
        setActuales(ids);
        setElegidos(ids);
      } catch (e) {
        // traducir() y no t(): el efecto solo depende de la grabación.
        toast.error((e as Error).message || traducir("grab.share.loadError"));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [grabacion]);

  const guardar = async () => {
    if (!grabacion) return;
    const { agregar, quitar } = diffDestinatarios(actuales, elegidos, [grabacion.started_by]);
    if (agregar.length === 0 && quitar.length === 0) { onClose(); return; }
    setGuardando(true);
    try {
      const res = await invokeRecordings("share", { recording_id: grabacion.id, user_ids: elegidos });
      const emails = (res.emails as number) ?? 0;
      const partes: string[] = [];
      if (agregar.length) partes.push(t(agregar.length === 1 ? "grab.share.addedOne" : "grab.share.addedMany", { n: agregar.length }));
      if (quitar.length) partes.push(t(quitar.length === 1 ? "grab.share.removedOne" : "grab.share.removedMany", { n: quitar.length }));
      toast.success(t("grab.share.done", { parts: partes.join(" · ") }), {
        description: emails > 0 ? t("grab.share.emailed", { n: emails }) : undefined,
      });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || t("grab.share.error"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!grabacion} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" /> {t("grab.share.title")}</DialogTitle>
          <DialogDescription>
            {t("grab.share.desc", { name: grabacion?.title || grabacion?.room_name || "" })}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <SelectorDePersonas
            value={elegidos}
            onChange={setElegidos}
            excluir={[miId, grabacion?.started_by].filter((x): x is string => !!x)}
          />
        )}

        <DialogFooter className="flex-row items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>{t("common.cancel")}</Button>
          <Button onClick={() => void guardar()} disabled={guardando || cargando} className="gap-1.5 rounded-full">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {t("common.save")}

          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
