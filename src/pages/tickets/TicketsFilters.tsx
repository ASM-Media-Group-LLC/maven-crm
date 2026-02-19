import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, List, LayoutGrid, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  COMPANIES,
  TEAM_MEMBERS,
} from "./useTickets";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
  ticketType: string;
  onTicketTypeChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  company: string;
  onCompanyChange: (v: string) => void;
  assignedTo: string;
  onAssignedToChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  view: "list" | "grid";
  onViewChange: (v: "list" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
}

const TicketsFilters = ({
  search, onSearchChange,
  priority, onPriorityChange,
  ticketType, onTicketTypeChange,
  status, onStatusChange,
  company, onCompanyChange,
  assignedTo, onAssignedToChange,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  view, onViewChange,
  hasActiveFilters, onClear,
}: Props) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descripción, número de ticket..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={priority || undefined} onValueChange={(v) => onPriorityChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ticketType || undefined} onValueChange={(v) => onTicketTypeChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status || undefined} onValueChange={(v) => onStatusChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={company || undefined} onValueChange={(v) => onCompanyChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Compañía" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {COMPANIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignedTo || undefined} onValueChange={(v) => onAssignedToChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Asignado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {TEAM_MEMBERS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangePicker
          from={dateFrom ? new Date(dateFrom) : undefined}
          to={dateTo ? new Date(dateTo) : undefined}
          onApply={(from, to) => {
            onDateFromChange(from ? format(from, "yyyy-MM-dd") : "");
            onDateToChange(to ? format(to, "yyyy-MM-dd") : "");
          }}
        />

        {hasActiveFilters && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1.5 h-4 w-4" />
            Limpiar filtros
          </Button>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => onViewChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketsFilters;
