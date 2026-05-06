import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NewSessionDialog } from "../NewSessionDialog";

// SessionsPanel — versión slim. Antes era un rail con tabs Abiertas/
// Cerradas + la lista completa; ahora solo es un cuadrito con el
// botón "+ Nueva". El listado de sesiones (abiertas y cerradas) vive
// en el HistoryPanel de la derecha.
export const SessionsPanel = () => {
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="flex h-full flex-col items-center gap-2 p-3">
      <Button
        size="sm"
        onClick={() => setNewOpen(true)}
        className="w-full gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" /> Nueva
      </Button>
      <NewSessionDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
};

export default SessionsPanel;
