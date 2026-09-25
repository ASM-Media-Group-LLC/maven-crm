import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, UserPlus, LayoutGrid, List, LayoutDashboard, ListChecks, Eye, TrendingUp, Activity } from "lucide-react";
import DataTableShell from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { useCloserLeads, ORIGIN_FILTERS, CATEGORY_FILTERS, REVENUE_KPI_LABEL_KEYS, platformLabel, type CloserCreatorRow } from "./hooks/useCloserLeads";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useClosersKpiPopup } from "./hooks/useClosersKpiPopup";
import ClosersKPICards from "./components/ClosersKPICards";
import ClosersKpiDetailDialog from "./components/ClosersKpiDetailDialog";
import ViewCreatorModal from "./components/ViewCreatorModal";
import ViewAsCloserPicker from "./components/ViewAsCloserPicker";
import ClosersActivityDashboard from "./components/ClosersActivityDashboard";
import CloserTable from "./components/LeadTable";
import AssignCloserDialog from "./components/AssignCloserDialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { usePermissions } from "@/hooks/usePermissions";
import OpportunitiesPage from "@/pages/opportunities/OpportunitiesPage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Tabs = SÓLO etapas del embudo. El ORIGEN (Ex-creadoras/Agencias/Ventas) y la
// CATEGORÍA pasaron a ser FILTROS (barra de abajo), no tabs: son otro eje (qué
// tipo de lead), no un paso del pipeline. "Antiguos/Nuevo" se fundieron en "Pool"
// (el corte de 30 días era arbitrario; lo útil es "sin asignar").
// `value` es la llave del tab (viaja a TAB_STAGE_MAP y a la URL de las queries):
// no se traduce. Lo que se muestra es `labelKey`.
const ALL_TABS: { value: string; labelKey: TranslationKey }[] = [
  { value: "todas", labelKey: "common.allF" },
  { value: "pool", labelKey: "closers.tab.pool" },
  { value: "asignadas", labelKey: "closers.tab.assigned" },
  { value: "confirmadas", labelKey: "closers.tab.confirmed" },
  { value: "completadas", labelKey: "closers.tab.completed" },
  { value: "no_interesadas", labelKey: "closers.tab.notInterested" },
];

// Título del popup de cada KPI del pipeline.
const PIPELINE_POPUP_TITLE_KEYS: Record<string, TranslationKey> = {
  total: "closers.popup.pipelineTotal",
  asignadas: "closers.kpi.assigned",
  confirmadas: "closers.tab.confirmed",
  completadas: "closers.tab.completed",
  cerradas: "closers.popup.closedBoth",
  no_interesadas: "closers.tab.notInterested",
};

