import { useState } from "react";
import { Search, List, LayoutGrid, X, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getCountryFlag, getCountryName } from "@/lib/country-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ContactoFilters {
  search: string;
  estado: string;
  pais: string;
  ciudad: string;
  categoria: string;
  dateFrom: string;
  dateTo: string;
  creadoPor: string;
  // Canales de venta seleccionados. Valores = wa_channels.id, más las opciones
  // especiales "__none__" (sin contactar por WhatsApp) y "__multi__" (2+ canales).
  salesChannels?: string[];
}

// Opciones especiales del filtro "Canal de venta".
export const SALES_CHANNEL_NONE = "__none__";
export const SALES_CHANNEL_MULTI = "__multi__";

interface CreatorOption {
  value: string;
  label: string;
}

interface SalesChannelOption {
  id: string;
  label: string;
}

interface Props {
  filters: ContactoFilters;
  onChange: (patch: Partial<ContactoFilters>) => void;
  view?: "table" | "grid";
  onViewChange?: (v: "table" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  creators?: CreatorOption[];
  cities?: string[];
  // Solo admin: opciones del filtro "Canal de venta" (los 7 canales).
  salesChannelOptions?: SalesChannelOption[];
}

const ContactosFilters = ({ filters, onChange, view, onViewChange, hasActiveFilters, onClear, creators = [], cities = [], salesChannelOptions = [] }: Props) => {
  const [agentOpen, setAgentOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);

  const selectedChannels = filters.salesChannels ?? [];
  const toggleChannel = (id: string) => {
    const set = new Set(selectedChannels);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ salesChannels: Array.from(set) });
  };
  const channelButtonLabel = (() => {
    if (selectedChannels.length === 0) return "Canal de venta";
    if (selectedChannels.length === 1) {
      const only = selectedChannels[0];
      if (only === SALES_CHANNEL_NONE) return "Sin contactar";
      if (only === SALES_CHANNEL_MULTI) return "2+ canales";
      return salesChannelOptions.find((o) => o.id === only)?.label ?? "1 canal";
    }
    return `${selectedChannels.length} canales`;
  })();

  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      <div className="relative w-64 shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por ticket, nombre, handle..."
          className="pl-9"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>

      <FilterSelect
        placeholder="País"
        value={filters.pais}
        options={["AR", "BR", "CL", "CO", "CR", "EC", "ES", "GB", "GT", "HN", "IT", "MX", "PA", "PE", "PY", "SV", "TH", "US", "UY", "VE"]}
        labels={Object.fromEntries(
          ["AR", "BR", "CL", "CO", "CR", "EC", "ES", "GB", "GT", "HN", "IT", "MX", "PA", "PE", "PY", "SV", "TH", "US", "UY", "VE"]
            .map((c) => [c, `${getCountryFlag(c)} ${getCountryName(c)}`])
        )}
        onChange={(v) => onChange({ pais: v })}
      />
      <FilterSelect
        placeholder="Categoría"
        value={filters.categoria}
        options={["A+", "A", "B+", "B", "C"]}
        onChange={(v) => onChange({ categoria: v })}
      />
      <FilterSelect
        placeholder="Ciudad"
        value={filters.ciudad}
        options={cities}
        onChange={(v) => onChange({ ciudad: v })}
      />

      {/* Searchable Agente selector */}
      <Popover open={agentOpen} onOpenChange={setAgentOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={agentOpen}
            className="w-[180px] justify-between font-normal"
          >
            <span className="truncate">
              {filters.creadoPor || "Agente"}
            </span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar agente..." />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange({ creadoPor: "" });
                    setAgentOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !filters.creadoPor ? "opacity-100" : "opacity-0")} />
                  Todos
                </CommandItem>
                {creators.map((c) => (
                  <CommandItem
                    key={c.value}
                    onSelect={() => {
                      onChange({ creadoPor: c.label });
                      setAgentOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", filters.creadoPor === c.label ? "opacity-100" : "opacity-0")} />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Canal de venta — solo admin + cuando hay canales. Multi-select. */}
      {salesChannelOptions.length > 0 && (
        <Popover open={channelOpen} onOpenChange={setChannelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={channelOpen}
              className="w-[180px] justify-between font-normal shrink-0"
            >
              <span className="truncate">{channelButtonLabel}</span>
              <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar canal..." />
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {salesChannelOptions.map((o) => (
                    <CommandItem key={o.id} onSelect={() => toggleChannel(o.id)}>
                      <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(o.id) ? "opacity-100" : "opacity-0")} />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Especial">
                  <CommandItem onSelect={() => toggleChannel(SALES_CHANNEL_MULTI)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(SALES_CHANNEL_MULTI) ? "opacity-100" : "opacity-0")} />
                    Contactado por 2+ canales
                  </CommandItem>
                  <CommandItem onSelect={() => toggleChannel(SALES_CHANNEL_NONE)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(SALES_CHANNEL_NONE) ? "opacity-100" : "opacity-0")} />
                    Sin contactar por WhatsApp
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {hasActiveFilters && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1.5 h-4 w-4" />
          Limpiar filtros
        </Button>
      )}

      {view !== undefined && onViewChange && (
        <div className="ml-auto flex gap-1 shrink-0">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewChange("table")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

function FilterSelect({
  placeholder,
  value,
  options = [],
  labels,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels?.[o] || o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default ContactosFilters;
