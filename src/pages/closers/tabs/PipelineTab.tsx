import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import CreatorTable from "../components/CreatorTable";
import { CloserCreator, STAGES } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
  onEdit: (c: CloserCreator) => void;
}

const PipelineTab = ({ creators, onView, onEdit }: Props) => {
  const [stageFilter, setStageFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const filtered = creators.filter((c) => {
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

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "category", label: "Categoría" },
    { key: "stage", label: "Estado" },
    { key: "last_contact_date", label: "Último contacto" },
    { key: "estimated_monetization", label: "Monetización" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={stageFilter || undefined} onValueChange={(v) => setStageFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar por etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las etapas</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
          placeholder="Fecha de paso"
        />
      </div>
      <CreatorTable creators={filtered} columns={columns} onView={onView} onEdit={onEdit} showActions />
    </div>
  );
};

export default PipelineTab;
