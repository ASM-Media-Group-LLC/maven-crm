import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, List, LayoutGrid } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDeals, STAGES, SOURCES } from "./useDeals";
import ClosersKPICards from "./ClosersKPICards";

import ClosersTable from "./ClosersTable";
import ClosersGrid from "./ClosersGrid";
import NewDealModal from "./NewDealModal";

type ViewMode = "table" | "grid";

const ClosersContent = () => {
  const { deals, isLoading, createDeal } = useDeals();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  const filtered = deals.filter((d) => {
    if (search && !d.prospect_handle.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedStage && d.stage !== selectedStage) return false;
    if (selectedSource && d.source !== selectedSource) return false;
    return true;
  });

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header sticky */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de deals y llamadas
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowNewDeal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Deal
          </Button>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPIs */}
        <ClosersKPICards deals={deals} />

        {/* Contactos placeholder */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Contactos</h2>
          <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sección de contactos próximamente
            </p>
          </div>
        </div>

        {/* Filters + toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Select value={selectedStage || undefined} onValueChange={(v) => setSelectedStage(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedSource || undefined} onValueChange={(v) => setSelectedSource(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Fuente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-1">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Views */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : viewMode === "table" ? (
          <ClosersTable deals={filtered} />
        ) : (
          <ClosersGrid deals={filtered} />
        )}
      </div>

      <NewDealModal
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        onSubmit={(data) => {
          createDeal.mutate(data, { onSuccess: () => setShowNewDeal(false) });
        }}
        isLoading={createDeal.isPending}
      />
    </main>
  );
};

export default ClosersContent;
