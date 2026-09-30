import { useEffect, useState } from "react";
import { Bot, Minus, X } from "lucide-react";
import ClariAiChat from "./ClariAiChat";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";

// ClariAvatar — círculo con la imagen del personaje en /clari-avatar.svg.
// Si la imagen falla a cargar (404, network), cae a un Bot icon sobre
// fondo gradient para que el botón nunca quede "vacío".
const ClariAvatar = ({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) => {
  const [errored, setErrored] = useState(false);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ${className}`}
      style={{ width: size, height: size }}
    >
      {errored ? (
        <Bot style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <img
          src="/clari-avatar.svg"
          alt="Clari AI"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
};

// ── Posición ──────────────────────────────────────────────────────────
// El botón YA NO se ubica ni se arrastra solo: vive dentro del MUELLE flotante
// (la columna de la esquina, con el botón de Mensajes encima) y es el muelle
// entero el que se arrastra. La posición, el clampeo y el guardado están en
// hooks/useMuelleFlotante — incluida la clave vieja "clari.fab.pos", para que
// a quien lo tenía parkeado en algún lado no se le mueva de lugar.

// ClariAiFab — botón de Clari (dentro del muelle) + ventana de chat estilo
// Facebook Messenger desktop. `anclarPanel` lo da el muelle: la ventana queda
// pegada a él (arriba si hay lugar, sino abajo) y lo sigue cuando lo movés.
const ClariAiFab = ({ anclarPanel }: { anclarPanel: (ancho: number, alto: number) => React.CSSProperties }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { createConversation } = useAiConversations();
  // Modo del chat: "help" = soporte de la app (clari-help); "crm" = orquestador
  // cross-CRM con tools (ai-orchestrator). El modo CRM es solo para staff.
  const { isAdmin, role } = useUserRole();
  const isStaff = isAdmin || role === "owner" || role === "manager";
  const [mode, setMode] = useState<"help" | "crm">("help");

  const switchMode = (m: "help" | "crm") => {
    if (m === mode) return;
    setMode(m);
    // Conversación fresca para el modo nuevo (no mezclar soporte con CRM).
    // El título se GUARDA en la base (ai_conversations): va en español, no se traduce.
    setConversationId(null);
    createConversation
      .mutateAsync(m === "crm" ? "Clari · CRM" : "Clari · soporte")
      .then((conv) => setConversationId(conv.id))
      .catch((e) => console.error("clari: no se pudo crear conversación", e));
  };

  useEffect(() => {
    if (!open || conversationId) return;
    let cancelled = false;
    createConversation
      .mutateAsync("Clari · soporte")
      .then((conv) => {
        if (!cancelled) setConversationId(conv.id);
      })
      .catch((e) => {
        console.error("clari: no se pudo crear conversación", e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setHasActivity(true);
  };

  // La ventana se ancla al muelle: arriba si hay lugar, si no abajo, y hacia el
  // lado donde haya espacio. Ese cálculo ahora lo hace el muelle por todos.
  const winStyle = anclarPanel(440, 620);

  return (
    <>
      {/* Botón de Clari. El arrastre lo maneja el muelle que lo contiene, así
          que aquí alcanza con un onClick normal. */}
      <button
        type="button"
        onClick={() => setOpen((o) => { if (!o) setHasActivity(true); return !o; })}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg ring-2 ring-primary/30 transition-[box-shadow,transform] duration-200 hover:shadow-xl hover:ring-primary/60"
        aria-label={open ? t("shared.clari.minimize") : t("shared.clari.open")}
        title="Clari AI"
      >
        <Bot className="h-6 w-6" />
        {!open && hasActivity && (
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-success shadow-sm" />
        )}
      </button>

      {/* Ventana flotante estilo Messenger — sigue al muelle cuando lo movés. */}
      {open && (
        <div
          className="fixed z-50 flex w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={winStyle}
          role="dialog"
          aria-label="Clari AI chat"
        >
          {/* Header con gradient + avatar + acciones */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 via-card to-card px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <ClariAvatar size={32} />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">
                  Clari AI
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {t("shared.clari.online")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label={t("shared.window.minimize")}
                title={t("shared.window.minimize")}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Toggle de modo (solo staff): Soporte (clari-help) vs CRM (orquestador). */}
          {isStaff && (
            <div className="flex shrink-0 gap-1 border-b border-border/60 bg-card px-3 py-1.5">
              {([["help", "shared.clari.modeHelp"], ["crm", "shared.clari.modeCrm"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => switchMode(k)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${mode === k ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )}

          {/* Body — ClariAiChat. endpoint según modo: soporte (clari-help) o CRM
              (ai-orchestrator, con tools sobre todo el catálogo). */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <ClariAiChat
              key={mode}
              mode="panel"
              endpoint={mode === "crm" ? "ai-orchestrator" : "clari-help"}
              conversationId={conversationId ?? undefined}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ClariAiFab;
