import { useMemo, useState } from "react";
import { Loader2, MessageSquareShare, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatShared } from "@/hooks/ChatProvider";
import { useLanguage } from "@/hooks/useLanguage";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { textoParaElChat, type CorreoACompartir } from "@/lib/correo/compartirEnChat";

type Conversacion = ReturnType<typeof useChatShared>["conversations"][number];

/** Sin tildes ni mayúsculas: «andres» encuentra «Andrés». */
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** «Compartir en el chat» del ⋮ de un mensaje (Keila, 02/10): se elige una
 *  conversación del Messenger y se publica ahí quién mandó el correo, el
 *  asunto, la fecha, un resumen y el enlace para abrirlo en Maven.
 *
 *  ⚠️ Montarlo SOLO abierto: usa la lista de conversaciones del ChatProvider
 *  (la misma instancia de toda la app, no una consulta nueva). */
export default function CompartirEnChatDialog({
  correo, onCerrar,
}: {
  correo: CorreoACompartir;
  onCerrar: () => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { conversations, loading } = useChatShared();
  const [busqueda, setBusqueda] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Solo donde PUEDO escribir: en un grupo «solo admins escriben», si no soy
  // admin el mensaje rebotaría en la base.
  const posibles = useMemo(
    () => conversations.filter((c) =>
      c.msg_permission !== "admins"
      || c.participants.some((p) => p.user_id === user?.id && p.role === "admin")),
    [conversations, user?.id],
  );
  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return q ? posibles.filter((c) => plano(c.displayName ?? "").includes(q)) : posibles;
  }, [posibles, busqueda]);

  const texto = useMemo(() => textoParaElChat(correo, nota, getPublicBaseUrl()), [correo, nota]);

  const enviar = async () => {
    const conv = posibles.find((c) => c.id === elegida);
    if (!conv || !user) return;
    setEnviando(true);
    try {
      // Lo mismo que hace el Messenger al mandar un texto: la fila en
      // chat_messages (de ahí salen el aviso y el push a los demás) y la
      // conversación arriba de la lista.
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conv.id,
        sender_id: user.id,
        content: texto,
        type: "text",
      });
      if (error) throw error;
      void supabase.from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conv.id)
        .then(() => {});
      toast.success(t("mail.share.sent", { name: conv.displayName }));
      onCerrar();
    } catch (e) {
      toast.error(t("mail.share.error"), { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareShare className="h-4 w-4" />
            {t("mail.share.title")}
          </DialogTitle>
          <DialogDescription>{t("mail.share.desc")}</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("mail.share.search")}
            aria-label={t("mail.share.search")}
            autoFocus
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </label>

        <div role="listbox" aria-label={t("mail.share.title")} className="max-h-60 overflow-y-auto rounded-xl border border-border/60 p-1">
          {loading && conversations.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("mail.share.loading")}
            </p>
          ) : visibles.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {posibles.length === 0 ? t("mail.share.noChats") : t("mail.share.noMatch")}
            </p>
          ) : (
            visibles.map((c) => (
              <FilaConversacion
                key={c.id}
                c={c}
                yo={user?.id}
                elegida={elegida === c.id}
                onElegir={() => setElegida(c.id)}
              />
            ))
          )}
        </div>

        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={t("mail.share.note")}
          aria-label={t("mail.share.note")}
          rows={2}
          className="resize-none"
        />

        <details className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t("mail.share.preview")}</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{texto}</p>
        </details>
        {!correo.messageId && (
          <p className="text-xs text-muted-foreground">{t("mail.share.noLink")}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void enviar()} disabled={!elegida || enviando}>
            {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaConversacion({
  c, yo, elegida, onElegir,
}: {
  c: Conversacion;
  yo: string | undefined;
  elegida: boolean;
  onElegir: () => void;
}) {
  const otro = c.type === "direct" ? c.participants.find((p) => p.user_id !== yo) : undefined;
  return (
    <button
      type="button"
      role="option"
      aria-selected={elegida}
      // El nombre de la conversación, sin las iniciales del avatar.
      aria-label={c.displayName}
      onClick={onElegir}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
        elegida ? "bg-primary/12 font-medium ring-1 ring-primary/30" : "hover:bg-muted",
      )}
    >
      {c.type === "group" && !c.avatar_url ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
          <Users className="h-4 w-4" />
        </span>
      ) : (
        <UserAvatar
          name={c.displayName}
          src={c.avatar_url || otro?.profile?.avatar_url}
          seed={otro?.profile?.avatar_seed ?? undefined}
          size="sm"
          className="shrink-0"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
    </button>
  );
}
