import { useState } from "react";
import { Bot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ClariAiChat from "./ClariAiChat";

const ClariAiFab = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md transition-all duration-200 hover:scale-110 hover:shadow-xl"
        aria-label="Abrir Clari AI"
      >
        <Bot className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
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
