import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DataTableShell from "@/components/ui/data-table-shell";
import CreadoresFilters from "./CreadoresFilters";
import CreadoresTable from "./CreadoresTable";
import CreadoresGrid from "./CreadoresGrid";
import CreadoresHeader from "./CreadoresHeader";
import { useCreadores, type CreadorFilters } from "./useCreadores";
import { useScouterCompanies } from "@/hooks/useScouterLeads";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

// Default arranca con status="active" porque el listado se usa 90% del
// tiempo para operar sobre creadoras activas. Si el user quiere ver
// onboarding/paused/leaving/terminated puede cambiar el dropdown a otro
// estado o seleccionar "Todos". El botón "Limpiar filtros" vuelve a este
// default (no a vacío) para no inundar la vista con creadoras inactivas.
const defaultFilters: CreadorFilters = {
  search: "",
  agency: "",
  status: "active",
  category: "",
  country: "",
  city: "",
  manager: "",
};

const CreadoresContent = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<CreadorFilters>(defaultFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const navigate = useNavigate();
  const { role } = useUserRole();
  const { user } = useAuth();
  const isCloser = role === "closer";

  const { creators, allCreators, isLoading, statusCounts, agencies, categories, countries, cities, managers, totalCount, totalPages } =
    useCreadores(filters, page, pageSize);

  // Compañías = scouter_companies.name. Fuente única para el filtro de
  // listado y para cualquier input de compañía que enchufemos a futuro.
  const { data: scouterCompanies = [] } = useScouterCompanies();
  const companyOptions = scouterCompanies.map((c) => c.name);

  const updateFilters = (patch: Partial<CreadorFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <CreadoresHeader
        action={
          <Button onClick={() => navigate("/creadores/nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            {t("creadores.list.addCreator")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
          {/* KPI cards removidos — la info ya vive en el dashboard. El
              listado queda enfocado solo en la tabla/grid. La fila de
              botones de agency también — ahora vive como filtro
              "Compañías" en CreadoresFilters, alimentado desde la
              tabla scouter_companies (única fuente de verdad). */}

          <div className="shrink-0">
            <CreadoresFilters
              filters={filters}
              onChange={updateFilters}
              categories={categories}
              countries={countries}
              cities={cities}
              managers={managers}
              companies={companyOptions}
              view={view}
              onViewChange={setView}
              hasActiveFilters={
                // status=active es el default, no cuenta como "filtro activo".
                // Cualquier otro status sí (incluído string vacío = "Todos").
                !!(
                  filters.search ||
                  (filters.status !== "active") ||
                  filters.category ||
                  filters.country ||
                  filters.city ||
                  filters.manager ||
                  filters.agency
                )
              }
              onClear={() => setFilters(defaultFilters)}
            />
          </div>

          {view === "table" ? (
            <DataTableShell
              className="flex-1 min-h-0"
              currentPage={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            >
              <CreadoresTable creators={creators} />
            </DataTableShell>
          ) : (
            <div className="flex-1 overflow-auto">
              <CreadoresGrid creators={creators} />
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default CreadoresContent;
