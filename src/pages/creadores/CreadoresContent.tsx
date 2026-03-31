import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DataTableShell from "@/components/ui/data-table-shell";
import CreadoresFilters from "./CreadoresFilters";
import CreadoresTable from "./CreadoresTable";
import CreadoresGrid from "./CreadoresGrid";
import CreadoresKPICards from "./CreadoresKPICards";
import { useCreadores, type CreadorFilters } from "./useCreadores";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const navigate = useNavigate();
  const { role } = useUserRole();
  const { user } = useAuth();
  const isCloser = role === "closer";

  const { creators: rawCreators, allCreators: rawAllCreators, isLoading, statusCounts, agencies, categories, countries, cities, managers, totalCount: rawTotalCount, totalPages: rawTotalPages } =
    useCreadores(filters, page, pageSize);

  // Closers only see creators they created (closer_responsible_id or created_by)
  const creators = useMemo(() => {
    if (!isCloser || !user?.id) return rawCreators;
    return rawCreators.filter(c => c.closer_responsible_id === user.id || c.created_by === user.id);
  }, [rawCreators, isCloser, user?.id]);

  const allCreators = useMemo(() => {
    if (!isCloser || !user?.id) return rawAllCreators;
    return rawAllCreators.filter(c => c.closer_responsible_id === user.id || c.created_by === user.id);
  }, [rawAllCreators, isCloser, user?.id]);

  const totalCount = isCloser ? creators.length : rawTotalCount;
  const totalPages = isCloser ? Math.max(1, Math.ceil(creators.length / pageSize)) : rawTotalPages;

  const updateFilters = (patch: Partial<CreadorFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

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
          {!isCloser && (
            <Button onClick={() => navigate("/creadores/nuevo")}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Creador
            </Button>
          )}
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
        <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
          <div className="shrink-0">
            <CreadoresKPICards counts={statusCounts} />
          </div>

          <div className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
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

          <div className="shrink-0">
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
