import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, UserPlus, LayoutGrid, List, LayoutDashboard, ListChecks } from "lucide-react";
import DataTableShell from "@/components/ui/data-table-shell";
import { useCloserLeads, PLATFORMS, type DateFieldType, type CloserCreatorRow } from "./hooks/useCloserLeads";
import ClosersKPICards from "./components/ClosersKPICards";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import CloserTable from "./components/LeadTable";
import AssignCloserDialog from "./components/AssignCloserDialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const ALL_TABS = [
  { value: "todas", label: "Todas" },
  { value: "nuevo", label: "Nuevo" },
  { value: "asignadas", label: "Asignaciones" },
  { value: "confirmadas", label: "Confirmadas" },
  { value: "completadas", label: "Completadas" },
  { value: "no_interesadas", label: "No Interesadas" },
];

const ClosersContent = () => {
  const {
    creators, isLoading, statusCounts, platformRevenue, platformSalesByCreator, ofMonetizationTotal,
    totalCount, totalPages, page, setPage,
    search, setSearch,
    activeTab, setActiveTab,
    agentFilter, setAgentFilter,
    platformFilter, setPlatformFilter,
    agentList,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateField, setDateField,
    updateField, updateStage, assignCreator,
    isAdmin, isManager,
  } = useCloserLeads();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  type KpiPopupState = { kind: "pipeline"; key: "total" | "asignadas" | "confirmadas" | "completadas" | "cerradas" | "no_interesadas" } | { kind: "revenue"; platform: string };
  const [kpiPopup, setKpiPopup] = useState<KpiPopupState | null>(null);
  // Subtab top-level — Dashboard (KPI cards) vs Operaciones (tabs/filtros/tabla)
  const [viewTab, setViewTab] = useState<"dashboard" | "operaciones">("dashboard");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; assignee: string | null; source: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) {
      setStatsCollapsed(true);
    }
  }, []);

  const handleConvertToCreator = async (c: CloserCreatorRow) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No se pudo obtener el usuario autenticado");
      const { error } = await supabase.from("creators").insert({
        name: c.instagram_handle,
        instagram_handle: c.instagram_handle,
        category: c.category,
        phone: c.phone,
        notes: c.notes,
        closer_responsible_id: c.assigned_to,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Creadora creada", description: `${c.instagram_handle} fue convertida a creadora.` });
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const hasFilters = !!(search || agentFilter || platformFilter || dateFrom || dateTo);

  const TABS = useMemo(() =>
    (isAdmin || isManager) ? ALL_TABS : ALL_TABS.filter(t => t.value !== "todas"),
    [isAdmin, isManager]
  );

  const sourceAccounts = useMemo(() =>
    [...new Set(creators.map(c => c.source_account).filter(Boolean))] as string[],
    [creators]
  );


  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Pipeline de cierre de modelos</p>
          </div>
          {(isAdmin || isManager) && (
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
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setStatsCollapsed(false); }} className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Subtabs top-level — Dashboard vs Operaciones */}
          <div className="shrink-0 px-6 pt-4 pb-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              <Button
                variant={viewTab === "dashboard" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewTab("dashboard")}
              >
                <LayoutDashboard className="mr-1.5 h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant={viewTab === "operaciones" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewTab("operaciones")}
              >
                <ListChecks className="mr-1.5 h-4 w-4" />
                Operaciones
              </Button>
            </div>
          </div>

          {/* DASHBOARD — KPI cards (pipeline + revenue) */}
          {viewTab === "dashboard" && (
            <div className="shrink-0 px-6 pb-6 overflow-auto">
              <ClosersKPICards
                statusCounts={statusCounts}
                platformRevenue={platformRevenue}
                ofMonetizationTotal={ofMonetizationTotal}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onPipelineClick={(key) => setKpiPopup({ kind: "pipeline", key })}
                onRevenueClick={(platform) => setKpiPopup({ kind: "revenue", platform })}
              />
            </div>
          )}

          {/* OPERACIONES — tabs + filtros + tabla */}
          {viewTab === "operaciones" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-6 pt-2 pb-2 space-y-4 bg-background border-b border-border">
            <TabsList className="flex-wrap">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  {statusCounts[
                    tab.value === "todas" ? "" :
                    tab.value === "nuevo" ? "Nuevo" :
                    tab.value === "asignadas" ? "Asignada" :
                    tab.value === "confirmadas" ? "Confirmada" :
                    tab.value === "completadas" ? "Completada" :
                    "No interesada"
                  ] ? ` (${statusCounts[
                    tab.value === "nuevo" ? "Nuevo" :
                    tab.value === "asignadas" ? "Asignada" :
                    tab.value === "confirmadas" ? "Confirmada" :
                    tab.value === "completadas" ? "Completada" :
                    "No interesada"
                  ]})` : ""}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center gap-3 overflow-x-auto">
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

              <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
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

          <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
            <DataTableShell
              key={activeTab}
              className="flex-1 min-h-0"
              currentPage={page + 1}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={50}
              onPageChange={(p) => setPage(p - 1)}
              onScroll={handleContentScroll}
            >
              <CloserTable
                sourceAccounts={sourceAccounts}
                creators={creators}
                activeTab={activeTab}
                viewMode={viewMode}
                onStageChange={(id, stage) => {
                  updateStage.mutate({ id, stage });
                }}
                onFieldChange={(id, field, value) => updateField.mutate({ id, field, value })}
                onConvertToCreator={handleConvertToCreator}
                onAssign={(id, assignee, source) => {
                  setAssignTarget({ id, assignee, source: source || "closer" });
                  setAssignDialogOpen(true);
                }}
                isAdmin={isAdmin}
                platformSalesByCreator={platformSalesByCreator}
              />
            </DataTableShell>
          </div>
          </div>
          )}
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

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          if (!kpiPopup) return "";
          if (kpiPopup.kind === "pipeline") {
            const labels: Record<string, string> = { total: "Pipeline Total", asignadas: "Asignadas", confirmadas: "Confirmadas", completadas: "Completadas", cerradas: "Cerradas (Confirmadas + Completadas)", no_interesadas: "No Interesadas" };
            return labels[kpiPopup.key] ?? "";
          }
          return `Revenue ${kpiPopup.platform}`;
        })()}
        subtitle={kpiPopup?.kind === "revenue" ? "Detalle por creadora" : undefined}
        rows={(() => {
          if (!kpiPopup) return [];
          if (kpiPopup.kind === "pipeline") {
            // CloserCreatorRow usa `stage` (no `status`) y `instagram_handle`
            // (no `name`/`artistic_name`). Antes el popup salía vacío
            // porque filtraba por un campo que no existe → siempre 0
            // matches.
            const filterByStage = (stages: string[]): CloserCreatorRow[] =>
              creators.filter((c: CloserCreatorRow) => stages.includes(c.stage ?? ""));
            let list: CloserCreatorRow[] = [];
            switch (kpiPopup.key) {
              case "total": list = creators; break;
              case "asignadas": list = filterByStage(["Asignada"]); break;
              case "confirmadas": list = filterByStage(["Confirmada"]); break;
              case "completadas": list = filterByStage(["Completada"]); break;
              case "cerradas": list = filterByStage(["Confirmada", "Completada"]); break;
              case "no_interesadas": list = filterByStage(["No interesada"]); break;
            }
            const tone = (stage: string): KpiRow["rightTone"] =>
              stage === "Completada" || stage === "Confirmada" ? "success" :
              stage === "No interesada" ? "destructive" :
              stage === "Asignada" ? "warning" : "default";
            return list.map((c): KpiRow => ({
              primary: c.instagram_handle ? `@${c.instagram_handle}` : "Sin handle",
              secondary: c.agent_name ?? "Sin asignar",
              right: c.stage ?? "—",
              rightTone: tone(c.stage ?? ""),
            }));
          }
          if (kpiPopup.kind === "revenue") {
            const platformKey = kpiPopup.platform;
            const sales = (platformSalesByCreator?.[platformKey] ?? []) as Array<{ creator_name?: string; amount?: number }>;
            return sales.map((s): KpiRow => ({
              primary: s.creator_name ?? "Sin creador",
              right: `$${(Number(s.amount) || 0).toLocaleString()}`,
              rightTone: "success",
            }));
          }
          return [];
        })()}
      />
    </main>
  );
};

export default ClosersContent;
