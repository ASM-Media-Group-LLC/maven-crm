import { useState, useMemo } from "react";
import CreatorSidebar from "./CreatorSidebar";
import CreatorEarningsChart from "./CreatorEarningsChart";
import EarningsBreakdownChart from "./EarningsBreakdownChart";
import EarningsHeatmap from "./EarningsHeatmap";
import ChargebacksChart from "./ChargebacksChart";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const CreatorPerformanceView = ({ rows, earningsMode }: Props) => {
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!selectedCreator) return rows;
    return rows.filter(
      (r) => r.creator_id === selectedCreator || r.pending_creator === selectedCreator
    );
  }, [rows, selectedCreator]);

  return (
    <div className="flex h-full min-h-0">
      <CreatorSidebar
        rows={rows}
        selectedCreator={selectedCreator}
        onSelectCreator={setSelectedCreator}
      />
      <div className="flex-1 overflow-auto p-6 space-y-6 min-w-0">
        <CreatorEarningsChart rows={filteredRows} earningsMode={earningsMode} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EarningsBreakdownChart rows={filteredRows} earningsMode={earningsMode} />
          <EarningsHeatmap rows={filteredRows} earningsMode={earningsMode} />
        </div>
        <ChargebacksChart rows={filteredRows} earningsMode={earningsMode} />
      </div>
    </div>
  );
};

export default CreatorPerformanceView;
