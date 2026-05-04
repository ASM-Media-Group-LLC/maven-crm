import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (v: string) => void;
}

const TYPE_OPTIONS = [
  { value: "all", label: "Todos los tipos" },
  { value: "general", label: "General" },
  { value: "policy", label: "Política" },
  { value: "celebration", label: "Celebración" },
  { value: "holiday", label: "Feriado" },
  { value: "urgent", label: "Urgente" },
  { value: "reminder", label: "Recordatorio" },
  { value: "update", label: "Actualización" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "Todas las prioridades" },
  { value: "high", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Baja" },
];

const AnnouncementFilters = ({
  search,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterPriority,
  onFilterPriorityChange,
}: Props) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="relative flex-1 min-w-[200px] max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Buscar anuncios..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-9 h-9"
      />
    </div>
    <Select value={filterType} onValueChange={onFilterTypeChange}>
      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        {TYPE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={filterPriority} onValueChange={onFilterPriorityChange}>
      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        {PRIORITY_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default AnnouncementFilters;
