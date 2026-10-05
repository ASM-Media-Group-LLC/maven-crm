// Botón "Telegram" (al lado del de WhatsApp). Abre el chat DENTRO de la bandeja de
// Maven vía la edge `tg-inbox-open`, que contacta al creador por su TELÉFONO PERSONAL
// (importContacts server-side; NO el canal de promo). Igual que WhatsApp: si hay más de
// una línea, deja ELEGIR desde qué línea abrir (dropdown "¿Desde qué línea?") — y esa es
// la cuenta que importa el contacto. Si el número no está en Telegram, aviso claro.
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyTgChannels } from "@/hooks/useMyTgChannels";
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
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Loader2, ChevronDown } from "lucide-react";

export function TgChatButton({
  creatorId = null,
  contactId = null,
  closerCreatorId = null,
  phone = null,
  telegramUsername = null,
  name = null,
  className,
  compact = false,
}: {
  creatorId?: string | null;
  contactId?: string | null;
  /** Lead de Closers (closer_creators.id). El edge resuelve el teléfono server-side vía
   *  source_contact_id y aplica el gating por dueño (el closer solo abre SUS leads). */
  closerCreatorId?: string | null;
  /** Teléfono E.164 del creador/contacto (con "+"). El edge lo resuelve por importContacts.
   *  Si no viene, el edge lo saca del teléfono del creator/contact/lead por id. */
  phone?: string | null;
  /** @username personal directo (opcional). NO es el canal de promo (telegram_handle). */
  telegramUsername?: string | null;
  name?: string | null;
  className?: string;
  /** Solo ícono (sin la palabra "Telegram") — para tablas compactas. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: channels = [] } = useMyTgChannels();
  const [busy, setBusy] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  // Sin nada para contactar → no renderiza (no ocupa espacio).
  if (!creatorId && !contactId && !closerCreatorId && !phone && !telegramUsername) return null;

  // accountId = línea elegida (o null → el edge usa la default del gateway).
  const open = async (accountId: string | null) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tg-inbox-open", {
      body: { creator_id: creatorId, contact_id: contactId, closer_creator_id: closerCreatorId, phone, telegram_username: telegramUsername, name, account_id: accountId },
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string; conversation_id?: string } | null;
    // res.error lo escribe el servidor (tg-inbox-open) y se muestra tal cual.
    if (res && res.ok === false) { setGateMsg(res.error || t("shared.openChat.tgFailed")); return; }
    if (error || !res?.conversation_id) {
      toast({ title: t("shared.openChat.failed"), description: error?.message || t("common.error"), variant: "destructive" });
      return;
    }
    // La clave es el primer tramo de la ruta (dato); la etiqueta, del diccionario.
    const labels: Record<string, TranslationKey> = { contactos: "shared.openChat.fromContacts", creadores: "shared.openChat.fromCreators", closers: "nav.closers" };
    const seg = location.pathname.split("/").filter(Boolean)[0] || "";
    // Desde otra ruta: en español "atrás" como siempre; en inglés "the previous page".
    navigate(`/telegram/bandeja?c=${res.conversation_id}`, {
      state: { backTo: location.pathname + location.search, backLabel: t(labels[seg] ?? "shared.openChat.fromPrevious") },
    });
  };

  const btnClass = className ?? "h-7 gap-1.5 px-2 text-xs text-telegram hover:text-telegram/80";

  // Una sola línea (o ninguna registrada aún) → abre directo con la default.
  const trigger = channels.length <= 1 ? (
    <Button type="button" variant="ghost" size="sm" className={btnClass} disabled={busy} title={compact ? "Telegram" : undefined} onClick={() => open(channels[0]?.account_id ?? null)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TelegramIcon className="h-3.5 w-3.5" />}{compact ? "" : " Telegram"}
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={btnClass} disabled={busy} title={compact ? "Telegram" : undefined}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TelegramIcon className="h-3.5 w-3.5" />}{compact ? "" : " Telegram"} <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("shared.openChat.whichLine")}</div>
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
            <AlertDialogAction onClick={() => setGateMsg(null)}>{t("common.understood")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
