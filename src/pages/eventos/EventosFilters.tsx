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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import type { EventoFilters } from "./useEventos";

interface Props {
  filters: EventoFilters;
  onChange: (patch: Partial<EventoFilters>) => void;
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
}

const EVENT_TYPES = ["Shooting", "Podcast", "Casting", "Reunion", "Otro"];
const TIME_OPTIONS = [
  { value: "morning", label: "Mañana" },
  { value: "afternoon", label: "Tarde" },
  { value: "night", label: "Noche" },
];

const EventosFilters = ({ filters, onChange, view, onViewChange, hasActiveFilters, onClear }: Props) => (
  <div className="flex items-center gap-3">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar eventos…"
        className="pl-9"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
    </div>

    <Select value={filters.type || undefined} onValueChange={(v) => onChange({ type: v === "__all__" ? "" : v })}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Tipo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        {EVENT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Select value={filters.timeOfDay || undefined} onValueChange={(v) => onChange({ timeOfDay: v === "__all__" ? "" : v })}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Horario" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos</SelectItem>
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>

    <DateRangePicker
      from={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
      to={filters.dateTo ? new Date(filters.dateTo) : undefined}
      onApply={(from, to) =>
        onChange({
          dateFrom: from ? format(from, "yyyy-MM-dd") : "",
          dateTo: to ? format(to, "yyyy-MM-dd") : "",
        })
      }
    />

    {hasActiveFilters && onClear && (
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="mr-1.5 h-4 w-4" />
        Limpiar filtros
      </Button>
    )}

    <div className="ml-auto flex gap-1">
      <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" onClick={() => onViewChange("table")}>
        <List className="h-4 w-4" />
      </Button>
      <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => onViewChange("grid")}>
        <LayoutGrid className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default EventosFilters;
