// Botón "WhatsApp" estilo Closers: NO muestra el número (ni en pantalla ni en el
// href). Abre el chat DENTRO de la bandeja de Maven vía `wa-inbox-open`, que
// resuelve el número server-side (masking de fábrica). Reutiliza la misma lógica
// que LeadWhatsappButton de Closers, generalizada para Contactos/Creadores.
//
// `phone` debe ser E.164 (con "+"); `closerCreatorId` es opcional (para leads de
// closers). Si no hay teléfono ni lead → muestra "—". Si el usuario no tiene
// canales de WhatsApp asignados → "WhatsApp" deshabilitado.
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyWaChannels } from "@/hooks/useMyWaChannels";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Loader2, ChevronDown } from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";

export function WaChatButton({
  phone,
  closerCreatorId = null,
  contactId = null,
  creatorId = null,
  name = null,
  className,
}: {
  phone: string | null | undefined;
  closerCreatorId?: string | null;
  /** id de closers_contacts: el edge resuelve el teléfono SERVER-SIDE (el número
   *  nunca viaja al browser; closers_contacts.phone está revocado para no-admin). */
  contactId?: string | null;
  /** id de creators: el edge resuelve el teléfono SERVER-SIDE (whatsapp_number/
   *  phone_e164/phone están enmascarados/revocados para no-admin). */
  creatorId?: string | null;
  /** Nombre a usar como display_name del contacto si aún no lo tiene (ej. el
   *  nombre de la creadora/contacto), para que la conversación no salga "sin nombre". */
  name?: string | null;
  className?: string;
}) {
  const { data: channels = [] } = useMyWaChannels();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  const open = async (channelId: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-open", {
      body: { channel_id: channelId, closer_creator_id: closerCreatorId, contact_id: contactId ?? null, creator_id: creatorId ?? null, phone: phone ?? null, name: name ?? null },
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string; conversation_id?: string } | null;
    // Rechazo "suave" del gating (HTTP 200 + ok:false): no es un error, es un aviso de
    // que el lead no es tuyo → popup claro, no el toast rojo de error.
    // res.error lo escribe el servidor (wa-inbox-open) y se muestra tal cual.
    if (res && res.ok === false) {
      setGateMsg(res.error || t("shared.openChat.waNotAvailable"));
      return;
    }
    if (error || !res?.conversation_id) {
      toast({ title: t("shared.openChat.failed"), description: error?.message || t("common.error"), variant: "destructive" });
      return;
    }
    // Recordamos de dónde venimos para mostrar "← Volver" en la bandeja y no perder
    // la pantalla/filtros del usuario (Contactos restaura su estado desde sessionStorage).
    // La clave es el primer tramo de la ruta (dato); la etiqueta, del diccionario.
    const labels: Record<string, TranslationKey> = { contactos: "shared.openChat.fromContacts", creadores: "shared.openChat.fromCreators", closers: "nav.closers" };
    const seg = location.pathname.split("/").filter(Boolean)[0] || "";
    // Desde otra ruta: en español "atrás" como siempre; en inglés "the previous page".
    navigate(`/inbox?c=${res.conversation_id}`, {
      state: { backTo: location.pathname + location.search, backLabel: t(labels[seg] ?? "shared.openChat.fromPrevious") },
    });
  };

  if (!phone && !closerCreatorId && !contactId) return <span className="text-xs text-muted-foreground">—</span>;
  if (channels.length === 0) {
    return <span className="text-xs text-muted-foreground" title={t("shared.openChat.waNoChannels")}>WhatsApp</span>;
  }
  const btnClass = className ?? "h-7 gap-1 text-xs text-whatsapp hover:text-whatsapp/90";
  const trigger = channels.length === 1 ? (
    <Button variant="ghost" size="sm" className={btnClass} disabled={busy} onClick={() => open(channels[0].id)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon className="h-3.5 w-3.5" />} WhatsApp
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={btnClass} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon className="h-3.5 w-3.5" />} WhatsApp <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("shared.openChat.whichChannel")}</div>
        {channels.map((ch) => (
          <DropdownMenuItem key={ch.id} onClick={() => open(ch.id)}>
            {ch.label || ch.evolution_instance}
            <span className="ml-1.5 text-[10px] text-muted-foreground">{ch.department}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <>
      {trigger}
      <AlertDialog open={!!gateMsg} onOpenChange={(o) => { if (!o) setGateMsg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shared.openChat.waNotYours")}</AlertDialogTitle>
            <AlertDialogDescription>{gateMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGateMsg(null)}>{t("common.understood")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Resuelve un teléfono a E.164 (con "+") desde campos sueltos. Devuelve null si no
// se puede (entonces el botón muestra "—" en vez de exponer algo inválido).
export function toE164(opts: { whatsapp?: string | null; countryCode?: string | null; phone?: string | null }): string | null {
  const { whatsapp, countryCode, phone } = opts;
  const w = (whatsapp ?? "").trim();
  if (w) {
    if (w.startsWith("+")) return w;
    const d = w.replace(/[^0-9]/g, "");
    if (d.length >= 8) return "+" + d; // número internacional sin "+"
  }
  if ((countryCode ?? "").trim() && (phone ?? "").trim()) {
    const cc = (countryCode as string).trim();
    const p = (phone as string).trim().replace(/[^0-9]/g, "");
    if (p) return (cc.startsWith("+") ? cc : "+" + cc.replace(/[^0-9]/g, "")) + p;
  }
  const ph = (phone ?? "").trim();
  if (ph) {
    if (ph.startsWith("+")) return ph;
    const d = ph.replace(/[^0-9]/g, "");
    if (d.length >= 8) return "+" + d;
  }
  return null;
}
