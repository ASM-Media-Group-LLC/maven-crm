import { useState } from "react";
import { Circle, MinusCircle, Clock, CircleOff, MessageSquareText, X } from "lucide-react";
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
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; icon: typeof Circle; soloAdmin?: boolean }> = {
  available: { label: "Disponible", color: "text-success", icon: Circle },
  busy: { label: "Ocupado", color: "text-destructive", icon: MinusCircle },
  away: { label: "Ausente", color: "text-warning", icon: Clock },
  // Aparecer como desconectado. Es de verdad: quien lo elige deja de contar en
  // "X en línea" (ver useOnlinePresence), no solo cambia de color.
  offline: { label: "Desconectado", color: "text-muted-foreground", icon: CircleOff, soloAdmin: true },
};

/** Paleta del estado personalizado. Sin nombres a propósito: el texto que
 *  escribe la persona ya dice qué significa. Son colores fijos, no tokens del
 *  skin, porque es una elección explícita y tiene que verse igual siempre. */
export const COLORES_ESTADO: Record<string, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  naranja: "bg-orange-500",
  rojo: "bg-rose-500",
  rosa: "bg-pink-400",
  morado: "bg-violet-500",
  azul: "bg-sky-500",
  gris: "bg-slate-400",
};

const MAX_LEN = 64;

/** Opciones de caducidad del estado personalizado (como el "Clear status after" de Google). */
const EXPIRY_OPTIONS: { key: string; label: string; resolve: () => string | null }[] = [
  { key: "never", label: "No borrar", resolve: () => null },
  { key: "1h", label: "En 1 hora", resolve: () => new Date(Date.now() + 3600_000).toISOString() },
  { key: "today", label: "Hoy (fin del día)", resolve: () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); } },
  { key: "week", label: "En una semana", resolve: () => new Date(Date.now() + 7 * 86400_000).toISOString() },
];

/** @param colorPersonal clave de COLORES_ESTADO elegida en el estado
 *                        personalizado; si viene, manda sobre el estado. */
export function getStatusColor(
  status: UserStatus | null,
  isOnline: boolean,
  colorPersonal?: string | null,
): string {
  if (!isOnline) return "bg-muted-foreground/30";
  if (colorPersonal && COLORES_ESTADO[colorPersonal]) return COLORES_ESTADO[colorPersonal];
  switch (status) {
    case "available": return "bg-success";
    case "busy": return "bg-destructive";
    case "away": return "bg-warning";
    default: return "bg-success";
  }
}

export function getStatusLabel(status: UserStatus | null, isOnline: boolean): string {
  if (!isOnline) return "Desconectado";
  return STATUS_CONFIG[status || "available"]?.label || "Disponible";
}

export default function StatusPicker() {
  const { myStatus, setMyStatus, myStatusText, setMyStatusText, myStatusColor } = useOnlinePresence();
  const { isAdmin } = useUserRole();
  const config = STATUS_CONFIG[myStatus];
  const Icon = config.icon;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [luz, setLuz] = useState<UserStatus>("available");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const abrirDialogo = () => {
    setDraft(myStatusText);
    setExpiry("never");
    setLuz(myStatus);
    setColor(myStatusColor);
    setOpen(true);
  };

  const guardar = async () => {
    setSaving(true);
    const resolver = EXPIRY_OPTIONS.find((o) => o.key === expiry)?.resolve ?? (() => null);
    // Texto y luz se guardan JUNTOS: escribir "EN LUNCH" y quedar en verde era
    // justo el desajuste que se veía en producción.
    await setMyStatusText(draft, resolver(), luz, color);
    setSaving(false);
    setOpen(false);
  };

  const quitar = async () => {
    setSaving(true);
    // Quitar el estado devuelve también la luz a Disponible.
    await setMyStatusText("", null, "available", null);
    setSaving(false);
    setOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs rounded-full bg-primary/5 hover:bg-primary/8 max-w-[180px]">
            {myStatusColor && COLORES_ESTADO[myStatusColor] ? (
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", COLORES_ESTADO[myStatusColor])} />
            ) : (
              <Icon className={cn("h-3 w-3 fill-current shrink-0", config.color)} />
            )}
            {/* Con estado personalizado, el chip muestra ESE texto (como Google Chat)
                y el puntito lleva la luz que se eligió junto al texto. */}
            <span className="text-muted-foreground truncate">{myStatusText || config.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] rounded-2xl">
          {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof config][])
            .filter(([, cfg]) => !cfg.soloAdmin || isAdmin)
            .map(([key, cfg]) => {
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
              <Label className="text-xs text-muted-foreground">Color de tu estado</Label>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(COLORES_ESTADO).map(([clave, clase]) => {
                  const activo = color === clave;
                  return (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => setColor(clave)}
                      aria-label={clave}
                      aria-pressed={activo}
                      className={cn(
                        "h-6 w-6 rounded-full transition-transform",
                        clase,
                        activo
                          ? "ring-2 ring-offset-2 ring-primary ring-offset-background scale-110"
                          : "hover:scale-110",
                      )}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-pressed={color === null}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    color === null
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Sin color
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Es el puntito que ven junto a tu foto. Sin color usa el de tu estado
                ({STATUS_CONFIG[luz].label.toLowerCase()}).
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
