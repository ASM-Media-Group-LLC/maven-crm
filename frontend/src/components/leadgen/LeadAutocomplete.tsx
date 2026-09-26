import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

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
// Implementación: el listado se renderiza INLINE (en el flow del DOM)
// debajo del input — empuja los demás campos del form hacia abajo en
// vez de ocluirlos con un popover flotante. Single input: la búsqueda
// usa directo el `value` del input principal.

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
  /** Sin placeholder: "Nombre completo (o busca un lead existente)", en el idioma de la interfaz. */
  placeholder?: string;
}

export function LeadAutocomplete({
  value,
  onTypedChange,
  selectedLead,
  onLeadSelect,
  error,
  placeholder,
}: Props) {
  const { t } = useLanguage();
  const [focused, setFocused] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = value.trim();
  // Debounce del término: dispara la búsqueda 250ms después de que el user deja
  // de tipear, no en cada tecla (antes "paola" = 5 RPC; ahora 1).
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Mostramos resultados cuando: el input está focuseado, hay 2+ caracteres,
  // y NO hay lead seleccionado todavía (el user seleccionó uno → ocultamos).
  const showResults = focused && trimmed.length >= 2 && !selectedLead;

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leadgen-search-fuzzy", debounced],
    queryFn: async () => {
      const { data, error: err } = await (supabase as any).rpc("leadgen_search_fuzzy", {
        p_query: debounced,
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
    enabled: showResults && debounced.length >= 2,
    staleTime: 30_000,
  });

  // Blur con delay para que el click en un resultado funcione
  // (sino la lista se oculta antes de que dispare el onClick).
  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setFocused(false), 150);
  };

  // onMouseDown en la lista cancela el blur — permite el click.
  const handleResultsMouseDown = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onTypedChange(e.target.value);
            if (selectedLead) onLeadSelect(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder ?? t("leadgen.autocomplete.placeholder")}
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
            title={t("leadgen.autocomplete.unlink")}
            aria-label={t("leadgen.autocomplete.unlink")}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {showResults && (
        <div
          onMouseDown={handleResultsMouseDown}
          className="rounded-lg border border-border/60 bg-card shadow-sm max-h-72 overflow-y-auto"
        >
          {isLoading ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {t("leadgen.autocomplete.searching")}
            </p>
          ) : leads.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {t("leadgen.autocomplete.noMatches")}
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onLeadSelect(lead);
                      setFocused(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex flex-col items-start gap-0.5"
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
                        <span className="text-[10px] text-success font-bold ml-auto shrink-0">
                          {t("leadgen.autocomplete.hasPhone")}
                        </span>
                      )}
                    </div>
                    <div className="flex w-full items-center gap-2 text-[10px] text-muted-foreground">
                      {lead.company && <span>{lead.company}</span>}
                      {lead.city && <span>· {lead.city}</span>}
                      {lead.llgName && <span>· LLG: {lead.llgName}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
