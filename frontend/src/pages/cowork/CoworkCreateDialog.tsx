import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, roomNames: string[], description?: string) => Promise<void>;
}

export default function CoworkCreateDialog({ open, onOpenChange, onCreate }: Props) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Los nombres por defecto de las salas NO se traducen: se guardan en la base
  // (cowork_rooms.name) y los lee toda la sesión, cada uno en su idioma.
  const [roomNames, setRoomNames] = useState(["Sala 1", "Sala 2"]);
  const [loading, setLoading] = useState(false);

  // Mismo tope que la edge (MAX_SALAS_POR_SESION). Subido de 10 a 30 el
  // 07/09/2026: CHATTERS KASH necesitaba la sala 11.
  const MAX_ROOMS = 30;
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
          <DialogTitle className="text-foreground">{t("cowork.create.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto min-h-0">
          <div>
            <Label className="text-muted-foreground text-xs font-medium">{t("cowork.create.sessionName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cowork.create.sessionNamePlaceholder")} className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium">{t("cowork.create.descriptionOptional")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("cowork.create.descriptionPlaceholder")} className="mt-1.5 rounded-xl" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs font-medium">
              {t("cowork.create.rooms")} <span className="text-muted-foreground/70 font-normal normal-case">({roomNames.length}/10)</span>
            </Label>
            <div className="space-y-2 mt-1.5">
              {roomNames.map((rn, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={rn} onChange={(e) => updateRoom(i, e.target.value)} className="rounded-xl" />
                  {roomNames.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRoom(i)} className="shrink-0 h-8 w-8 tactil:h-10 tactil:w-10 rounded-full text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRoom} className="gap-1 rounded-full" disabled={roomNames.length >= MAX_ROOMS}>
                <Plus className="h-3 w-3" /> {t("cowork.create.addRoom")}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">{t("common.cancel")}</Button>
          <Button
            className="rounded-full"
            disabled={!name.trim() || roomNames.some(r => !r.trim()) || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onCreate(name, roomNames, description || undefined);
                toast.success(t("cowork.create.created"));
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? t("cowork.create.creating") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
