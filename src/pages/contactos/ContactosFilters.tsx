import { useState } from "react";
import { Search, List, LayoutGrid, X, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  creators?: CreatorOption[];
}

const ContactosFilters = ({ filters, onChange, view, onViewChange, hasActiveFilters, onClear, creators = [] }: Props) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="relative w-64">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar por ticket, nombre, handle..."
        className="pl-9"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
    </div>

    <FilterSelect
      placeholder="Estado"
      value={filters.estado}
      options={["Nuevo", "Contactado", "Interesado", "Descartado"]}
      onChange={(v) => onChange({ estado: v })}
    />
    <FilterSelect
      placeholder="País"
      value={filters.pais}
      options={["AR", "BR", "CL", "CO", "CR", "EC", "ES", "GB", "GT", "HN", "IT", "MX", "PA", "PE", "PY", "SV", "TH", "US", "UY", "VE"]}
      onChange={(v) => onChange({ pais: v })}
    />
    <FilterSelect
      placeholder="Categoría"
      value={filters.categoria}
      options={["A+", "A", "B+", "B", "C"]}
      onChange={(v) => onChange({ categoria: v })}
    />

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

    {creators.length > 0 && (
      <FilterSelect
        placeholder="Agente"
        value={filters.creadoPor}
        options={creators.map((c) => c.label)}
        onChange={(v) => onChange({ creadoPor: v })}
      />
    )}

    {hasActiveFilters && onClear && (
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="mr-1.5 h-4 w-4" />
        Limpiar filtros
      </Button>
    )}

    <div className="ml-auto flex gap-1">
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
  </div>
);

function FilterSelect({
  placeholder,
  value,
  options = [],
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default ContactosFilters;