const ClosersContent = () => {
  const {
    creators, isLoading, statusCounts, alertCounts, platformRevenue, platformSalesByCreator, ofMonetizationTotal,
    subscriptionRevenueTotal, agencyRevenueTotal,
    totalCount, totalPages, page, setPage,
    search, setSearch,
    activeTab, setActiveTab,
    agentFilter, setAgentFilter,
    originFilter, setOriginFilter,
    categoryFilter, setCategoryFilter,
    agentList,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateField,
    updateField, updateStage, assignCreator, claimLead,
    isAdmin, isManager, isSupervisor,
    viewAsCloserId, viewAsCloserName, setViewAsCloser,
  } = useCloserLeads();

  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  // Permiso granular: cualquier role con "Closers > Asignar Closer" puede
  // ver el botón. Antes el botón estaba hardcoded a (isAdmin || isManager)
  // — eso ignoraba el sistema de permisos y rompía roles custom como
  // "Closer Supervisor" que tienen el permiso pero no el role hardcoded.
  const { canAccess } = usePermissions();
  const canAssignCloser = canAccess("Closers", "Asignar Closer");
  type KpiPopupState = { kind: "pipeline"; key: "total" | "asignadas" | "confirmadas" | "completadas" | "cerradas" | "no_interesadas" } | { kind: "revenue"; platform: string };
  const [kpiPopup, setKpiPopup] = useState<KpiPopupState | null>(null);

  // /closers?id=<closer_creator> — es adonde apuntan las 662 notificaciones al
  // mes de Closers (contacto vencido, asignación, decisión) y NADIE lo leía: el
  // clic aterrizaba en la lista sin abrir el registro (auditoría 15/09). Como la
  // tabla es paginada y filtrada por etapa, el lead puede no estar en pantalla:
  // se trae por id y se abre su ficha (ViewCreatorModal) encima de lo que haya.
  const [searchParams, setSearchParams] = useSearchParams();
  const idDesdeNotificacion = searchParams.get("id");
  const [fichaDesdeNotificacion, setFichaDesdeNotificacion] = useState<CloserCreatorRow | null>(null);
  useEffect(() => {
    if (!idDesdeNotificacion) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase.from("closer_creators").select("*").eq("id", idDesdeNotificacion).maybeSingle();
      if (cancelado) return;
      if (error || !data) {
        toast({ title: t("closers.notif.leadGone"), description: t("closers.notif.leadGoneDesc") });
        searchParams.delete("id");
        setSearchParams(searchParams, { replace: true });
        return;
      }
      // El tipo generado de la tabla y CloserCreatorRow no son convertibles en
      // directo (columnas opcionales de más y de menos): se pasa por unknown.
      setFichaDesdeNotificacion(data as unknown as CloserCreatorRow);
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDesdeNotificacion]);
  const cerrarFichaDesdeNotificacion = () => {
    setFichaDesdeNotificacion(null);
    if (searchParams.has("id")) {
      searchParams.delete("id");
      setSearchParams(searchParams, { replace: true });
    }
  };
  const { data: kpiPopupResult, isLoading: kpiPopupLoading } = useClosersKpiPopup(kpiPopup, { dateFrom, dateTo, dateField, viewAsCloserId });
  // Subtab top-level — Dashboard (KPI cards) vs Actividad (contactos por empleado) vs Operaciones (tabs/filtros/tabla)
  const [viewTab, setViewTab] = useState<"dashboard" | "actividad" | "operaciones" | "oportunidades">("dashboard");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; assignee: string | null; source: string } | null>(null);
  const [convertTarget, setConvertTarget] = useState<CloserCreatorRow | null>(null);
  const [converting, setConverting] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) {
      setStatsCollapsed(true);
    }
  }, []);

  // Match de historial para detectar duplicado/REINGRESO al convertir:
  // fila viva en creators (activa u operativa → no duplicar; terminated/leaving/
  // paused → ofrecer Reactivar) o registro BORRADO en creator_status_history
  // (→ convertir marcando reingreso). null = creadora nueva de verdad.
  const [convertMatch, setConvertMatch] = useState<{ creator_id: string; name: string | null; status: string; source: string } | null>(null);
  const [convertCheckLoading, setConvertCheckLoading] = useState(false);
  const REACTIVATABLE = ["terminated", "leaving", "paused"];

  // Click en "Convertir a Creadora" → abre el popup de confirmación
  // (antes convertía de una, sin preguntar) y chequea historial del handle.
  const handleConvertToCreator = (c: CloserCreatorRow) => {
    // Guard: solo reclutamiento se convierte. Una venta de plataforma es a una
    // creadora existente; una agencia es B2B → convertir insertaría una creadora
    // basura (el handle es el nombre de la agencia, no matchea a nadie → Rama 3).
    // El botón ya se oculta para estos casos; esto es defensa en profundidad.
    if (c.deal_type !== "reclutamiento") {
      toast({
        title: t("closers.convert.notApplicable"),
        description: c.lead_source === "agencia"
          ? t("closers.convert.agencyNo")
          : t("closers.convert.platformSaleNo"),
      });
      return;
    }
    setConvertTarget(c);
    setConvertMatch(null);
    setConvertCheckLoading(true);
    (supabase as any)
      .rpc("find_creator_history_by_handle", { p_handle: c.instagram_handle ?? "" })
      .then(({ data }: { data: Array<{ creator_id: string; name: string | null; status: string; source: string }> | null }) => {
        const rows = data ?? [];
        // Prioridad: fila viva > registro borrado del historial.
        setConvertMatch(rows.find((r) => r.source === "creators") ?? rows.find((r) => r.source === "history") ?? null);
      })
      .catch(() => setConvertMatch(null))
      .finally(() => setConvertCheckLoading(false));
  };

  // Conversión real, recién al confirmar en el popup: inserta en creators.
  const doConvertToCreator = async () => {
    const c = convertTarget;
    if (!c) return;
    setConverting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("closers.convert.noUser"));

      // Rama 1: YA existe viva y operativa (active/onboarding/borrador/…) → no duplicar.
      if (convertMatch && convertMatch.source === "creators" && !REACTIVATABLE.includes(convertMatch.status)) {
        toast({
          title: t("closers.convert.alreadyExists"),
          description: t("closers.convert.alreadyExistsDesc", { handle: c.instagram_handle, status: convertMatch.status }),
        });
        setConvertTarget(null);
        return;
      }

      // Rama 2: fue creadora (terminated/leaving/paused) → REACTIVAR el registro
      // existente como reingreso (RPC quirúrgica: los closers no tienen UPDATE
      // amplio sobre creators).
      if (convertMatch && convertMatch.source === "creators") {
        const { data, error } = await (supabase as any).rpc("reactivate_creator", {
          p_creator_id: convertMatch.creator_id,
          p_closer_responsible: c.assigned_to ?? user.id,
        });
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new Error(t("closers.convert.cantReactivate"));
        }
        toast({ title: t("closers.convert.reactivated"), description: t("closers.convert.reactivatedDesc", { handle: c.instagram_handle }) });
      } else {
        // Rama 3: nueva, o reingreso de un registro BORRADO → insert con marca.
        const isRejoin = convertMatch?.source === "history";
        const { error } = await supabase.from("creators").insert({
          name: c.instagram_handle,
          instagram_handle: c.instagram_handle,
          category: c.category,
          phone: c.phone,
          notes: c.notes,
          closer_responsible_id: c.assigned_to,
          created_by: user.id,
          status: "onboarding",
          ...(isRejoin ? { rejoined_at: new Date().toISOString(), rejoined_from: convertMatch!.creator_id } : {}),
        } as any);
        if (error) throw error;
        toast({
          title: isRejoin ? t("closers.convert.createdRejoin") : t("closers.convert.created"),
          description: isRejoin
            ? t("closers.convert.createdRejoinDesc", { handle: c.instagram_handle })
            : t("closers.convert.createdDesc", { handle: c.instagram_handle }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      setConvertTarget(null);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  const hasFilters = !!(search || agentFilter || originFilter || categoryFilter || dateFrom || dateTo);

  const TABS = useMemo(() =>
    (isAdmin || isManager || isSupervisor) ? ALL_TABS : ALL_TABS.filter((tab) => tab.value !== "todas"),
    [isAdmin, isManager, isSupervisor]
  );

  const sourceAccounts = useMemo(() =>
    [...new Set(creators.map(c => c.source_account).filter(Boolean))] as string[],
    [creators]
  );


  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title="Closers"
          subtitle={t("closers.subtitle")}
          actions={
            <>
              {/* En "Actividad" no mostramos este date-picker ni "Asignar":
                  esa vista tiene su propio filtro de fecha (evita el doble
                  selector confuso) y asignar leads no aplica ahí. */}
              {viewTab !== "actividad" && (
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onApply={(from, to) => {
                    setDateFrom(from);
                    setDateTo(to);
                  }}
                  placeholder={t("closers.selectDates")}
                />
              )}
              {(isAdmin || isManager || isSupervisor) && (
                <ViewAsCloserPicker
                  value={viewAsCloserId}
                  onChange={(id, name) => setViewAsCloser(id, name)}
                />
              )}
              {viewTab !== "actividad" && (isAdmin || isManager || canAssignCloser) && (
                <Button size="sm" onClick={() => { setAssignTarget({ id: "", assignee: null, source: "closer" }); setAssignDialogOpen(true); }}>
                  <UserPlus className="h-4 w-4 mr-1" /> {t("closers.assign")}
                </Button>
              )}
            </>
          }
        />
      </header>

      {/* Banner sticky cuando el admin está viendo "como" otro closer.
          Gradient violet + chevron, claro y persistente. Click en X
          cancela la vista. */}
      {viewAsCloserId && (
        <div className="shrink-0 border-b border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 px-6 py-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/25 ring-1 ring-primary/40">
                <Eye className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-primary/80 font-bold leading-tight">
                  {t("closers.viewAs.filtered")}
                </p>
                <p className="text-sm font-semibold truncate">
                  {t("closers.viewAs.viewing")} <span className="text-primary">{viewAsCloserName || t("closers.viewAs.thisCloser")}</span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-primary hover:bg-primary/15"
              onClick={() => setViewAsCloser(null, null)}
            >
              <X className="h-4 w-4 mr-1" /> {t("closers.viewAs.cancel")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-6">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setStatsCollapsed(false); }} className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Subtabs top-level — Dashboard vs Operaciones */}
          <div className="shrink-0 px-6 pt-4 pb-2">
            <SubtabNav>
              <SubtabNavItem
                active={viewTab === "dashboard"}
                onClick={() => setViewTab("dashboard")}
              >
                <LayoutDashboard className="mr-1.5 h-4 w-4" />
                Dashboard
              </SubtabNavItem>
              {canAccess("Closers", "Actividad") && (
                <SubtabNavItem
                  active={viewTab === "actividad"}
                  onClick={() => setViewTab("actividad")}
                >
                  <Activity className="mr-1.5 h-4 w-4" />
                  {t("closers.sub.activity")}
                </SubtabNavItem>
              )}
              <SubtabNavItem
                active={viewTab === "operaciones"}
                onClick={() => setViewTab("operaciones")}
              >
                <ListChecks className="mr-1.5 h-4 w-4" />
                {t("closers.sub.operations")}
              </SubtabNavItem>
              {canAccess("Closers", "Oportunidades") && (
                <SubtabNavItem
                  active={viewTab === "oportunidades"}
                  onClick={() => setViewTab("oportunidades")}
                >
                  <TrendingUp className="mr-1.5 h-4 w-4" />
                  {t("closers.sub.opportunities")}
                </SubtabNavItem>
              )}
            </SubtabNav>
          </div>

          {/* DASHBOARD — KPI cards (pipeline + revenue) */}
          {viewTab === "dashboard" && (
            <div className="shrink-0 px-6 pb-6 overflow-auto">
              <ClosersKPICards
                statusCounts={statusCounts}
                platformRevenue={platformRevenue}
                ofMonetizationTotal={ofMonetizationTotal}
                subscriptionRevenueTotal={subscriptionRevenueTotal}
                agencyRevenueTotal={agencyRevenueTotal}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onPipelineClick={(key) => setKpiPopup({ kind: "pipeline", key })}
                onRevenueClick={(platform) => setKpiPopup({ kind: "revenue", platform })}
              />
            </div>
          )}

          {/* ACTIVIDAD — dashboard diario de contactos hechos por cada empleado
              (manual del chip N/6 + auto de la bandeja WA/TG), filtrable por
              fecha. El gate por rol (admin/manager ven a todos; el closer solo a
              sí mismo) vive en las RPCs get_closer_activity*. */}
          {viewTab === "actividad" && canAccess("Closers", "Actividad") && (
            <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
              <ClosersActivityDashboard
                isAdmin={isAdmin}
                isManager={isManager}
                viewAsCloserId={viewAsCloserId}
              />
            </div>
          )}

          {/* OPORTUNIDADES — la pantalla de Oportunidades de monetización, ahora embebida como subtab de Closers */}
          {viewTab === "oportunidades" && (
            <div className="flex-1 min-h-0 overflow-auto">
              <OpportunitiesPage />
            </div>
          )}

          {/* OPERACIONES — tabs + filtros + tabla */}
          {viewTab === "operaciones" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-6 pt-2 pb-2 space-y-4 bg-background/30 backdrop-blur-xl border-b border-white/10">
            {/* h-auto: TabsList trae h-10 fija de shadcn y con flex-wrap la 2ª
                fila se salía del contenedor y se montaba sobre los filtros
                (reporte con screenshot, 10 tabs). Con h-auto + gap el wrap
                respeta el alto real y las dos filas quedan prolijas. */}
            <TabsList className="flex-wrap h-auto gap-1 py-1">
              {TABS.map((tab) => {
                const stageKey =
                  tab.value === "todas" ? "" :
                  tab.value === "pool" ? "pool" :
                  tab.value === "asignadas" ? "Asignada" :
                  tab.value === "confirmadas" ? "Confirmada" :
                  tab.value === "completadas" ? "Completada" :
                  "No interesada";
                const count = statusCounts[stageKey];
                // Dot rojo (vencidos) + naranja (decisión) sólo en el
                // tab Asignaciones — los otros stages no tienen cadencia
                // que vigilar.
                const isAsignadas = tab.value === "asignadas";
                const hasOverdue = isAsignadas && (alertCounts?.overdue ?? 0) > 0;
                const hasDecision = isAsignadas && (alertCounts?.decision ?? 0) > 0;
                const overdueLabel = hasOverdue
                  ? t(alertCounts.overdue === 1 ? "closers.tab.overdueOne" : "closers.tab.overdueMany", { n: alertCounts.overdue })
                  : "";
                const decisionLabel = hasDecision
                  ? t("closers.tab.decisionPending", { n: alertCounts.decision })
                  : "";
                const dotTitle = [overdueLabel, decisionLabel].filter(Boolean).join(" · ");
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="relative">
                    {t(tab.labelKey)}
                    {count ? ` (${count})` : ""}
                    {(hasOverdue || hasDecision) && (
                      <span
                        title={dotTitle}
                        className={
                          "ml-1.5 inline-block h-2 w-2 rounded-full " +
                          (hasOverdue ? "bg-destructive animate-pulse" : "bg-warning")
                        }
                        aria-label={dotTitle}
                      />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="flex flex-wrap items-center gap-3 overflow-x-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("closers.searchHandle")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select
                value={agentFilter || ""}
                onValueChange={(v) => setAgentFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-44 h-10">
                  <SelectValue placeholder={t("closers.agent")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {agentList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Origen / línea de negocio (reemplaza los viejos tabs
                  Ex-creadoras / Agencias / Ventas). value="" (no "all") cuando
                  no hay filtro → ningún item matchea → se muestra el placeholder
                  "Origen" (nombre del campo), como el filtro Agente. Con value="all"
                  el trigger mostraba el texto largo del item y se cortaba. */}
              <Select
                value={originFilter || ""}
                onValueChange={(v) => setOriginFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-48 h-10">
                  <SelectValue placeholder={t("closers.origin")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("closers.allOrigins")}</SelectItem>
                  {ORIGIN_FILTERS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Categoría (nuevo). Usa ilike server-side por el casing sucio.
                  value="" cuando no hay filtro → placeholder "Categoría" (antes,
                  con value="all", mostraba "Todas las categorías" y se cortaba). */}
              <Select
                value={categoryFilter || ""}
                onValueChange={(v) => setCategoryFilter(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-40 h-10">
                  <SelectValue placeholder={t("common.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("closers.allCategories")}</SelectItem>
                  {CATEGORY_FILTERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAgentFilter(null); setOriginFilter(null); setCategoryFilter(null); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-4 w-4 mr-1" /> {t("closers.clear")}
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
                onClaim={(id) => claimLead.mutate({ id })}
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

      <ViewCreatorModal
        creator={fichaDesdeNotificacion as never}
        open={!!fichaDesdeNotificacion}
        onOpenChange={(o) => { if (!o) cerrarFichaDesdeNotificacion(); }}
      />
      <ClosersKpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          if (!kpiPopup) return "";
          if (kpiPopup.kind === "pipeline") {
            const key = PIPELINE_POPUP_TITLE_KEYS[kpiPopup.key];
            return key ? t(key) : "";
          }
          // kpiPopup.platform es la LLAVE que entiende useClosersKpiPopup
          // ("Rev. OnlyFans"… o el nombre de una plataforma): se traduce solo
          // para mostrarla.
          const revKey = REVENUE_KPI_LABEL_KEYS[kpiPopup.platform];
          return revKey
            ? t("closers.popup.revenueKpiTitle", { name: t(revKey) })
            : t("closers.popup.revenuePlatformTitle", { name: platformLabel(t, kpiPopup.platform) });
        })()}
        subtitle={kpiPopup?.kind === "revenue" ? t("closers.popup.byCreator") : undefined}
        result={kpiPopupResult}
        isLoading={kpiPopupLoading}
        popupKey={kpiPopup ? (kpiPopup.kind === "pipeline" ? `pipeline:${kpiPopup.key}` : `revenue:${kpiPopup.platform}`) : null}
      />

      <AlertDialog open={!!convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closers.convert.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {convertCheckLoading ? (
                <>{t("closers.convert.checkingA")}<strong>{convertTarget?.instagram_handle || t("closers.thisLead")}</strong>{t("closers.convert.checkingB")}</>
              ) : convertMatch && convertMatch.source === "creators" && !REACTIVATABLE.includes(convertMatch.status) ? (
                <>⚠️ <strong>{convertTarget?.instagram_handle}</strong>{t("closers.convert.existsB", { name: convertMatch.name ?? "?", status: convertMatch.status })}</>
              ) : convertMatch && convertMatch.source === "creators" ? (
                <>🔄 <strong>{convertTarget?.instagram_handle}</strong>{t("closers.convert.reactivateB", { status: convertMatch.status })}<strong>{t("closers.convert.reactivateBold")}</strong>{t("closers.convert.reactivateC")}</>
              ) : convertMatch ? (
                <>🔄 <strong>{convertTarget?.instagram_handle}</strong>{t("closers.convert.historyB")}<strong>{t("closers.convert.historyBold")}</strong>{t("closers.convert.historyC")}</>
              ) : (
                <>{t("closers.convert.newA")}<strong>{convertTarget?.instagram_handle || t("closers.thisLead")}</strong>{t("closers.convert.newB")}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting} />
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doConvertToCreator(); }} disabled={converting || convertCheckLoading}>
              {converting ? t("closers.processing")
                : convertMatch && convertMatch.source === "creators" && !REACTIVATABLE.includes(convertMatch.status) ? t("common.understood")
                : convertMatch && convertMatch.source === "creators" ? t("closers.convert.reactivateBtn")
                : convertMatch ? t("closers.convert.convertRejoinBtn")
                : t("closers.convertToCreator")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default ClosersContent;
