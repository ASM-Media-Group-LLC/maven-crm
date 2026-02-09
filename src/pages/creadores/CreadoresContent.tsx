import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import CreadoresFilters from "./CreadoresFilters";
import CreadoresTable from "./CreadoresTable";
import CreadoresGrid from "./CreadoresGrid";
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
  const [view, setView] = useState<"table" | "grid">("grid");
  const navigate = useNavigate();

  const { creators, allCreators, isLoading, categories, countries, cities, managers } =
    useCreadores(filters);

  const updateFilters = (patch: Partial<CreadorFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creadores</h1>
          <p className="text-sm text-muted-foreground">
            Total: {isLoading ? "…" : allCreators.length} creadores
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/creadores/nuevo")}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Creador
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <CreadoresFilters
            filters={filters}
            onChange={updateFilters}
            categories={categories}
            countries={countries}
            cities={cities}
            managers={managers}
            view={view}
            onViewChange={setView}
          />

          {view === "table" ? (
            <CreadoresTable creators={creators} />
          ) : (
            <CreadoresGrid creators={creators} />
          )}
        </>
      )}

    </main>
  );
};

export default CreadoresContent;
