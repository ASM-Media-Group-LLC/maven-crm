import { useState, useMemo, useCallback } from "react";
import DataTableShell from "@/components/ui/data-table-shell";
import { useNavigate } from "react-router-dom";
import {
  Plus, UserPlus, Database, CheckSquare, Users, BarChart3, Clock,
  Search, List, LayoutGrid, FileText, Calendar, ChevronLeft, ChevronRight, Shield,
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

import { useLeadGenByDateRange, useLeadGenProfiles } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { LEADGEN_COMPANIES, QUALITY_OPTIONS } from "./leadgenConstants";

import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenEstadosCard from "./LeadGenEstadosCard";
import LeadGenTable from "./LeadGenTable";
import LeadGenGrid from "./LeadGenGrid";
import AddLeadModal from "./AddLeadModal";
import AddContactoModal from "./AddContactoModal";
import ViewLeadModal from "./ViewLeadModal";
import AgentDetailView from "./AgentDetailView";
import AgentHourlyPerformance from "./AgentHourlyPerformance";
import LeadGenSupervisorView from "./LeadGenSupervisorView";
import LeadGenPerformanceView from "./LeadGenPerformanceView";

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

  // Determine viewMode from permissions
  const viewMode: ViewMode = useMemo(() => {
    const scope = dataScope("LeadGen");
    if (scope === "self") return "agent";
    if (scope === "subordinates") return "supervisor";
    return "owner";
  }, [dataScope]);

  // Date range state with today as default
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [page, setPage] = useState(0);

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined;
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : undefined;

  // Fetch entries filtered by date and user scope — server-side paginated
  const userId = viewMode === "agent" ? user?.id : undefined;
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
        { id: "leads", label: "Leads", icon: CheckSquare },
        { id: "leads-hora", label: "Rendimiento por Hora", icon: Clock },
      ];
    }
    const baseTabs = [
      { id: "leads", label: "Leads", icon: CheckSquare },
      { id: "agentes", label: "Agentes", icon: Users },
    ];
    if (viewMode === "owner") {
      baseTabs.push({ id: "supervisores", label: "Supervisores", icon: Shield });
    }
    baseTabs.push({ id: "rendimiento", label: "Rendimiento", icon: BarChart3 });
    return baseTabs;
  }, [viewMode]);

  // UI state
  const [activeTab, setActiveTab] = useState("leads");
  const [listView, setListView] = useState<"list" | "grid" | "calendar">("list");
  const [weekOffset, setWeekOffset] = useState(0);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addContactoOpen, setAddContactoOpen] = useState(false);
  const [viewLeadOpen, setViewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadGenEntry | null>(null);
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

  // Agent stats
  const agentStats = useMemo(() => {
    const byAgent: Record<string, { id: string; name: string; total: number; byQuality: Record<string, number>; firstLead: string }> = {};
    enrichedLeads.forEach(l => {
      if (!byAgent[l.lg_user_id]) {
        byAgent[l.lg_user_id] = {
          id: l.lg_user_id,
          name: profilesMap[l.lg_user_id] || l.company || "Agente",
          total: 0,
          byQuality: {},
          firstLead: l.created_at,
        };
      }
      byAgent[l.lg_user_id].total++;
      const q = l.quality?.toLowerCase() || "c";
      byAgent[l.lg_user_id].byQuality[q] = (byAgent[l.lg_user_id].byQuality[q] || 0) + 1;
      if (l.created_at < byAgent[l.lg_user_id].firstLead) byAgent[l.lg_user_id].firstLead = l.created_at;
    });
    return Object.values(byAgent).sort((a, b) => b.total - a.total);
  }, [enrichedLeads, profilesMap]);

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
        leads={enrichedLeads.filter(l => l.lg_user_id === selectedAgent.id)}
        onBack={() => setSelectedAgent(null)}
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LeadGen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {viewMode === "agent" ? "Tus leads" : "Gestión de leads"} · {totalLeads.toLocaleString()} leads
              {dateFrom && dateTo && (
                <span className="ml-1">
                  ({format(dateFrom, "d MMM", { locale: es })} — {format(dateTo, "d MMM", { locale: es })})
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddLeadOpen(true)}>
              <Plus className="h-4 w-4" />
              Agregar Lead
            </Button>
            {viewMode !== "agent" && (
              <Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Agregar Contacto
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable top controls */}
      <div className="shrink-0 overflow-auto" style={{ maxHeight: "45vh" }}>
        {/* KPI Cards */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-6">
            <LeadGenCantidadCard leads={enrichedLeads} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
            <LeadGenEstadosCard leads={enrichedLeads} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 py-2 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <Button key={tab.id} variant={activeTab === tab.id ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(tab.id)} className="text-xs">
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
          {viewMode !== "agent" && (
            <Button variant="outline" size="sm" onClick={() => navigate("/leadgen/base-datos")}>
              <Database className="h-4 w-4" />
              Base de Datos
            </Button>
          )}
        </div>

        {/* Filters bar */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar lead, agente, ticket..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={handleDateApply}
            placeholder="Selecciona fechas"
            className="h-9"
          />
          {(activeTab === "leads" || activeTab === "leads-hora") && (
            <>
              <Select value={qualityFilter || undefined} onValueChange={(v) => setQualityFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Calidad" /></SelectTrigger>
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
      </div>

      {/* Tab content - fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col px-6 pb-4">
        {/* === LEADS TAB === */}
        {activeTab === "leads-hora" && (
          <div className="flex-1 min-h-0 overflow-auto">
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
                currentPage={page + 1}
                totalPages={totalPages}
                totalCount={filteredLeads.length}
                pageSize={50}
                onPageChange={(p) => setPage(p - 1)}
              >
                <LeadGenTable
                  leads={filteredLeads}
                  onView={lead => { setSelectedLead(lead); setViewLeadOpen(true); }}
                />
              </DataTableShell>
            )}
          </>
        )}

          {/* === AGENTS TAB === */}
          {activeTab === "agentes" && (
            <div className="space-y-6">
              <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">Rendimiento de Agentes</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dateFrom && dateTo
                        ? `${format(dateFrom, "d 'de' MMMM", { locale: es })} — ${format(dateTo, "d 'de' MMMM, yyyy", { locale: es })}`
                        : format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-3xl font-bold text-primary">{agentStats.length}</p>
                      <p className="text-xs text-muted-foreground">Agentes Activos</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              </div>

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
                            <p className="text-xs text-muted-foreground">{ag.total} leads</p>
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
                <Card>
                  <CardContent className="pt-6 px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agente</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">A+</TableHead>
                          <TableHead className="text-center">A</TableHead>
                          <TableHead className="text-center">B+</TableHead>
                          <TableHead className="text-center">B</TableHead>
                          <TableHead className="text-center">C</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentStats.map(ag => (
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
                            <TableCell className="text-center font-medium text-emerald-400">{ag.byQuality["a+"] || 0}</TableCell>
                            <TableCell className="text-center font-medium text-blue-400">{ag.byQuality["a"] || 0}</TableCell>
                            <TableCell className="text-center font-medium text-violet-400">{ag.byQuality["b+"] || 0}</TableCell>
                            <TableCell className="text-center font-medium text-cyan-400">{ag.byQuality["b"] || 0}</TableCell>
                            <TableCell className="text-center font-medium text-slate-400">{ag.byQuality["c"] || 0}</TableCell>
                          </TableRow>
                        ))}
                        {agentStats.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No hay agentes con leads en este rango
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* === SUPERVISORS TAB === */}
          {activeTab === "supervisores" && (
            <LeadGenSupervisorView leads={enrichedLeads} profiles={profiles} />
          )}

          {/* === PERFORMANCE TAB === */}
          {activeTab === "rendimiento" && (
            <LeadGenPerformanceView leads={enrichedLeads} profiles={profiles} />
          )}
        </div>

      {/* Modals */}
      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      <AddContactoModal open={addContactoOpen} onOpenChange={setAddContactoOpen} />
      <ViewLeadModal open={viewLeadOpen} onOpenChange={setViewLeadOpen} lead={selectedLead} />
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

export default LeadGenContent;
