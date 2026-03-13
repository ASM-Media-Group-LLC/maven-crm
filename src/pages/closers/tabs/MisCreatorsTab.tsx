import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import CreatorTable from "../components/CreatorTable";
import { CloserCreator, STAGES } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
  onEdit: (c: CloserCreator) => void;
  onDelete: (c: CloserCreator) => void;
  onStageChange: (id: string, stage: string) => void;
}

const MisCreatorsTab = ({ creators, onView, onEdit, onDelete, onStageChange }: Props) => {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const filtered = creators.filter((c) => {
    if (search && !c.instagram_handle.toLowerCase().includes(search.toLowerCase())) return false;
    if (stageFilter && c.stage !== stageFilter) return false;
    if (dateFrom && c.passed_date) {
      if (new Date(c.passed_date) < dateFrom) return false;
    }
    if (dateTo && c.passed_date) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(c.passed_date) > end) return false;
    }
    if ((dateFrom || dateTo) && !c.passed_date) return false;
    return true;
  });

  const hasFilters = search || stageFilter || dateFrom || dateTo;

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "category", label: "Categoría" },
    { key: "passed_date", label: "Fecha de paso" },
    { key: "source_account", label: "Cuenta origen" },
    {
      key: "contactada",
      label: "Contactada?",
      render: (c: CloserCreator) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          c.last_contact_date
            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
            : "bg-destructive/10 text-destructive"
        }`}>
          {c.last_contact_date ? "Sí" : "No"}
        </span>
      ),
    },
    { key: "phone", label: "Número" },
    { key: "onlyfans_url", label: "OnlyFans" },
    { key: "estimated_monetization", label: "Monetización" },
    { key: "agency_commission", label: "Comisión" },
    { key: "stage", label: "Estado" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar Instagram..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[220px]" />
        </div>
        <Select value={stageFilter || undefined} onValueChange={(v) => setStageFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
          placeholder="Fecha de paso"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStageFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="mr-1.5 h-4 w-4" /> Limpiar
          </Button>
        )}
      </div>
      <CreatorTable
        creators={filtered}
        columns={columns}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onStageChange={onStageChange}
      />
    </div>
  );
};

export default MisCreatorsTab;
