import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, List, LayoutGrid, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDeals, STAGES, SOURCES, Deal } from "./useDeals";
import ClosersKPICards from "./ClosersKPICards";
import ClosersTable from "./ClosersTable";
import ClosersGrid from "./ClosersGrid";
import NewDealModal from "./NewDealModal";
import EditDealModal from "./EditDealModal";
import ViewDealModal from "./ViewDealModal";
import DeleteDealDialog from "./DeleteDealDialog";

type ViewMode = "table" | "grid";

const ClosersContent = () => {
  const { deals, isLoading, createDeal, updateDeal, updateDealStage, deleteDeal } = useDeals();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  // Action state
  const [viewDeal, setViewDeal] = useState<Deal | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);

  const filtered = deals.filter((d) => {
    if (search && !d.prospect_handle.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedStage && d.stage !== selectedStage) return false;
    if (selectedSource && d.source !== selectedSource) return false;
    return true;
  });

  const handleStageChange = (id: string, stage: string) => {
    updateDealStage.mutate({ id, stage });
  };

  const handleEdit = (id: string, data: { prospect_handle: string; source: string; stage: string; notes: string }) => {
    updateDeal.mutate({ id, ...data }, { onSuccess: () => setEditDeal(null) });
  };

  const handleDelete = (id: string) => {
    deleteDeal.mutate(id, { onSuccess: () => setDeletingDeal(null) });
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Gestión de deals y llamadas</p>
          </div>
          <Button onClick={() => setShowNewDeal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Deal
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <ClosersKPICards deals={deals} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar handle..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[200px]" />
          </div>
          <Select value={selectedStage || undefined} onValueChange={(v) => setSelectedStage(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedSource || undefined} onValueChange={(v) => setSelectedSource(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Fuente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          {(search || selectedStage || selectedSource) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSelectedStage(""); setSelectedSource(""); }}>
              <X className="mr-1.5 h-4 w-4" />Limpiar filtros
            </Button>
          )}

          <div className="ml-auto flex gap-1">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : viewMode === "table" ? (
          <ClosersTable
            deals={filtered}
            onView={setViewDeal}
            onEdit={setEditDeal}
            onDelete={setDeletingDeal}
            onStageChange={handleStageChange}
          />
        ) : (
          <ClosersGrid
            deals={filtered}
            onView={setViewDeal}
            onEdit={setEditDeal}
            onDelete={setDeletingDeal}
            onStageChange={handleStageChange}
          />
        )}
      </div>

      <NewDealModal
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        onSubmit={(data) => createDeal.mutate(data, { onSuccess: () => setShowNewDeal(false) })}
        isLoading={createDeal.isPending}
      />
      <ViewDealModal deal={viewDeal} open={!!viewDeal} onOpenChange={(o) => !o && setViewDeal(null)} />
      <EditDealModal
        deal={editDeal}
        open={!!editDeal}
        onOpenChange={(o) => !o && setEditDeal(null)}
        onSubmit={handleEdit}
        isLoading={updateDeal.isPending}
      />
      <DeleteDealDialog
        deal={deletingDeal}
        open={!!deletingDeal}
        onOpenChange={(o) => !o && setDeletingDeal(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
};

export default ClosersContent;
