import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ALL_COLUMNS, type SortField } from "./types";

interface CustomMetricsProps {
  visibleColumns: Set<SortField>;
  onToggleColumn: (key: SortField) => void;
}

const CustomMetrics = ({ visibleColumns, onToggleColumn }: CustomMetricsProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="gap-2">
        <Settings2 className="h-4 w-4" />
        Configurar tabla
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-64 p-3">
      <p className="text-sm font-medium text-foreground mb-2">Configurar columnas</p>
      <ScrollArea className="max-h-80">
        <div className="space-y-1">
          {ALL_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={visibleColumns.has(col.key)}
                onCheckedChange={() => onToggleColumn(col.key)}
              />
              <span className="text-foreground">{col.label}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
);

export default CustomMetrics;
