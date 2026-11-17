import { useState } from "react";
import { CalendarPlus, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { invocarMeetRoom } from "@/lib/meetLinkInvitado";
import { useLanguage } from "@/hooks/useLanguage";

// «Agendar un Meet para una hora con invitación por correo con el link»
// (Alvaro, 17/11/2026). La edge meet-room (acción schedule) crea la reunión,
// el link directo de invitado y manda el correo armado del lado del servidor.
// Si el correo no está configurado, la reunión igual queda y el link se copia.
export default function AgendarMeet({ onAgendada }: { onAgendada?: () => void }) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cuando, setCuando] = useState("");
  const [correos, setCorreos] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  const cerrar = (v: boolean) => {
    setAbierto(v);
    if (!v) { setListo(null); setNombre(""); setCuando(""); setCorreos(""); }
  };

  const agendar = async () => {
    const fecha = cuando ? new Date(cuando) : null;
    if (!fecha || isNaN(fecha.getTime())) { toast.error(t("meet.schedule.badDate")); return; }
    setEnviando(true);
    try {
      const r = await invocarMeetRoom("schedule", {
        name: nombre.trim(),
        startsAt: fecha.toISOString(),
        emails: correos,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const url = `${getPublicBaseUrl()}/unirse/${r.link}`;
      setListo(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      const c = r.correo ?? {};
      if (c.pedidos && !c.configurado) toast.warning(t("meet.schedule.noMail"));
      else if (c.enviados) toast.success(t("meet.schedule.sent", { n: c.enviados }));
      else toast.success(t("meet.schedule.done"));
      if (c.fallidos?.length) toast.error(t("meet.schedule.someFailed", { list: c.fallidos.join(", ") }));
      onAgendada?.();
    } catch (e) {
      toast.error((e as Error).message || t("meet.schedule.error"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="lg" className="w-full gap-2 rounded-full px-6 md:w-auto" onClick={() => setAbierto(true)}>
        <CalendarPlus className="h-5 w-5" />
        {t("meet.schedule.button")}
      </Button>
      <Dialog open={abierto} onOpenChange={cerrar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("meet.schedule.title")}</DialogTitle></DialogHeader>
          {listo ? (
            <div className="space-y-3 py-1">
              <p className="text-sm text-foreground">{t("meet.schedule.done")}</p>
              <div className="truncate rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-[11px]" title={listo}>{listo}</div>
              <Button
                className="w-full gap-2 rounded-full"
                onClick={() => { void navigator.clipboard.writeText(listo).catch(() => {}); toast.success(t("meet.invite.copied")); }}
              >
                <Copy className="h-4 w-4" /> {t("meet.invite.copy")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="agendar-nombre">{t("meet.schedule.name")}</Label>
                <Input id="agendar-nombre" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 80))} placeholder={t("meet.namePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agendar-cuando">{t("meet.schedule.when")}</Label>
                <Input id="agendar-cuando" type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agendar-correos">{t("meet.schedule.emails")}</Label>
                <Textarea id="agendar-correos" rows={3} value={correos} onChange={(e) => setCorreos(e.target.value)} placeholder={t("meet.schedule.emailsPlaceholder")} />
                <p className="text-[11px] text-muted-foreground">{t("meet.schedule.emailsHint")}</p>
              </div>
            </div>
          )}
          {!listo && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => cerrar(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => void agendar()} disabled={enviando || !cuando} className="gap-2">
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("meet.schedule.submit")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
