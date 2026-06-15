import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Minus, X } from "lucide-react";
import ClariAiChat from "./ClariAiChat";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useUserRole } from "@/hooks/useUserRole";

// ClariAvatar — círculo con la imagen del personaje en /clari-avatar.png.
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
          src="/clari-avatar.png"
          alt="Clari AI"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
};

// ── Arrastre del FAB ──────────────────────────────────────────────────
// El botón es movible: el usuario lo arrastra a donde no le moleste (antes
// tapaba la paginación de algunas tablas). La posición se guarda en
// localStorage para que persista entre sesiones. Si no hay posición
// guardada, arranca en la esquina inferior derecha (bottom-6 right-6).
const FAB_SIZE = 56; // h-14 w-14
const MARGIN = 8; // margen mínimo al borde de la ventana
const POS_KEY = "clari.fab.pos"; // { x, y } = left/top en px
const DRAG_THRESHOLD = 5; // px de movimiento para considerar "arrastre" (vs click)

const clampToViewport = (p: { x: number; y: number }) => {
  const maxX = window.innerWidth - FAB_SIZE - MARGIN;
  const maxY = window.innerHeight - FAB_SIZE - MARGIN;
  return {
    x: Math.max(MARGIN, Math.min(p.x, Math.max(MARGIN, maxX))),
    y: Math.max(MARGIN, Math.min(p.y, Math.max(MARGIN, maxY))),
  };
};

// ClariAiFab — botón flotante (arrastrable) + ventana de chat estilo
// Facebook Messenger desktop. La ventana queda anclada al FAB (arriba si
// hay lugar, sino abajo) y sigue al botón cuando lo movés.
const ClariAiFab = () => {
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
    setConversationId(null);
    createConversation
      .mutateAsync(m === "crm" ? "Clari · CRM" : "Clari · soporte")
      .then((conv) => setConversationId(conv.id))
      .catch((e) => console.error("clari: no se pudo crear conversación", e));
  };

  // Posición del FAB (left/top en px). null = default esquina inf. derecha.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<
    { startX: number; startY: number; origX: number; origY: number; moved: boolean } | null
  >(null);

  // Cargar posición persistida al montar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(clampToViewport(p));
      }
    } catch {
      /* localStorage puede fallar */
    }
  }, []);

  // Re-clampar si la ventana se achica (que el FAB no quede fuera de pantalla).
  useEffect(() => {
    const onResize = () => setPos((prev) => (prev ? clampToViewport(prev) : prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  // Drag con pointer events + pointer capture: distinguimos click de arrastre
  // por el umbral DRAG_THRESHOLD. Si no se movió → es click (toggle abrir).
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(clampToViewport({ x: d.origX + dx, y: d.origY + dy }));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (!d) return;
      if (d.moved) {
        const rect = e.currentTarget.getBoundingClientRect();
        const next = clampToViewport({ x: rect.left, y: rect.top });
        setPos(next);
        try { localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      } else {
        // No se arrastró → tratar como click.
        setOpen((o) => {
          if (!o) setHasActivity(true);
          return !o;
        });
      }
    },
    [],
  );

  // Estilo de la ventana de chat: si el FAB fue movido, la anclamos a su
  // posición (arriba si hay lugar, sino abajo; alineada por la derecha del
  // FAB) y la clampeamos a la pantalla. Sin mover → default bottom-right.
  const WIN_W = 380;
  const winStyle: React.CSSProperties | undefined = (() => {
    if (!pos || typeof window === "undefined") return undefined;
    const winH = Math.min(600, window.innerHeight - 32);
    let top = pos.y - winH - MARGIN; // preferimos arriba del FAB
    if (top < MARGIN) top = pos.y + FAB_SIZE + MARGIN; // sino, abajo
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - winH - MARGIN));
    let left = pos.x + FAB_SIZE - WIN_W; // alinear borde derecho con el FAB
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - WIN_W - MARGIN));
    return { left, top };
  })();

  return (
    <>
      {/* FAB flotante ARRASTRABLE. touch-none evita el scroll al arrastrar en
          touch; cursor-grab indica que es movible. El click (sin arrastre)
          togglea la ventana. */}
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`fixed z-50 flex h-14 w-14 touch-none cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg ring-2 ring-primary/30 transition-[box-shadow,transform] duration-200 hover:shadow-xl hover:ring-primary/60 active:cursor-grabbing ${pos ? "" : "bottom-6 right-6"}`}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        aria-label={open ? "Minimizar Clari AI" : "Abrir Clari AI (arrastrable)"}
        title="Clari AI — arrastrame para moverme"
      >
        <Bot className="h-6 w-6" />
        {!open && hasActivity && (
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500 shadow-sm" />
        )}
      </button>

      {/* Ventana flotante estilo Messenger — sigue al FAB si fue movido. */}
      {open && (
        <div
          className={`fixed z-50 flex h-[600px] max-h-[calc(100vh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-4 duration-200 ${winStyle ? "" : "bottom-24 right-6"}`}
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
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  En línea
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Minimizar"
                title="Minimizar"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Toggle de modo (solo staff): Soporte (clari-help) vs CRM (orquestador). */}
          {isStaff && (
            <div className="flex shrink-0 gap-1 border-b border-border/60 bg-card px-3 py-1.5">
              {([["help", "Soporte"], ["crm", "Preguntale al CRM"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => switchMode(k)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${mode === k ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
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
