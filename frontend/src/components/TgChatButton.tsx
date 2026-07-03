// Botón "Telegram" (al lado del de WhatsApp). Abre el chat DENTRO de la bandeja de
// Maven vía la edge `tg-inbox-open`, que resuelve el peer server-side y crea/reutiliza
// la conversación. Igual que WhatsApp: si hay más de una línea, deja ELEGIR desde qué
// línea abrir (dropdown "¿Desde qué línea?"). A diferencia de WhatsApp (wa.me por
// teléfono), Telegram SOLO abre en frío por @username → si el contacto no tiene usuario
// de Telegram, el edge devuelve un aviso claro (no un error).
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyTgChannels } from "@/hooks/useMyTgChannels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Loader2, ChevronDown } from "lucide-react";

export function TgChatButton({
  creatorId = null,
  contactId = null,
  telegramUsername = null,
  name = null,
  className,
}: {
  creatorId?: string | null;
  contactId?: string | null;
  /** @username directo (si no, el edge lo saca de creators.telegram_handle por creatorId). */
  telegramUsername?: string | null;
  name?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { data: channels = [] } = useMyTgChannels();
  const [busy, setBusy] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  // Sin ningún identificador utilizable → no renderiza (no ocupa espacio).
  if (!creatorId && !contactId && !telegramUsername) return null;

  // accountId = línea elegida (o null → el edge usa la default del gateway).
  const open = async (accountId: string | null) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tg-inbox-open", {
      body: { creator_id: creatorId, contact_id: contactId, telegram_username: telegramUsername, name, account_id: accountId },
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string; conversation_id?: string } | null;
    if (res && res.ok === false) { setGateMsg(res.error || "No se pudo abrir el chat de Telegram."); return; }
    if (error || !res?.conversation_id) {
      toast({ title: "No se pudo abrir el chat", description: error?.message || "Error", variant: "destructive" });
      return;
    }
    const labels: Record<string, string> = { contactos: "Contactos", creadores: "Creadoras", closers: "Closers" };
    const seg = location.pathname.split("/").filter(Boolean)[0] || "";
    navigate(`/telegram/bandeja?c=${res.conversation_id}`, {
      state: { backTo: location.pathname + location.search, backLabel: labels[seg] || "atrás" },
    });
  };

  const btnClass = className ?? "h-7 gap-1.5 px-2 text-xs text-sky-600 hover:text-sky-700";

  // Una sola línea (o ninguna registrada aún) → abre directo con la default.
  const trigger = channels.length <= 1 ? (
    <Button type="button" variant="ghost" size="sm" className={btnClass} disabled={busy} onClick={() => open(channels[0]?.account_id ?? null)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TelegramIcon className="h-3.5 w-3.5" />} Telegram
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={btnClass} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TelegramIcon className="h-3.5 w-3.5" />} Telegram <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">¿Desde qué línea?</div>
        {channels.map((ch) => (
          <DropdownMenuItem key={ch.account_id} onClick={() => open(ch.account_id)}>
            {ch.label || ch.account_id}
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
            <AlertDialogTitle>Telegram</AlertDialogTitle>
            <AlertDialogDescription>{gateMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGateMsg(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
