import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
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

// Autocomplete buscable de leadgen_entries — usado en:
//   · pages/contactos/NuevoContactoForm.tsx (form full-page de contacto)
//   · pages/leadgen/AddContactoModal.tsx (modal desde leadgen)
//
// Búsqueda fuzzy via RPC leadgen_search_fuzzy (pg_trgm). Aguanta typos:
// "paola" encuentra "paula" con similarity 0.5+.
//
// El user puede:
//   1. Tipear libremente — onTypedChange dispara, sin lead seleccionado.
//   2. Seleccionar uno del dropdown — onLeadSelect dispara con la row
//      completa → el caller autollena los demás campos.
//
// Flujo unificado: la selección de lead es OBLIGATORIA en submit. Ver
// validación en cada caller.

export interface LeadAutocompleteLead {
  id: string;
  model_handle: string | null;
  ticket_number: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  country_code: string | null;
  city: string | null;
  company: string | null;
  platform: string | null;
  onlyfans_url: string | null;
  notes: string | null;
  lg_user_id: string | null;
  llgName?: string | null;
}

interface Props {
  value: string;
  onTypedChange: (v: string) => void;
  selectedLead: LeadAutocompleteLead | null;
  onLeadSelect: (lead: LeadAutocompleteLead | null) => void;
  error?: boolean;
  placeholder?: string;
}

export function LeadAutocomplete({
  value,
  onTypedChange,
  selectedLead,
  onLeadSelect,
  error,
  placeholder = "Nombre completo (o buscá un lead existente)",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery(value || "");
  }, [open, value]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leadgen-search-fuzzy", query],
    queryFn: async () => {
      const q = query.trim();
      if (q.length < 2) return [];
      const { data, error: err } = await (supabase as any).rpc("leadgen_search_fuzzy", {
        p_query: q,
        p_limit: 20,
        p_min_similarity: 0.2,
      });
      if (err) throw err;
      const rows = (data ?? []) as LeadAutocompleteLead[];

      // Enriquecer con nombre del LLG que logueó cada lead.
      const userIds = Array.from(
        new Set(rows.map((r) => r.lg_user_id).filter(Boolean) as string[]),
      );
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        const nameById = new Map<string, string>();
        for (const p of profs ?? []) nameById.set(p.id as string, (p as any).full_name);
        for (const r of rows) {
          if (r.lg_user_id) r.llgName = nameById.get(r.lg_user_id) ?? null;
        }
      }
      return rows;
    },
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => {
              onTypedChange(e.target.value);
              if (selectedLead) onLeadSelect(null);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn(error && "border-destructive", "pr-8")}
          />
          {selectedLead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLeadSelect(null);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted/60"
              title="Quitar asociación al lead"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar lead por handle, ticket, notas o teléfono…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim().length < 2 ? (
              <CommandEmpty>Escribí al menos 2 caracteres para buscar.</CommandEmpty>
            ) : isLoading ? (
              <CommandEmpty>Buscando…</CommandEmpty>
            ) : leads.length === 0 ? (
              <CommandEmpty>
                Sin leads que matcheen. Si el lead no existe, agregalo primero en LeadGen.
              </CommandEmpty>
            ) : (
              <CommandGroup heading="Leads existentes">
                {leads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={lead.id}
                    onSelect={() => {
                      onLeadSelect(lead);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="font-medium truncate">
                        @{lead.model_handle ?? "?"}
                      </span>
                      {lead.ticket_number && (
                        <code className="text-[10px] text-muted-foreground bg-muted/40 px-1 py-0.5 rounded">
                          {lead.ticket_number}
                        </code>
                      )}
                      {lead.phone_raw && (
                        <span className="text-[10px] text-emerald-500 font-bold ml-auto shrink-0">
                          📞 ya tiene tel
                        </span>
                      )}
                    </div>
                    <div className="flex w-full items-center gap-2 text-[10px] text-muted-foreground">
                      {lead.company && <span>{lead.company}</span>}
                      {lead.city && <span>· {lead.city}</span>}
                      {lead.llgName && <span>· LLG: {lead.llgName}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
