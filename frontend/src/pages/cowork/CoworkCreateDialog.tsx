import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, roomNames: string[], description?: string) => Promise<void>;
}

export default function CoworkCreateDialog({ open, onOpenChange, onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roomNames, setRoomNames] = useState(["Sala 1", "Sala 2"]);
  const [loading, setLoading] = useState(false);

  const MAX_ROOMS = 10;
  const addRoom = () => {
    if (roomNames.length < MAX_ROOMS) setRoomNames([...roomNames, `Sala ${roomNames.length + 1}`]);
  };
  const removeRoom = (i: number) => setRoomNames(roomNames.filter((_, idx) => idx !== i));
  const updateRoom = (i: number, val: string) => {
    const copy = [...roomNames];
    copy[i] = val;
    setRoomNames(copy);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden w-[calc(100%-2rem)] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Crear sesión Cowork</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto min-h-0">
          <div>
            <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Nombre de la sesión</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cowork semanal" className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Descripción (opcional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción..." className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Salas <span className="text-muted-foreground/70 font-normal normal-case">({roomNames.length}/10)</span>
            </Label>
            <div className="space-y-2 mt-1.5">
              {roomNames.map((rn, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={rn} onChange={(e) => updateRoom(i, e.target.value)} className="rounded-xl" />
                  {roomNames.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRoom(i)} className="shrink-0 h-10 w-10 sm:h-8 sm:w-8 rounded-full text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRoom} className="gap-1 rounded-full" disabled={roomNames.length >= MAX_ROOMS}>
                <Plus className="h-3 w-3" /> Agregar sala
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Cancelar</Button>
          <Button
            className="rounded-full"
            disabled={!name.trim() || roomNames.some(r => !r.trim()) || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onCreate(name, roomNames, description || undefined);
                toast.success("Sesión creada");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
