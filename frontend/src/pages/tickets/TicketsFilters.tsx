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
import { useLanguage } from "@/hooks/useLanguage";
import {
  PRIORITY_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  TYPE_LABEL_KEYS,
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
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 w-full sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("tickets.filters.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={priority || undefined} onValueChange={(v) => onPriorityChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder={t("tickets.priority")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.allF")}</SelectItem>
            {Object.entries(PRIORITY_LABEL_KEYS).map(([k, clave]) => (
              <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ticketType || undefined} onValueChange={(v) => onTicketTypeChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder={t("common.type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.all")}</SelectItem>
            {Object.entries(TYPE_LABEL_KEYS).map(([k, clave]) => (
              <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status || undefined} onValueChange={(v) => onStatusChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.all")}</SelectItem>
            {Object.entries(STATUS_LABEL_KEYS).map(([k, clave]) => (
              <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={company || undefined} onValueChange={(v) => onCompanyChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder={t("common.company")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.allF")}</SelectItem>
            {COMPANIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignedTo || undefined} onValueChange={(v) => onAssignedToChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder={t("tickets.assignee")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.all")}</SelectItem>
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
            {t("tickets.filters.clear")}
          </Button>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => onViewChange("list")}
            aria-label={t("tickets.filters.listView")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9"
            onClick={() => onViewChange("grid")}
            aria-label={t("tickets.filters.gridView")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketsFilters;
