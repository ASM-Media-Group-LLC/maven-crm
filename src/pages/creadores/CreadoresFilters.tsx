import { Search, List, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CreadorFilters } from "./useCreadores";

interface Props {
  filters: CreadorFilters;
  onChange: (patch: Partial<CreadorFilters>) => void;
  agencies: string[];
  categories: string[];
  countries: string[];
  cities: string[];
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
}

const CreadoresFilters = ({
  filters,
  onChange,
  agencies,
  categories,
  countries,
  cities,
  view,
  onViewChange,
}: Props) => (
  <div className="space-y-4">
    {/* Agency tabs */}
    <Tabs
      value={filters.agency || "__all__"}
      onValueChange={(v) => onChange({ agency: v === "__all__" ? "" : v })}
    >
      <TabsList className="flex-wrap">
        <TabsTrigger value="__all__">Todas</TabsTrigger>
        {agencies.map((a) => (
          <TabsTrigger key={a} value={a}>
            {a}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>

    {/* Search + selects + view toggle */}
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar creador…"
          className="pl-9"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>

      <FilterSelect
        placeholder="Estado"
        value={filters.status}
        options={["active", "onboarding", "paused", "leaving", "terminated"]}
        onChange={(v) => onChange({ status: v })}
      />
      <FilterSelect
        placeholder="Categoría"
        value={filters.category}
        options={categories}
        onChange={(v) => onChange({ category: v })}
      />
      <FilterSelect
        placeholder="País"
        value={filters.country}
        options={countries}
        onChange={(v) => onChange({ country: v })}
      />
      <FilterSelect
        placeholder="Ciudad"
        value={filters.city}
        options={cities}
        onChange={(v) => onChange({ city: v })}
      />

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
  </div>
);

function FilterSelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
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

export default CreadoresFilters;
