import { useState, useMemo, useCallback, useRef } from "react";
import DataTableShell from "@/components/ui/data-table-shell";
import { useNavigate } from "react-router-dom";
import {
  Plus, UserPlus, Database, CheckSquare, Users, BarChart3, Clock,
  Search, List, LayoutGrid, FileText, Calendar, ChevronLeft, ChevronRight, Shield, Eye, X,
  ArrowUpDown, ArrowUp, ArrowDown, LayoutDashboard, Activity,
} from "lucide-react";
import { format, isSameDay, subDays, startOfWeek, addDays, isToday, isFuture, startOfDay, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";

import { useLeadGenByDateRange, useLeadGenProfiles, useLeadGenAgentStats, useLeadGenSummaryStats, useLeadGenPhonesDaily } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { LEADGEN_COMPANIES, QUALITY_OPTIONS } from "./leadgenConstants";

import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenTable from "./LeadGenTable";
import LeadGenGrid from "./LeadGenGrid";
import AddLeadModal from "./AddLeadModal";
import AddContactoModal from "./AddContactoModal";
import MisCuentasIGModal from "./MisCuentasIGModal";
import ViewLeadModal from "./ViewLeadModal";
import DeleteLeadDialog from "./DeleteLeadDialog";
import AgentDetailView from "./AgentDetailView";
import AgentHourlyPerformance from "./AgentHourlyPerformance";
import LeadGenSupervisorView from "./LeadGenSupervisorView";
import LeadGenPerformanceView from "./LeadGenPerformanceView";
import LeadGenDashboardExtras from "./LeadGenDashboardExtras";
import ViewAsLlgPicker from "./ViewAsLlgPicker";
import AnalyticsSectionBanner from "@/components/analytics/AnalyticsSectionBanner";

const knownStatuses = new Set(["no_response", "contactado", "respondio", "interesado", "no_interesado"]);

type ViewMode = "agent" | "supervisor" | "owner";

const getWeekDays = (offset: number): Date[] => {
  const now = new Date();
  const monday = startOfWeek(addDays(now, offset * 7), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};
const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const LeadGenContent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataScope, isLoading: permsLoading } = usePermissions();
  const { isAdmin } = useUserRole();

  // Determine viewMode from permissions
  const viewMode: ViewMode = useMemo(() => {
    const scope = dataScope("LeadGen");
    if (scope === "self") return "agent";
    if (scope === "subordinates") return "supervisor";
    return "owner";
  }, [dataScope]);

  // Date range state — default al mes vigente (día 1 → hoy).
  // Antes era undefined/undefined (todo el histórico) — pero LeadGen
  // tiene 19k+ leads en backlog y para el operador típico la métrica
  // útil es "qué pasó este mes". El usuario puede ampliar el rango
  // con el picker arriba a la derecha cuando quiera ver más atrás.
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => new Date());
  const [page, setPage] = useState(0);
  const [agentPage, setAgentPage] = useState(1);
  // viewAsLgUserId — feature admin/owner: ver el panel como otro LLG.
  // Cuando está seteado, filtramos las queries por lg_user_id = ese id,
  // simulando lo que vería ese LLG (viewMode='agent').
  const [viewAsLgUserId, setViewAsLgUserId] = useState<string | null>(null);
  const [viewAsLgUserName, setViewAsLgUserName] = useState<string | null>(null);

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined;
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : undefined;

  // Fetch entries filtered by date and user scope — server-side paginated.
  // Si el admin está viendo "como" un LLG, el viewAsLgUserId pisa el scope.
  const userId = viewAsLgUserId ?? (viewMode === "agent" ? user?.id : undefined);
  const { data: paginatedData, isLoading: leadsLoading } = useLeadGenByDateRange(dateFromStr, dateToStr, userId, page);
  const leads = paginatedData?.data || [];
  const totalLeads = paginatedData?.total || 0;
  const totalPages = Math.ceil(totalLeads / 100);
  const { data: profiles = [] } = useLeadGenProfiles();

  // Build profiles map
  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach(p => { map[p.id] = p.full_name || "Sin nombre"; });
    return map;
  }, [profiles]);

  // Enrich leads with agent names
  const enrichedLeads = useMemo(() => {
    return leads.map(l => ({ ...l, agent_name: profilesMap[l.lg_user_id] || "—" }));
  }, [leads, profilesMap]);

  // Tabs based on viewMode
  const tabs = useMemo(() => {
    if (viewMode === "agent") {
      return [
        // El agente NO ve el subtab Dashboard porque hoy las KPIs son
        // del equipo entero — no aportan a su vista personal. Si en el
        // futuro hacemos KPIs per-agent, agregar acá.
        { id: "leads", label: "Leads", icon: CheckSquare },
        { id: "leads-hora", label: "Rendimiento por Hora", icon: Clock },
      ];
    }
    const baseTabs = [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "leads", label: "Leads", icon: CheckSquare },
      { id: "agentes", label: "Agentes", icon: Users },
    ];
    if (viewMode === "owner") {
      baseTabs.push({ id: "supervisores", label: "Supervisores", icon: Shield });
    }
    baseTabs.push({ id: "rendimiento", label: "Rendimiento", icon: BarChart3 });
    return baseTabs;
  }, [viewMode]);

  // UI state.
  // Antes manejábamos `statsCollapsed` para encoger las KPI cards en
  // scroll. Ya no aplica: las KPIs viven solo en el subtab Dashboard,
  // los otros tabs no las muestran y por ende usan toda la altura.
  // El scrollRef + handleContentScroll quedan como noop por si algún
  // tab futuro quiere reaccionar al scroll del contenido.
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleContentScroll = useCallback((_e: React.UIEvent<HTMLDivElement>) => {
    // noop por ahora
  }, []);
  // Default landing: Dashboard para supervisor/owner (vista analítica).
  // Para el agente, su default sigue siendo Leads (su trabajo diario).
  const [activeTab, setActiveTab] = useState<string>(
    viewMode === "agent" ? "leads" : "dashboard",
  );
  const [listView, setListView] = useState<"list" | "grid" | "calendar">("list");
  const [weekOffset, setWeekOffset] = useState(0);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addContactoOpen, setAddContactoOpen] = useState(false);
  const [misCuentasOpen, setMisCuentasOpen] = useState(false);
  const [viewLeadOpen, setViewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadGenEntry | null>(null);
  const [deleteLeadOpen, setDeleteLeadOpen] = useState(false);
  const [deleteLead, setDeleteLead] = useState<LeadGenEntry | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [qualityFilter, setQualityFilter] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<{ type: "categoria" | "status" | null; value: string | null }>({ type: null, value: null });

  // Filter leads
  const filteredLeads = useMemo(() => {
    return enrichedLeads.filter(lead => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = lead.model_handle.toLowerCase().includes(q)
          || (lead.agent_name || "").toLowerCase().includes(q)
          || (lead.company || "").toLowerCase().includes(q)
          || (lead.ticket_number || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      // Agency filter
      if (agencyFilter && lead.company !== agencyFilter) return false;
      // Quality filter
      if (qualityFilter && lead.quality?.toLowerCase() !== qualityFilter) return false;
      // Card filters
      if (activeFilter.type === "categoria") return lead.quality?.toLowerCase() === activeFilter.value;
      if (activeFilter.type === "status") {
        if (activeFilter.value === "respondieron") return lead.status === "contactado" || lead.status === "respondio";
        if (activeFilter.value === "interesadas") return lead.status === "interesado";
        if (activeFilter.value === "no_interesadas") return lead.status === "no_interesado";
        if (activeFilter.value === "otros") return !knownStatuses.has(lead.status);
        if (activeFilter.value === "con_telefono") return !!(lead.phone_raw || lead.phone_e164);
      }
      return true;
    });
  }, [enrichedLeads, searchQuery, agencyFilter, qualityFilter, activeFilter]);

  // Summary stats — all leads in range (no pagination limit)
  const { data: summaryStats } = useLeadGenSummaryStats(dateFromStr, dateToStr, userId);
  const statsForCard = summaryStats || { total: 0, qa: 0, byQuality: { "a+": 0, a: 0, "b+": 0, b: 0, c: 0 } };

  // Agent stats — from dedicated server-side query (all leads in range, not just current page)
  const { data: agentStatsRaw } = useLeadGenAgentStats(dateFromStr, dateToStr);

  // Sort state para la tabla de agentes. Default: total desc — los más
  // productivos arriba (mismo comportamiento que antes).
  type AgentSortKey = "name" | "total" | "a+" | "a" | "b+" | "b" | "c" | "nuevos" | "recuperacion" | "phones";
  const [agentSortKey, setAgentSortKey] = useState<AgentSortKey>("total");
  const [agentSortDir, setAgentSortDir] = useState<"asc" | "desc">("desc");

  const toggleAgentSort = useCallback((key: AgentSortKey) => {
    setAgentSortKey((prev) => {
      if (prev === key) {
        // Mismo column → invertir dirección
        setAgentSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      // Nueva column → empieza desc (lo más útil para "quién tiene más X")
      setAgentSortDir("desc");
      return key;
    });
  }, []);

  // Mejor LLG del rango = agente con más phones registrados.
  // Derivado del mismo agentStatsRaw — no hace falta query extra.
  // Tiebreaker (decidido con el operador): primero phones DESC,
  // después leads nuevos DESC (si dos LLGs tienen mismos phones, gana
  // el que metió más nuevos), después alfabético para que sea estable.
  const mejorLlg = useMemo(() => {
    if (!agentStatsRaw) return null;
    const rows = Object.entries(agentStatsRaw)
      .filter(([id]) => !!profilesMap[id])
      .map(([id, s]) => ({
        name: profilesMap[id] || "Agente",
        phones: s.phones ?? 0,
        nuevos: s.nuevos ?? 0,
      }))
      .filter((r) => r.phones > 0)
      .sort((a, b) =>
        b.phones - a.phones
        || b.nuevos - a.nuevos
        || a.name.localeCompare(b.name, "es"),
      );
    return rows[0] ? { name: rows[0].name, phones: rows[0].phones } : null;
  }, [agentStatsRaw, profilesMap]);

  // Top 3 LLGs para el ranking del dashboard. Mismo orden de
  // tiebreaker que mejorLlg, sólo que cortamos a 3.
  const topLlgs = useMemo(() => {
    if (!agentStatsRaw) return [];
    return Object.entries(agentStatsRaw)
      .filter(([id]) => !!profilesMap[id])
      .map(([id, s]) => ({
        name: profilesMap[id] || "Agente",
        phones: s.phones ?? 0,
        nuevos: s.nuevos ?? 0,
      }))
      .filter((r) => r.phones > 0)
      .sort((a, b) =>
        b.phones - a.phones
        || b.nuevos - a.nuevos
        || a.name.localeCompare(b.name, "es"),
      )
      .slice(0, 3);
  }, [agentStatsRaw, profilesMap]);

  // Phones por día — alimenta el chart del dashboard. Default últimos
  // 30 días si no hay filtro activo.
  const { data: phonesDaily = [], isLoading: phonesDailyLoading } = useLeadGenPhonesDaily(
    dateFromStr,
    dateToStr,
  );

  // Etiqueta legible del rango para mostrar en la card hero. Si el
  // operador no eligió rango, no mostramos label — sería engañoso decir
  // "mayo 2026" cuando el conteo cubre todos los datos históricos.
  const rangeLabel = useMemo(() => {
    if (!dateFrom || !dateTo) return undefined;
    // Si from y to caen en el mismo mes/año, mostramos "Mayo 2026".
    // Si no, formato corto "4 may → 18 may".
    const sameMonth = dateFrom.getMonth() === dateTo.getMonth() && dateFrom.getFullYear() === dateTo.getFullYear();
    if (sameMonth) return format(dateFrom, "MMMM yyyy", { locale: es });
    return `${format(dateFrom, "d MMM", { locale: es })} → ${format(dateTo, "d MMM", { locale: es })}`;
  }, [dateFrom, dateTo]);

  const agentStats = useMemo(() => {
    if (!agentStatsRaw) return [];
    const rows = Object.entries(agentStatsRaw)
      .filter(([agentId]) => !!profilesMap[agentId])
      .map(([agentId, stats]) => ({
        id: agentId,
        name: profilesMap[agentId] || "Agente",
        total: stats.total,
        byQuality: stats.byQuality,
        firstLead: stats.firstLead,
        // Defaults a 0 si el RPC viejo está activo. Mismo criterio que
        // el reporte programado de LLGs (record_type 'reactivado' →
        // recuperacion; el resto → nuevos).
        phones: stats.phones ?? 0,
        nuevos: stats.nuevos ?? 0,
        recuperacion: stats.recuperacion ?? 0,
      }));

    const cmp = (a: typeof rows[number], b: typeof rows[number]): number => {
      let av: number | string;
      let bv: number | string;
      switch (agentSortKey) {
        case "name":         av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "total":        av = a.total;              bv = b.total;              break;
        case "a+":           av = a.byQuality["a+"] ?? 0; bv = b.byQuality["a+"] ?? 0; break;
        case "a":            av = a.byQuality["a"] ?? 0;  bv = b.byQuality["a"] ?? 0;  break;
        case "b+":           av = a.byQuality["b+"] ?? 0; bv = b.byQuality["b+"] ?? 0; break;
        case "b":            av = a.byQuality["b"] ?? 0;  bv = b.byQuality["b"] ?? 0;  break;
        case "c":            av = a.byQuality["c"] ?? 0;  bv = b.byQuality["c"] ?? 0;  break;
        case "nuevos":       av = a.nuevos;             bv = b.nuevos;             break;
        case "recuperacion": av = a.recuperacion;       bv = b.recuperacion;       break;
        case "phones":       av = a.phones;             bv = b.phones;             break;
      }
      if (av < bv) return agentSortDir === "asc" ? -1 : 1;
      if (av > bv) return agentSortDir === "asc" ? 1 : -1;
      // Tie-break por nombre para que el orden sea estable
      return a.name.localeCompare(b.name, "es");
    };
    return rows.sort(cmp);
  }, [agentStatsRaw, profilesMap, agentSortKey, agentSortDir]);

  const handleDateApply = useCallback((from: Date | undefined, to: Date | undefined) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(0);
  }, []);

  // If an agent is selected, show detail view
  if (selectedAgent) {
    return (
      <AgentDetailView
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
        initialDateFrom={dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined}
        initialDateTo={dateTo ? format(dateTo, "yyyy-MM-dd") : undefined}
      />
    );
  }

  if (permsLoading) {
    return (
      <main className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="shrink-0">
            <h1 className="text-2xl font-semibold">LeadGen</h1>
            <p className="text-sm text-muted-foreground mt-1 whitespace-nowrap">
              {viewMode === "agent" ? "Tus leads" : "Gestión de leads"} · {totalLeads.toLocaleString()} leads
              {dateFrom && dateTo && (
                <span className="ml-1">
                  ({format(dateFrom, "d MMM", { locale: es })} — {format(dateTo, "d MMM", { locale: es })})
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
            {/* Date picker global — visible en TODOS los subtabs.
                Antes vivía en la filter bar (sólo Leads / Agentes).
                Ahora persiste arriba a la derecha porque también
                alimenta los KPIs del Dashboard. */}
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onApply={handleDateApply}
              placeholder="Selecciona fechas"
              className="h-9"
            />
            {viewMode !== "agent" && (
              <ViewAsLlgPicker
                value={viewAsLgUserId}
                onChange={(id, name) => {
                  setViewAsLgUserId(id);
                  setViewAsLgUserName(name);
                  setPage(0);
                }}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMisCuentasOpen(true)}
              title="Estado de tus cuentas IG de outreach — qué tan creíble se ven y qué les falta para que las creadoras respondan"
            >
              <Activity className="h-4 w-4" />
              Mis Cuentas IG
            </Button>
            <Button size="sm" onClick={() => setAddLeadOpen(true)}>
              <Plus className="h-4 w-4" />
              Agregar Lead
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Agregar Contacto
            </Button>
          </div>
        </div>
      </header>

      {/* Banner: vista filtrada como otro LLG */}
      {viewAsLgUserId && (
        <div className="shrink-0 border-b border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 px-6 py-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/25 ring-1 ring-primary/40">
                <Eye className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-primary/80 font-bold leading-tight">
                  Vista filtrada
                </p>
                <p className="text-sm font-semibold truncate">
                  Viendo el panel como <span className="text-primary">{viewAsLgUserName || "este LLG"}</span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-primary hover:bg-primary/15"
              onClick={() => {
                setViewAsLgUserId(null);
                setViewAsLgUserName(null);
                setPage(0);
              }}
            >
              <X className="h-4 w-4 mr-1" /> Cancelar vista
            </Button>
          </div>
        </div>
      )}

      {/* Tab bar — usamos SubtabNav (gradient azul + ring + shadow)
          para que match con Closers / Creadores / Ventas / Contactos /
          Chatter Evaluator. Antes era un grupo de Buttons sin glow. */}
      <div className="shrink-0 px-6 py-2 flex items-center justify-between gap-4">
        <SubtabNav>
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <SubtabNavItem
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </SubtabNavItem>
            );
          })}
        </SubtabNav>
        {viewMode !== "agent" && (
          <Button variant="outline" size="sm" onClick={() => navigate("/leadgen/base-datos")}>
            <Database className="h-4 w-4" />
            Base de Datos
          </Button>
        )}
      </div>

      {/* Filters bar — visible sólo en tabs que tienen algún filtro
          o toggle. En Dashboard / Supervisores / Rendimiento esta
          barra entera desaparece (ya no muestra search vacío). */}
      {(activeTab === "leads" || activeTab === "leads-hora" || activeTab === "agentes") && (
        <div className="shrink-0 px-6 py-3 flex items-center gap-3 flex-wrap">
          {/* Buscar lead → SOLO en tabs de leads. Search filtra el
              listado de la tabla — no aplica a Agentes ni a otros. */}
          {(activeTab === "leads" || activeTab === "leads-hora") && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lead..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          {/* Filtros de categoría/agencia: sólo aplican al listado
              de leads (incluso "leads-hora" comparte el dataset). */}
          {(activeTab === "leads" || activeTab === "leads-hora") && (
            <>
              <Select value={qualityFilter || undefined} onValueChange={(v) => setQualityFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {QUALITY_OPTIONS.map(q => (
                    <SelectItem key={q.value} value={q.value.toLowerCase()}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={agencyFilter || undefined} onValueChange={(v) => setAgencyFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Agencia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {LEADGEN_COMPANIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {(activeTab === "leads" || activeTab === "agentes") && (
            <div className="ml-auto flex gap-1">
              <Button variant={listView === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setListView("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={listView === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setListView("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              {activeTab === "agentes" && (
                <Button variant={listView === "calendar" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setListView("calendar")}>
                  <Calendar className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab content - fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col px-6 pb-4" ref={scrollRef}>
        {/* === DASHBOARD TAB ===
            KPI overview (Mejor LLG hero + Total + QA + 5 categorías)
            + extras (Top 3 LLGs, chart phones/día, donut). Cuando el
            operador navega a otros tabs, todo este bloque desaparece
            para ganar espacio vertical en las listas. */}
        {activeTab === "dashboard" && (
          <div className="flex-1 min-h-0 overflow-auto pt-4 pb-2 space-y-3">
            <LeadGenCantidadCard
              stats={statsForCard}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              mejorLlg={mejorLlg}
              rangeLabel={rangeLabel}
            />
            <LeadGenDashboardExtras
              topLlgs={topLlgs}
              phonesDaily={phonesDaily}
              byQuality={statsForCard.byQuality}
              rangeLabel={rangeLabel}
              loading={phonesDailyLoading}
            />
          </div>
        )}

        {/* === LEADS TAB === */}
        {activeTab === "leads-hora" && (
          <div className="flex-1 min-h-0 overflow-auto" onScroll={handleContentScroll}>
            <AgentHourlyPerformance leads={enrichedLeads} />
          </div>
        )}

        {activeTab === "leads" && (
          <>
            {leadsLoading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-muted-foreground text-sm">Cargando leads...</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-sm">No hay leads para mostrar con estos filtros</p>
              </div>
            ) : listView === "grid" ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <LeadGenGrid
                  leads={filteredLeads}
                  onView={lead => { setSelectedLead(lead); setViewLeadOpen(true); }}
                />
              </div>
            ) : (
              <DataTableShell
                className="flex-1 min-h-0"
                currentPage={page + 1}
                totalPages={totalPages}
                totalCount={totalLeads}
                pageSize={100}
                onPageChange={(p) => setPage(p - 1)}
                onScroll={handleContentScroll}
              >
                <LeadGenTable
                  leads={filteredLeads}
                  onView={lead => { setSelectedLead(lead); setViewLeadOpen(true); }}
                  onDelete={isAdmin ? (lead) => { setDeleteLead(lead); setDeleteLeadOpen(true); } : undefined}
                  profiles={profiles}
                />
              </DataTableShell>
            )}
          </>
        )}

          {/* === AGENTS TAB === */}
          {activeTab === "agentes" && (
            <div className="flex-1 min-h-0 overflow-auto space-y-6">
              <AnalyticsSectionBanner
                title="Rendimiento de Agentes"
                subtitle={
                  dateFrom && dateTo
                    ? `${format(dateFrom, "d 'de' MMMM", { locale: es })} — ${format(dateTo, "d 'de' MMMM, yyyy", { locale: es })} · ${agentStats.length} agentes activos`
                    : `${format(new Date(), "d 'de' MMMM, yyyy", { locale: es })} · ${agentStats.length} agentes activos`
                }
                count={agentStats.length}
                countLabel="Agentes Activos"
              />

              {listView === "calendar" ? (
                <AgentsWeeklyCalendar
                  agentStats={agentStats}
                  allLeads={enrichedLeads}
                  weekOffset={weekOffset}
                  onWeekChange={setWeekOffset}
                  onSelectAgent={a => setSelectedAgent({ id: a.id, name: a.name })}
                />
              ) : listView === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agentStats.map(ag => (
                    <Card key={ag.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedAgent({ id: ag.id, name: ag.name })}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                              {ag.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">{ag.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {ag.total} leads
                              {(ag.nuevos > 0 || ag.recuperacion > 0) && (
                                <span className="ml-1.5">
                                  ({ag.nuevos} nv · {ag.recuperacion} rec)
                                </span>
                              )}
                              {ag.phones > 0 && (
                                <span className="ml-1.5 text-primary font-medium">· {ag.phones} tel</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-px rounded-lg overflow-hidden border">
                          {["a+", "a", "b+", "b", "c"].map(q => (
                            <div key={q} className="bg-muted/30 p-2 text-center">
                              <p className="text-xs text-muted-foreground">{q.toUpperCase()}</p>
                              <p className="text-sm font-bold">{ag.byQuality[q] || 0}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <DataTableShell
                  currentPage={agentPage}
                  totalPages={Math.ceil(agentStats.length / 50)}
                  totalCount={agentStats.length}
                  pageSize={50}
                  onPageChange={setAgentPage}
                >
                  <Table containerClassName="max-md:overflow-x-auto" className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        {/* Sortable headers: click toggle desc/asc.
                            Orden: Agente → Total → calidades (A+/A/B+/B/C)
                            → Nuevos → Recup → Tel → Acciones. */}
                        <AgentSortHead label="Agente" sortKey="name"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} align="left" />
                        <AgentSortHead label="Total" sortKey="total"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="A+" sortKey="a+"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="A" sortKey="a"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="B+" sortKey="b+"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="B" sortKey="b"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="C" sortKey="c"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort} />
                        <AgentSortHead label="Nuevos" sortKey="nuevos"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort}
                          tooltip="Leads nuevos (record_type ≠ reactivado)" />
                        <AgentSortHead label="Recup." sortKey="recuperacion"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort}
                          tooltip="Leads recuperación (record_type = reactivado)" />
                        <AgentSortHead label="Tel" sortKey="phones"
                          currentKey={agentSortKey} dir={agentSortDir}
                          onSort={toggleAgentSort}
                          tooltip="Teléfonos obtenidos en el rango" />
                        <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))] w-[80px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentStats.slice((agentPage - 1) * 50, agentPage * 50).map(ag => (
                        <TableRow key={ag.id} className="cursor-pointer" onClick={() => setSelectedAgent({ id: ag.id, name: ag.name })}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {ag.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{ag.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center"><Badge>{ag.total}</Badge></TableCell>
                          <TableCell className="text-center font-medium">{ag.byQuality["a+"] || 0}</TableCell>
                          <TableCell className="text-center font-medium">{ag.byQuality["a"] || 0}</TableCell>
                          <TableCell className="text-center font-medium">{ag.byQuality["b+"] || 0}</TableCell>
                          <TableCell className="text-center font-medium">{ag.byQuality["b"] || 0}</TableCell>
                          <TableCell className="text-center font-medium">{ag.byQuality["c"] || 0}</TableCell>
                          <TableCell className="text-center font-medium">{ag.nuevos}</TableCell>
                          <TableCell className="text-center font-medium">{ag.recuperacion}</TableCell>
                          <TableCell className="text-center">
                            {/* Teléfonos obtenidos en el rango — destacado
                                cuando hay >0 para que se note el ranking. */}
                            <span className={ag.phones > 0 ? "font-semibold text-primary" : "text-muted-foreground"}>
                              {ag.phones}
                            </span>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card w-[80px]" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedAgent({ id: ag.id, name: ag.name })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {agentStats.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                            No hay agentes con leads en este rango
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </DataTableShell>
              )}
            </div>
          )}

          {/* === SUPERVISORS TAB === */}
          {activeTab === "supervisores" && (
            <div className="flex-1 min-h-0 overflow-auto">
              <LeadGenSupervisorView leads={enrichedLeads} profiles={profiles} />
            </div>
          )}

          {/* === PERFORMANCE TAB === */}
          {activeTab === "rendimiento" && (
            <div className="flex-1 min-h-0 overflow-auto" onScroll={handleContentScroll}>
              <LeadGenPerformanceView
                profiles={profiles}
                agentIds={agentStats.map(a => a.id)}
                dateFrom={dateFromStr}
                dateTo={dateToStr}
              />
            </div>
          )}
        </div>

      {/* Modals */}
      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      <AddContactoModal open={addContactoOpen} onOpenChange={setAddContactoOpen} />
      <MisCuentasIGModal open={misCuentasOpen} onOpenChange={setMisCuentasOpen} />
      <ViewLeadModal
        open={viewLeadOpen}
        onOpenChange={setViewLeadOpen}
        lead={selectedLead}
        onDelete={isAdmin ? () => {
          setViewLeadOpen(false);
          setDeleteLead(selectedLead);
          setDeleteLeadOpen(true);
        } : undefined}
      />
      <DeleteLeadDialog open={deleteLeadOpen} onOpenChange={setDeleteLeadOpen} lead={deleteLead} />
    </main>
  );
};

// Weekly calendar component for agents
function AgentsWeeklyCalendar({
  agentStats,
  allLeads,
  weekOffset,
  onWeekChange,
  onSelectAgent,
}: {
  agentStats: { id: string; name: string; total: number }[];
  allLeads: LeadGenEntry[];
  weekOffset: number;
  onWeekChange: (n: number) => void;
  onSelectAgent: (a: { id: string; name: string }) => void;
}) {
  const weekDays = getWeekDays(weekOffset);

  const leadsInDay = (agentId: string, day: Date) =>
    allLeads.filter(l => l.lg_user_id === agentId && isSameDay(new Date(l.entry_date), day)).length;

  const colTotals = weekDays.map(day => agentStats.reduce((sum, ag) => sum + leadsInDay(ag.id, day), 0));
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardContent className="pt-4 px-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={() => onWeekChange(weekOffset - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {format(weekDays[0], "d 'de' MMMM", { locale: es })} – {format(weekDays[6], "d 'de' MMMM, yyyy", { locale: es })}
          </span>
          <Button variant="outline" size="sm" onClick={() => onWeekChange(weekOffset + 1)} disabled={weekOffset >= 0}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Agente</TableHead>
                {weekDays.map((day, i) => (
                  <TableHead key={i} className={`text-center min-w-[70px] ${isToday(day) ? "bg-primary/10 text-primary font-bold" : ""}`}>
                    {DAY_LABELS[i]} {format(day, "d")}
                  </TableHead>
                ))}
                <TableHead className="text-center font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentStats.map(ag => {
                const dayCounts = weekDays.map(day => leadsInDay(ag.id, day));
                const rowTotal = dayCounts.reduce((a, b) => a + b, 0);
                return (
                  <TableRow key={ag.id} className="cursor-pointer" onClick={() => onSelectAgent(ag)}>
                    <TableCell className="font-medium text-sm">{ag.name}</TableCell>
                    {dayCounts.map((cnt, i) => (
                      <TableCell key={i} className={`text-center text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary font-bold" : ""} ${cnt === 0 || isFuture(startOfDay(weekDays[i])) ? "text-muted-foreground" : ""}`}>
                        {isFuture(startOfDay(weekDays[i])) || cnt === 0 ? "—" : cnt}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-semibold">{rowTotal > 0 ? rowTotal : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <tfoot>
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell className="font-bold text-sm">Total</TableCell>
                {colTotals.map((t, i) => (
                  <TableCell key={i} className={`text-center font-bold text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary" : ""} ${t === 0 || isFuture(startOfDay(weekDays[i])) ? "text-muted-foreground" : ""}`}>
                    {isFuture(startOfDay(weekDays[i])) || t === 0 ? "—" : t}
                  </TableCell>
                ))}
                <TableCell className="text-center"><Badge variant="default">{grandTotal}</Badge></TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AgentSortHead ───────────────────────────────────────────────────
// Header de columna clickeable que ordena la tabla de agentes. Por
// convención: el primer click ordena DESC (mostrar el que más tiene
// primero — el caso de uso típico cuando rankeás performance). Click
// repetido sobre la misma columna invierte la dirección.
//
// El icono cambia según el estado:
//   · ArrowUpDown gris claro → columna inactiva
//   · ArrowDown sólido → ordenando DESC por esta columna
//   · ArrowUp sólido → ordenando ASC por esta columna
const AgentSortHead = ({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  align = "center",
  tooltip,
}: {
  label: string;
  sortKey: string;
  currentKey: string;
  dir: "asc" | "desc";
  onSort: (key: any) => void;
  align?: "left" | "center";
  tooltip?: string;
}) => {
  const active = currentKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <TableHead
      className={`sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] ${align === "center" ? "text-center" : ""}`}
      title={tooltip}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-7 px-2 -mx-2 text-xs font-medium ${align === "center" ? "justify-center w-full" : ""} ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={`ml-1 h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
      </Button>
    </TableHead>
  );
};

export default LeadGenContent;
