import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import CreadoresKPICards from "./CreadoresKPICards";
import CreadoresFilters from "./CreadoresFilters";
import CreadoresTable from "./CreadoresTable";
import CreadoresGrid from "./CreadoresGrid";
import AddCreadorModal from "./AddCreadorModal";
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
  const [modalOpen, setModalOpen] = useState(false);

  const { creators, isLoading, statusCounts, agencies, categories, countries, cities, managers } =
    useCreadores(filters);

  const updateFilters = (patch: Partial<CreadorFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creadores</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu base de creadores</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Creador
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <CreadoresKPICards counts={statusCounts} />

          <CreadoresFilters
            filters={filters}
            onChange={updateFilters}
            onClear={() => setFilters(emptyFilters)}
            agencies={agencies}
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

      <AddCreadorModal open={modalOpen} onOpenChange={setModalOpen} />
    </main>
  );
};

export default CreadoresContent;
