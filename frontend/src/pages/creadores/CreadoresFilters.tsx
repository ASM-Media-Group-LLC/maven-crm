import { Search, List, LayoutGrid, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CreadorFilters, ManagerOption } from "./useCreadores";

interface Props {
  filters: CreadorFilters;
  onChange: (patch: Partial<CreadorFilters>) => void;
  categories: string[];
  countries: string[];
  cities: string[];
  // Personas con rol manager; el filtro muestra las creadoras que SON o
  // FUERON de la elegida (bitácora creator_manager_history).
  managers: ManagerOption[];
  // Compañías centralizadas en scouter_companies — fuente única para el
  // filtro y para cualquier input de compañía en el resto de la app.
  companies: string[];
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
}

const CreadoresFilters = ({
  filters,
  onChange,
  categories,
  countries,
  cities,
  managers,
  companies,
  view,
  onViewChange,
  hasActiveFilters,
  onClear,
}: Props) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="relative w-48 shrink-0">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar creador…"
        className="pl-9"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
    </div>

    <FilterSelect
      placeholder="Estados"
      value={filters.status}
      options={["active", "onboarding", "paused", "leaving", "terminated"]}
      onChange={(v) => onChange({ status: v })}
    />
    <FilterSelect
      placeholder="Categorías"
      value={filters.category}
      options={categories}
      onChange={(v) => onChange({ category: v })}
    />
    <FilterSelect
      placeholder="Países"
      value={filters.country}
      options={countries}
      onChange={(v) => onChange({ country: v })}
    />
    <FilterSelect
      placeholder="Ciudades"
      value={filters.city}
      options={cities}
      onChange={(v) => onChange({ city: v })}
    />
    <Select
      value={filters.manager || undefined}
      onValueChange={(v) => onChange({ manager: v === "__all__" ? "" : v })}
    >
      <SelectTrigger className="w-[150px] shrink-0">
        <SelectValue placeholder="Managers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todas</SelectItem>
        {managers.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.full_name ?? m.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {/* Compañías — fuente única scouter_companies, reemplaza la fila de
        botones de agency que estaba arriba del listado. */}
    <FilterSelect
      placeholder="Compañías"
      value={filters.agency}
      options={companies}
      onChange={(v) => onChange({ agency: v })}
    />

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
      <SelectTrigger className="w-[140px] shrink-0">
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

export default CreadoresFilters;
