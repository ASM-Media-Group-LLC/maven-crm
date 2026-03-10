import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CreatorTable from "../components/CreatorTable";
import { CloserCreator, STAGES } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
  onEdit: (c: CloserCreator) => void;
}

const PipelineTab = ({ creators, onView, onEdit }: Props) => {
  const [stageFilter, setStageFilter] = useState("");

  const filtered = stageFilter ? creators.filter((c) => c.stage === stageFilter) : creators;

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
      </div>
      <CreatorTable creators={filtered} columns={columns} onView={onView} onEdit={onEdit} showActions />
    </div>
  );
};

export default PipelineTab;
