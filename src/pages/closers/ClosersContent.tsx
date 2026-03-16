import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { useCloserLeads } from "./hooks/useCloserLeads";
import ClosersKPICards from "./components/ClosersKPICards";
import CloserTable from "./components/LeadTable";
import AssignCloserDialog from "./components/AssignCloserDialog";
import { useState } from "react";

const TABS = [
  { value: "todas", label: "Todas" },
  { value: "asignadas", label: "Asignadas" },
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
    updateField, updateStage, assignCreator,
    isAdmin, isManager,
  } = useCloserLeads();

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; assignee: string | null } | null>(null);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Pipeline de cierre de modelos</p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setAssignTarget({ id: "", assignee: null }); setAssignDialogOpen(true); }}>
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
              {search && (
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  <X className="h-4 w-4 mr-1" /> Limpiar
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                <CloserTable
                  creators={creators}
                  activeTab={activeTab}
                  onStageChange={(id, stage) => updateStage.mutate({ id, stage })}
                  onFieldChange={(id, field, value) => updateField.mutate({ id, field, value })}
                  onAssign={(id, assignee) => {
                    setAssignTarget({ id, assignee });
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
