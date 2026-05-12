import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Check, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Selector admin-only para "ver el panel de closers como X closer".
// Trae los profiles con role=closer del tenant — list-style con search
// interno (filtro por nombre tipeando). Al elegir uno, el caller setea
// el viewAsCloserId que filtra todas las queries del módulo.

interface CloserOption {
  id: string;
  full_name: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
}

const ViewAsCloserPicker = ({ value, onChange }: Props) => {
  const [open, setOpen] = useState(false);

  const { data: closers = [], isLoading } = useQuery({
    queryKey: ["tenant-closers-list"],
    queryFn: async () => {
      // user_roles.role text contains "closer". Hacemos un join manual
      // contra profiles para traer el nombre.
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "closer");
      if (error) throw error;
      const ids = (roles ?? []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [] as CloserOption[];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profs ?? []) as CloserOption[]).sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? ""),
      );
    },
    staleTime: 5 * 60_000,
  });

  const selected = value ? closers.find((c) => c.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "gap-1.5",
            value
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
              : "",
          )}
          aria-expanded={open}
        >
          <Eye className="h-4 w-4" />
          {selected?.full_name ?? "Cerradores"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder="Filtrar por nombre…" className="h-9" />
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Cargando…</CommandEmpty>
            ) : closers.length === 0 ? (
              <CommandEmpty>Sin closers en el tenant.</CommandEmpty>
            ) : (
              <>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup heading="Ver como">
                  {closers.map((c) => {
                    const label = c.full_name?.trim() || "(sin nombre)";
                    const isSelected = value === c.id;
                    return (
                      <CommandItem
                        key={c.id}
                        value={label}
                        onSelect={() => {
                          onChange(isSelected ? null : c.id, isSelected ? null : label);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isSelected ? "opacity-100 text-primary" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ViewAsCloserPicker;
