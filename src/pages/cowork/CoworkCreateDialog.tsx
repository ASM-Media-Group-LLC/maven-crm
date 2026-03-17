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

  const addRoom = () => setRoomNames([...roomNames, `Sala ${roomNames.length + 1}`]);
  const removeRoom = (i: number) => setRoomNames(roomNames.filter((_, idx) => idx !== i));
  const updateRoom = (i: number, val: string) => {
    const copy = [...roomNames];
    copy[i] = val;
    setRoomNames(copy);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear sesión Cowork</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nombre de la sesión</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cowork semanal" />
          </div>
          <div>
            <Label>Descripción (opcional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción..." />
          </div>
          <div>
            <Label>Salas</Label>
            <div className="space-y-2 mt-1">
              {roomNames.map((rn, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={rn} onChange={(e) => updateRoom(i, e.target.value)} />
                  {roomNames.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRoom(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRoom} className="gap-1">
                <Plus className="h-3 w-3" /> Agregar sala
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
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
