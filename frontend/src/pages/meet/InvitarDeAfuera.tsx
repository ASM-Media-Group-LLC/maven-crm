import { useState } from "react";
import { UserPlus, Copy, Mail, MessageCircle, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { invocarMeetRoom } from "@/lib/meetLinkInvitado";
import { useLanguage } from "@/hooks/useLanguage";

// «Invitar de afuera» dentro de una llamada: Meet (meet_…) o llamada del
// Messenger (call-…). Pide a la edge meet-room el link directo de invitado y lo
// ofrece para copiar, mandar por WhatsApp o por correo. Quien lo abra escribe su
// nombre y entra, sin cuenta ni sala de espera (Alvaro, 17/11/2026).
//
// Solo lo dibuja quien es supervisor o más (VideoCallPage); igual la edge lo
// vuelve a revisar: esconder el botón no es la seguridad.
export default function InvitarDeAfuera({ livekitRoom }: { livekitRoom: string }) {
  const { t, language } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [vence, setVence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pedirLink = async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await invocarMeetRoom("inviteLink", { livekitRoom });
      setUrl(`${getPublicBaseUrl()}/unirse/${r.link}`);
      setVence(r.expiresAt ?? null);
    } catch (e) {
      setError((e as Error).message || t("meet.invite.error"));
    } finally {
      setCargando(false);
    }
  };

  const abrir = (v: boolean) => {
    setAbierto(v);
    if (v && !url && !cargando) void pedirLink();
  };

  const copiar = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success(t("meet.invite.copied"));
  };

  const mensaje = url ? t("meet.invite.message", { url }) : "";

  const anular = async () => {
    if (!window.confirm(t("meet.invite.revokeConfirm"))) return;
    try {
      await invocarMeetRoom("revokeInviteLinks", { livekitRoom });
      setUrl(null);
      setVence(null);
      setAbierto(false);
      toast.success(t("meet.invite.revoked"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const cuando = vence
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(vence))
    : null;

  return (
    <Popover open={abierto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("meet.invite.button")}
          className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/40 px-3 text-xs text-foreground transition-colors hover:bg-card"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{t("meet.invite.button")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="vidrio w-80 rounded-2xl p-4">
        <p className="text-sm font-semibold text-foreground">{t("meet.invite.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("meet.invite.hint")}</p>

        {cargando && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("meet.invite.loading")}
          </p>
        )}

        {error && !cargando && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-destructive">{error}</p>
            <button type="button" onClick={() => void pedirLink()} className="text-xs font-medium text-primary hover:underline">
              {t("meet.link.retry")}
            </button>
          </div>
        )}

        {url && !cargando && (
          <div className="mt-3 space-y-2">
            <div className="truncate rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-[11px] text-foreground" title={url}>
              {url}
            </div>
            {cuando && <p className="text-[11px] text-muted-foreground">{t("meet.invite.expires", { when: cuando })}</p>}
            <div className="grid grid-cols-1 gap-1.5">
              <button type="button" onClick={() => void copiar()} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                <Copy className="h-3.5 w-3.5" /> {t("meet.invite.copy")}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-foreground hover:bg-card"
              >
                <MessageCircle className="h-3.5 w-3.5" /> {t("meet.invite.whatsapp")}
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(t("meet.invite.subject"))}&body=${encodeURIComponent(mensaje)}`}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-foreground hover:bg-card"
              >
                <Mail className="h-3.5 w-3.5" /> {t("meet.invite.email")}
              </a>
            </div>
            <button type="button" onClick={() => void anular()} className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground hover:text-destructive">
              <Ban className="h-3 w-3" /> {t("meet.invite.revoke")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
