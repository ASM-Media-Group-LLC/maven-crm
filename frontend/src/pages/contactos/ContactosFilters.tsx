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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format, parseISO } from "date-fns";
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
}

interface CreatorOption {
  value: string;
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
}

const ContactosFilters = ({ filters, onChange, view, onViewChange, hasActiveFilters, onClear, creators = [], cities = [] }: Props) => {
  const [agentOpen, setAgentOpen] = useState(false);

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

      <DateRangePicker
        from={filters.dateFrom ? parseISO(filters.dateFrom) : undefined}
        to={filters.dateTo ? parseISO(filters.dateTo) : undefined}
        onApply={(from, to) =>
          onChange({
            dateFrom: from ? format(from, "yyyy-MM-dd") : "",
            dateTo: to ? format(to, "yyyy-MM-dd") : "",
          })
        }
        placeholder="Fecha creación"
        className="w-auto"
      />

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
