import { Search, List, LayoutGrid, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface ContactoFilters {
  search: string;
  estado: string;
  pais: string;
  categoria: string;
  fechaCreacion: string;
}

interface Props {
  filters: ContactoFilters;
  onChange: (patch: Partial<ContactoFilters>) => void;
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
}

const ContactosFilters = ({ filters, onChange, view, onViewChange }: Props) => (
  <div className="flex items-center gap-3">
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
      options={["Nuevo", "Contactado", "Convertido", "Descartado"]}
      onChange={(v) => onChange({ estado: v })}
    />
    <FilterSelect
      placeholder="País"
      value={filters.pais}
      options={["CO", "MX", "AR", "ES", "UY", "BR", "CL", "PE", "US"]}
      onChange={(v) => onChange({ pais: v })}
    />
    <FilterSelect
      placeholder="Categoría"
      value={filters.categoria}
      options={["A+", "A", "B+", "B", "C"]}
      onChange={(v) => onChange({ categoria: v })}
    />

    <div className="flex items-center gap-1.5">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <Select value={filters.fechaCreacion || undefined} onValueChange={(v) => onChange({ fechaCreacion: v === "__all__" ? "" : v })}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Fecha creación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
          <SelectItem value="hoy">Hoy</SelectItem>
          <SelectItem value="semana">Esta semana</SelectItem>
          <SelectItem value="mes">Este mes</SelectItem>
        </SelectContent>
      </Select>
    </div>

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
