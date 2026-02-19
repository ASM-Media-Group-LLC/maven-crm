import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import CreadoresFilters from "./CreadoresFilters";
import CreadoresTable from "./CreadoresTable";
import CreadoresGrid from "./CreadoresGrid";
import CreadoresKPICards from "./CreadoresKPICards";
import { useCreadores, type CreadorFilters } from "./useCreadores";

const emptyFilters: CreadorFilters = {
  search: "",
  agency: "",
  status: "",
  category: "",
  country: "",
  city: "",
  manager: "",
};

const CreadoresContent = () => {
  const [filters, setFilters] = useState<CreadorFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const navigate = useNavigate();

  const { creators, allCreators, isLoading, statusCounts, agencies, categories, countries, cities, managers } =
    useCreadores(filters);

  const updateFilters = (patch: Partial<CreadorFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Listado de Creadores</h1>
            <p className="text-sm text-muted-foreground">
              Total: {isLoading ? "…" : allCreators.length} creadores
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/creadores/nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Creador
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <CreadoresKPICards counts={statusCounts} />

          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            <Button
              variant={filters.agency === "" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => updateFilters({ agency: "" })}
            >
              Todas
            </Button>
            {agencies.map((agency) => (
              <Button
                key={agency}
                variant={filters.agency === agency ? "secondary" : "ghost"}
                size="sm"
                onClick={() => updateFilters({ agency })}
              >
                {agency}
              </Button>
            ))}
          </div>

          <CreadoresFilters
            filters={filters}
            onChange={updateFilters}
            categories={categories}
            countries={countries}
            cities={cities}
            managers={managers}
            view={view}
            onViewChange={setView}
            hasActiveFilters={!!(filters.search || filters.status || filters.category || filters.country || filters.city || filters.manager)}
            onClear={() => setFilters(emptyFilters)}
          />

          {view === "table" ? (
            <CreadoresTable creators={creators} />
          ) : (
            <CreadoresGrid creators={creators} />
          )}
        </div>
      )}
    </main>
  );
};

export default CreadoresContent;
