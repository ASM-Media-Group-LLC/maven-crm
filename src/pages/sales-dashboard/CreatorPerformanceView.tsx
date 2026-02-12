import { useState, useMemo } from "react";
import CreatorSidebar from "./CreatorSidebar";
import CreatorEarningsChart from "./CreatorEarningsChart";
import EarningsBreakdownChart from "./EarningsBreakdownChart";
import EarningsHeatmap from "./EarningsHeatmap";
import ChargebacksChart from "./ChargebacksChart";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
}

const CreatorPerformanceView = ({ rows }: Props) => {
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
        <CreatorEarningsChart rows={filteredRows} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EarningsBreakdownChart rows={filteredRows} />
          <EarningsHeatmap rows={filteredRows} />
        </div>
        <ChargebacksChart rows={filteredRows} />
      </div>
    </div>
  );
};

export default CreatorPerformanceView;
