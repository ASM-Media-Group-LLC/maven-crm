import { Search, List, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { EventoFilters } from "./useEventos";

interface Props {
  filters: EventoFilters;
  onChange: (patch: Partial<EventoFilters>) => void;
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
}

const EVENT_TYPES = ["Shooting", "Podcast", "Casting", "Reunion", "Otro"];
const TIME_OPTIONS = [
  { value: "morning", label: "Mañana" },
  { value: "afternoon", label: "Tarde" },
  { value: "night", label: "Noche" },
];

const EventosFilters = ({ filters, onChange, view, onViewChange }: Props) => (
  <div className="flex items-center gap-3">
    <div className="relative w-48">
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

    <Input
      type="date"
      className="w-[140px]"
      value={filters.dateFrom}
      onChange={(e) => onChange({ dateFrom: e.target.value })}
      placeholder="Desde"
    />
    <Input
      type="date"
      className="w-[140px]"
      value={filters.dateTo}
      onChange={(e) => onChange({ dateTo: e.target.value })}
      placeholder="Hasta"
    />

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
