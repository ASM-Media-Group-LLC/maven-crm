import { useState } from "react";
import { Circle, MinusCircle, Clock, MessageSquareText, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOnlinePresence, UserStatus } from "@/hooks/useOnlinePresence";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; icon: typeof Circle }> = {
  available: { label: "Disponible", color: "text-success", icon: Circle },
  busy: { label: "Ocupado", color: "text-destructive", icon: MinusCircle },
  dnd: { label: "No molestar", color: "text-destructive", icon: MinusCircle },
  away: { label: "Ausente", color: "text-warning", icon: Clock },
};

const MAX_LEN = 64;

/** Opciones de caducidad del estado personalizado (como el "Clear status after" de Google). */
const EXPIRY_OPTIONS: { key: string; label: string; resolve: () => string | null }[] = [
  { key: "never", label: "No borrar", resolve: () => null },
  { key: "1h", label: "En 1 hora", resolve: () => new Date(Date.now() + 3600_000).toISOString() },
  { key: "today", label: "Hoy (fin del día)", resolve: () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); } },
  { key: "week", label: "En una semana", resolve: () => new Date(Date.now() + 7 * 86400_000).toISOString() },
];

export function getStatusColor(status: UserStatus | null, isOnline: boolean): string {
  if (!isOnline) return "bg-muted-foreground/30";
  switch (status) {
    case "available": return "bg-success";
    case "busy": return "bg-destructive";
    case "dnd": return "bg-destructive";
    case "away": return "bg-warning";
    default: return "bg-success";
  }
}

export function getStatusLabel(status: UserStatus | null, isOnline: boolean): string {
  if (!isOnline) return "Desconectado";
  return STATUS_CONFIG[status || "available"]?.label || "Disponible";
}

export default function StatusPicker() {
  const { myStatus, setMyStatus, myStatusText, setMyStatusText } = useOnlinePresence();
  const config = STATUS_CONFIG[myStatus];
  const Icon = config.icon;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [saving, setSaving] = useState(false);

  const abrirDialogo = () => {
    setDraft(myStatusText);
    setExpiry("never");
    setOpen(true);
  };

  const guardar = async () => {
    setSaving(true);
    const resolver = EXPIRY_OPTIONS.find((o) => o.key === expiry)?.resolve ?? (() => null);
    await setMyStatusText(draft, resolver());
    setSaving(false);
    setOpen(false);
  };

  const quitar = async () => {
    setSaving(true);
    await setMyStatusText("", null);
    setSaving(false);
    setOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs rounded-full bg-primary/5 hover:bg-primary/8 max-w-[180px]">
            <Icon className={cn("h-3 w-3 fill-current shrink-0", config.color)} />
            {/* Con estado personalizado, el chip muestra ESE texto (como Google Chat);
                el color del puntito sigue siendo el del estado fijo. */}
            <span className="text-muted-foreground truncate">{myStatusText || config.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] rounded-2xl">
          {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof config][]).map(([key, cfg]) => {
            const ItemIcon = cfg.icon;
            return (
              <DropdownMenuItem
                key={key}
                onClick={() => setMyStatus(key)}
                className={cn(myStatus === key && "bg-muted")}
              >
                <ItemIcon className={cn("h-3.5 w-3.5 mr-2 fill-current", cfg.color)} />
                {cfg.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={abrirDialogo}>
            <MessageSquareText className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            {myStatusText ? "Editar estado personalizado" : "Estado personalizado…"}
          </DropdownMenuItem>
          {myStatusText && (
            <DropdownMenuItem onClick={quitar}>
              <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Quitar estado
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Tu estado</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="relative">
                <Input
                  autoFocus
                  value={draft}
                  maxLength={MAX_LEN}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(); } }}
                  placeholder="Ej: 10am-2pm / 4pm-8pm | MIA"
                  className="pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground">
                  {draft.length}/{MAX_LEN}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Lo ven los demás junto a tu nombre en el chat.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Borrar estado después de</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {myStatusText && (
              <Button variant="ghost" onClick={quitar} disabled={saving} className="mr-auto">
                Quitar estado
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving || !draft.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
