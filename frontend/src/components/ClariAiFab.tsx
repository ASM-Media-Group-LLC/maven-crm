import { useState } from "react";
import { Bot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const ClariAiFab = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-110 hover:shadow-xl ring-2 ring-primary/30 hover:ring-primary/60"
        aria-label="Abrir Clari AI"
      >
        <ClariAvatar size={56} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClariAvatar size={28} />
              Clari AI
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <ClariAiChat mode="panel" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ClariAiFab;
