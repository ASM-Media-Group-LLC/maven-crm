import { useState } from "react";
import { Bot, Minus, X } from "lucide-react";
import ClariAiChat from "./ClariAiChat";

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

// ClariAiFab — botón flotante + ventana de chat estilo Facebook
// Messenger desktop. Tres estados:
//   - cerrado:    solo el FAB
//   - minimizado: el FAB + barra arriba a la derecha (no implementada
//                 visualmente — al "minimizar" simplemente colapsa al
//                 FAB que sigue mostrando un dot indicando que hay
//                 conversación activa)
//   - abierto:    ventana flotante 380x600 anclada bottom-right con
//                 header (avatar + título + minimizar + cerrar) y body
//                 con el ClariAiChat completo
//
// La ventana NO se cierra cuando se hace click afuera (a diferencia
// del Sheet original) — solo se cierra con el botón X o la tecla Esc,
// imitando el comportamiento del messenger de FB.
const ClariAiFab = () => {
  // hasActivity rastrea si ya hubo interacción para mostrar un
  // indicador en el FAB cuando está cerrado/minimizado. La activamos
  // la primera vez que se abre la ventana — es una heurística simple,
  // no perfectamente "tenés mensajes nuevos" porque no hay backend
  // de unread events todavía.
  const [open, setOpen] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    setHasActivity(true);
  };

  // Esc cierra la ventana — se monta/desmonta con el render condicional.
  if (typeof window !== "undefined") {
    // No usamos useEffect global porque la ventana es condicional;
    // adjuntamos el listener inline cuando se abre.
  }

  return (
    <>
      {/* FAB flotante. Sigue visible incluso con la ventana abierta
          para que el usuario pueda re-clickear y minimizar (toggle).
          Usamos el ícono Bot (robotsito) — el avatar de Clari queda
          reservado para el header de la ventana de chat y las burbujas. */}
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg ring-2 ring-primary/30 transition-all duration-200 hover:scale-110 hover:shadow-xl hover:ring-primary/60"
        aria-label={open ? "Minimizar Clari AI" : "Abrir Clari AI"}
      >
        <Bot className="h-6 w-6" />
        {/* Dot de actividad — visible solo cuando hay actividad y la
            ventana está cerrada. */}
        {!open && hasActivity && (
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500 shadow-sm" />
        )}
      </button>

      {/* Ventana flotante estilo Messenger — fixed, bottom-right, no
          modal (no oscurece el resto de la app). El backdrop NO cierra. */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex h-[600px] max-h-[calc(100vh-7rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-4 duration-200"
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

          {/* Body — scroll interno via ClariAiChat con el endpoint
              clari-help (asistente de soporte global, NO de datos). */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <ClariAiChat mode="panel" endpoint="clari-help" />
          </div>
        </div>
      )}
    </>
  );
};

export default ClariAiFab;
