// Selector de asignados MULTI para las bandejas (WhatsApp y Telegram): checkboxes
// que togglean de a uno (el popover queda abierto para marcar varios seguidos).
// Cada toggle persiste el set completo vía el RPC *_conversation_set_assignees de
// cada canal (lo maneja el onToggle del padre). Textos con default en español;
// Telegram los pasa traducidos vía props (esa página ya está i18n-izada).
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export function AssigneePicker({
  users,
  assignedIds,
  onToggle,
  onClear,
  searchPlaceholder = "Buscar persona…",
  emptyText = "Sin resultados.",
  clearText = "Quitar todos",
}: {
  users: { id: string; full_name: string | null }[];
  assignedIds: string[];
  onToggle: (userId: string) => void;
  onClear: () => void;
  searchPlaceholder?: string;
  emptyText?: string;
  clearText?: string;
}) {
  return (
    <Command>
      <CommandInput placeholder={searchPlaceholder} className="h-9" />
      <CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {/* value = texto visible, para que el buscador lo encuentre por lo que se lee. */}
          <CommandItem value={clearText} onSelect={onClear} disabled={assignedIds.length === 0}>
            {clearText}
          </CommandItem>
          {users.map((u) => {
            const on = assignedIds.includes(u.id);
            return (
              // value único por usuario (nombre + id): cmdk identifica el ítem por su
              // string value, y dos perfiles homónimos colisionaban (Enter togglea al
              // primero). El id al final no molesta la búsqueda por nombre.
              <CommandItem key={u.id} value={`${u.full_name || ""} ${u.id}`} onSelect={() => onToggle(u.id)}>
                <span
                  aria-hidden
                  className={cn(
                    "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                    on ? "bg-primary text-primary-foreground" : "opacity-40",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{u.full_name || u.id.slice(0, 8)}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
