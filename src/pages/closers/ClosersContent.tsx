import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, ChevronLeft, ChevronRight, UserPlus, LayoutGrid, List } from "lucide-react";
import { useCloserLeads, PLATFORMS, type DateFieldType } from "./hooks/useCloserLeads";
import ClosersKPICards from "./components/ClosersKPICards";
import CloserTable from "./components/LeadTable";
import AssignCloserDialog from "./components/AssignCloserDialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState, useMemo, useEffect } from "react";

const ALL_TABS = [
  { value: "todas", label: "Todas" },
  { value: "asignadas", label: "Asignaciones" },
  { value: "confirmadas", label: "Confirmadas" },
  { value: "completadas", label: "Completadas" },
  { value: "no_interesadas", label: "No Interesadas" },
];

const ClosersContent = () => {
  const {
    creators, isLoading, statusCounts, platformRevenue,
    totalCount, totalPages, page, setPage,
    search, setSearch,
    activeTab, setActiveTab,
    agentFilter, setAgentFilter,
    platformFilter, setPlatformFilter,
    agentList,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateField, setDateField,
    updateField, updateStage, assignCreator, convertLeadgenEntry,
    isAdmin, isManager,
  } = useCloserLeads();

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; assignee: string | null; source: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const hasFilters = !!(search || agentFilter || platformFilter || dateFrom || dateTo);

  const TABS = useMemo(() =>
    (isAdmin || isManager) ? ALL_TABS : ALL_TABS.filter(t => t.value !== "todas"),
    [isAdmin, isManager]
  );

  const sourceAccounts = useMemo(() =>
    [...new Set(creators.map(c => c.source_account).filter(Boolean))] as string[],
    [creators]
  );

  // Redirect to "todas" when admin/manager role resolves
  useEffect(() => {
    if ((isAdmin || isManager) && activeTab === "asignadas") {
      setActiveTab("todas");
    }
  }, [isAdmin, isManager]);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Pipeline de cierre de modelos</p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setAssignTarget({ id: "", assignee: null, source: "closer" }); setAssignDialogOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-1" /> Asignar
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="shrink-0 px-6 pt-4 pb-2 space-y-4 bg-background border-b border-border">
            <ClosersKPICards statusCounts={statusCounts} platformRevenue={platformRevenue} />

            <TabsList className="flex-wrap">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  {statusCounts[
                    tab.value === "todas" ? "" :
                    tab.value === "asignadas" ? "Asignada" :
                    tab.value === "confirmadas" ? "Confirmada" :
                    tab.value === "completadas" ? "Completada" :
                    "No interesada"
                  ] ? ` (${statusCounts[
                    tab.value === "asignadas" ? "Asignada" :
                    tab.value === "confirmadas" ? "Confirmada" :
                    tab.value === "completadas" ? "Completada" :
                    "No interesada"
                  ]})` : ""}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por handle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select
                value={agentFilter || ""}
                onValueChange={(v) => setAgentFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-44 h-10">
                  <SelectValue placeholder="Agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {agentList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={platformFilter || ""}
                onValueChange={(v) => setPlatformFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-40 h-10">
                  <SelectValue placeholder="Plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={dateField}
                onValueChange={(v) => setDateField(v as DateFieldType)}
              >
                <SelectTrigger className="w-44 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed_date">Fecha de paso</SelectItem>
                  <SelectItem value="lg_entry_date">Fecha LeadGen</SelectItem>
                </SelectContent>
              </Select>

              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onApply={(from, to) => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
                placeholder="Seleccionar fechas"
              />

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAgentFilter(null); setPlatformFilter(null); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-4 w-4 mr-1" /> Limpiar
                </Button>
              )}

              <div className="ml-auto flex items-center gap-1 border border-border rounded-md p-0.5">
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                <CloserTable
                  sourceAccounts={sourceAccounts}
                  creators={creators}
                  activeTab={activeTab}
                  viewMode={viewMode}
                  onStageChange={(id, stage, source) => {
                    if (source === "leadgen") {
                      convertLeadgenEntry.mutate({ leadgenEntryId: id, stage });
                    } else {
                      updateStage.mutate({ id, stage });
                    }
                  }}
                  onFieldChange={(id, field, value) => updateField.mutate({ id, field, value })}
                  onAssign={(id, assignee, source) => {
                    setAssignTarget({ id, assignee, source: source || "closer" });
                    setAssignDialogOpen(true);
                  }}
                  isAdmin={isAdmin}
                />
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {creators.length} de {totalCount}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}

      <AssignCloserDialog
        creatorId={assignTarget?.id || null}
        currentAssignee={assignTarget?.assignee || null}
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        onAssign={(id, assignedTo) => {
          assignCreator.mutate({ id, assigned_to: assignedTo });
          setAssignDialogOpen(false);
        }}
      />
    </main>
  );
};

export default ClosersContent;
