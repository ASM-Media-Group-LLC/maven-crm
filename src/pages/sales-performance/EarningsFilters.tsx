import { Filter, Search, CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EarningsFiltersProps {
  documentFilter: string[];
  onDocumentFilterChange: (value: string[]) => void;
  documentIds: string[];
  relatedDocumentIds: Set<string>;
  creatorFilter: string[];
  onCreatorFilterChange: (value: string[]) => void;
  creatorNames: string[];
  relatedCreatorNames: Set<string>;
  totalCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onToday: () => void;
  onYesterday: () => void;
  pageSize: number | "all";
  onPageSizeChange: (value: number | "all") => void;
}

const toggleItem = (arr: string[], item: string) =>
  arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];

const getDisplayLabel = (selected: string[], allLabel: string) => {
  if (selected.length === 0) return allLabel;
  if (selected.length === 1) return selected[0].length > 20 ? selected[0].slice(0, 20) + "…" : selected[0];
  return `${selected.length} seleccionadas`;
};

const hasActiveFilters = (dateFrom: Date | undefined, dateTo: Date | undefined, otherFilter: string[]) =>
  dateFrom !== undefined || dateTo !== undefined || otherFilter.length > 0;

const EarningsFilters = ({
  documentFilter,
  onDocumentFilterChange,
  documentIds,
  relatedDocumentIds,
  creatorFilter,
  onCreatorFilterChange,
  creatorNames,
  relatedCreatorNames,
  totalCount,
  searchQuery,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onToday,
  onYesterday,
  pageSize,
  onPageSizeChange,
}: EarningsFiltersProps) => {
  const showCreatorHints = hasActiveFilters(dateFrom, dateTo, documentFilter);
  const showDocumentHints = hasActiveFilters(dateFrom, dateTo, creatorFilter);

  return (
  <div className="space-y-3">
    {/* Row 1: Search + multi-select dropdowns */}
    <div className="flex items-center gap-3 flex-wrap">
      <Filter className="h-4 w-4 text-muted-foreground" />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar creadora..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-52 h-8 text-xs pl-8"
        />
      </div>

      {/* Creator multi-select */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Creadora:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-48 h-8 text-xs justify-between font-normal">
              {getDisplayLabel(creatorFilter, "Todas")}
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            {creatorFilter.length > 0 && (
              <div className="p-2 border-b">
                <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => onCreatorFilterChange([])}>
                  Limpiar
                </Button>
              </div>
            )}
            <ScrollArea className="h-60">
              <div className="p-2 space-y-1">
                {creatorNames.map((name) => {
                  const isRelated = showCreatorHints && relatedCreatorNames.has(name);
                  const isUnrelated = showCreatorHints && !relatedCreatorNames.has(name);
                  return (
                    <label key={name} className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-xs",
                      isRelated && !creatorFilter.includes(name) && "bg-primary/10 font-medium",
                      isUnrelated && "opacity-40"
                    )}>
                      <Checkbox
                        checked={creatorFilter.includes(name)}
                        onCheckedChange={() => onCreatorFilterChange(toggleItem(creatorFilter, name))}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Document ID multi-select */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Document ID:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-64 h-8 text-xs justify-between font-normal">
              {getDisplayLabel(documentFilter.map((id) => id.slice(0, 8) + "…"), "Todos")}
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            {documentFilter.length > 0 && (
              <div className="p-2 border-b">
                <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => onDocumentFilterChange([])}>
                  Limpiar
                </Button>
              </div>
            )}
            <ScrollArea className="h-60">
              <div className="p-2 space-y-1">
                {documentIds.map((id) => {
                  const isRelated = showDocumentHints && relatedDocumentIds.has(id);
                  const isUnrelated = showDocumentHints && !relatedDocumentIds.has(id);
                  return (
                    <label key={id} className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-xs",
                      isRelated && !documentFilter.includes(id) && "bg-primary/10 font-medium",
                      isUnrelated && "opacity-40"
                    )}>
                      <Checkbox
                        checked={documentFilter.includes(id)}
                        onCheckedChange={() => onDocumentFilterChange(toggleItem(documentFilter, id))}
                      />
                      {id.slice(0, 8)}…
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    {/* Row 2: Date range + page size + count */}
    <div className="flex items-center gap-3 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-36 justify-start text-left text-xs font-normal",
              !dateFrom && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Desde"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateFrom}
            onSelect={onDateFromChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-36 justify-start text-left text-xs font-normal",
              !dateTo && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {dateTo ? format(dateTo, "dd/MM/yyyy") : "Hasta"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateTo}
            onSelect={onDateToChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" className="text-xs" onClick={onToday}>
        Hoy
      </Button>
      <Button variant="outline" size="sm" className="text-xs" onClick={onYesterday}>
        Ayer
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Por página:</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(v === "all" ? "all" : Number(v))}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="150">150</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {totalCount} registros
        </span>
      </div>
    </div>
  </div>
  );
};

export default EarningsFilters;
