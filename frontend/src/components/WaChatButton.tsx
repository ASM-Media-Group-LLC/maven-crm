// Botón "WhatsApp" estilo Closers: NO muestra el número (ni en pantalla ni en el
// href). Abre el chat DENTRO de la bandeja de Maven vía `wa-inbox-open`, que
// resuelve el número server-side (masking de fábrica). Reutiliza la misma lógica
// que LeadWhatsappButton de Closers, generalizada para Contactos/Creadores.
//
// `phone` debe ser E.164 (con "+"); `closerCreatorId` es opcional (para leads de
// closers). Si no hay teléfono ni lead → muestra "—". Si el usuario no tiene
// canales de WhatsApp asignados → "WhatsApp" deshabilitado.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyWaChannels } from "@/hooks/useMyWaChannels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, Loader2, ChevronDown } from "lucide-react";

export function WaChatButton({
  phone,
  closerCreatorId = null,
  className,
}: {
  phone: string | null | undefined;
  closerCreatorId?: string | null;
  className?: string;
}) {
  const { data: channels = [] } = useMyWaChannels();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const open = async (channelId: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-open", {
      body: { channel_id: channelId, closer_creator_id: closerCreatorId, phone: phone ?? null },
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string; conversation_id?: string } | null;
    if (error || !res?.ok || !res.conversation_id) {
      toast({ title: "No se pudo abrir el chat", description: res?.error || error?.message || "Error", variant: "destructive" });
      return;
    }
    navigate(`/inbox?c=${res.conversation_id}`);
  };

  if (!phone && !closerCreatorId) return <span className="text-xs text-muted-foreground">—</span>;
  if (channels.length === 0) {
    return <span className="text-xs text-muted-foreground" title="No tenés canales de WhatsApp asignados">WhatsApp</span>;
  }
  const btnClass = className ?? "h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700";
  if (channels.length === 1) {
    return (
      <Button variant="ghost" size="sm" className={btnClass} disabled={busy} onClick={() => open(channels[0].id)}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={btnClass} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">¿Desde qué canal?</div>
        {channels.map((ch) => (
          <DropdownMenuItem key={ch.id} onClick={() => open(ch.id)}>
            {ch.label || ch.evolution_instance}
            <span className="ml-1.5 text-[10px] text-muted-foreground">{ch.department}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
