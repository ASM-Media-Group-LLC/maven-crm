import { Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EarningsFiltersProps {
  documentFilter: string;
  onDocumentFilterChange: (value: string) => void;
  documentIds: string[];
  creatorFilter: string;
  onCreatorFilterChange: (value: string) => void;
  creatorNames: string[];
  totalCount: number;
}

const EarningsFilters = ({
  documentFilter,
  onDocumentFilterChange,
  documentIds,
  creatorFilter,
  onCreatorFilterChange,
  creatorNames,
  totalCount,
}: EarningsFiltersProps) => (
  <div className="flex items-center gap-4 flex-wrap">
    <Filter className="h-4 w-4 text-muted-foreground" />

    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Creadora:</span>
      <Select value={creatorFilter} onValueChange={onCreatorFilterChange}>
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue placeholder="Todas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {creatorNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Document ID:</span>
      <Select value={documentFilter} onValueChange={onDocumentFilterChange}>
        <SelectTrigger className="w-64 h-8 text-xs">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {documentIds.map((id) => (
            <SelectItem key={id} value={id}>
              {id.slice(0, 8)}…
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <span className="text-xs text-muted-foreground">
      {totalCount} registros
    </span>
  </div>
);

export default EarningsFilters;
