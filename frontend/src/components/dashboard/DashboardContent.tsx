import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Ticket, CalendarCheck, MessageSquare, Phone,
  Headphones, CheckSquare, AlertCircle, RefreshCw, Clock,
  UserMinus, Calendar, ListTodo, Zap, Settings2, Check,
  ChevronRight, UserPlus, Briefcase, DollarSign, Megaphone,
  TrendingUp, Settings, Cake, Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import KpiCard from "./KpiCard";
import KpiDetailDialog, { type KpiRow } from "./KpiDetailDialog";
import { useEarningsData } from "@/pages/sales-performance/useEarningsData";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { useWeeklyStats, useOperationalKPIs, useRecentActivity, usePendingTasks } from "@/hooks/useDashboardData";
import { usePermissions } from "@/hooks/usePermissions";
import { useAnnouncementsByChannel, useUpcomingBirthdays, useRecordAnnouncementView, useRecordAnnouncementOpen, type Announcement } from "@/hooks/useAnnouncements";
import { useQuery } from "@tanstack/react-query";
import AnnouncementFeedCard from "./AnnouncementFeedCard";
import AnnouncementPublicDetail from "./AnnouncementPublicDetail";
import AnnouncementBanner from "./AnnouncementBanner";

/* ── Existing data hooks ─────────────────────────────── */

const useCreatorsCount = () =>
  useQuery({
    queryKey: ["dashboard-creators-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, status");
      if (error) throw error;
      const total = data?.length ?? 0;
      const active = data?.filter((c) => c.status === "active").length ?? 0;
      return { total, active, inactive: total - active };
    },
  });

const useTicketsData = () =>
  useQuery({
    queryKey: ["dashboard-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, title, status, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const all = data ?? [];
      const activeTickets = all.filter((t) => t.status !== "resolved");
      const resolved = all.filter((t) => t.status === "resolved");
      const urgent = all.filter((t) => t.priority === "high" || t.priority === "urgent");
      return { active: activeTickets.length, resolved: resolved.length, urgent: urgent.length, total: all.length };
    },
  });

const useLeadsData = () =>
  useQuery({
    queryKey: ["dashboard-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, status, created_at");
      if (error) throw error;
      const all = data ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const todayLeads = all.filter((l) => l.created_at.slice(0, 10) === today);
      const interested = all.filter((l) => l.status === "interesado" || l.status === "contactado");
      const inProgress = all.filter((l) => l.status !== "cerrado" && l.status !== "descartado");
      const statusMap: Record<string, number> = {};
      for (const l of all) {
        statusMap[l.status] = (statusMap[l.status] || 0) + 1;
      }
      return {
        todayCount: todayLeads.length,
        interestedCount: interested.length,
        inProgressCount: inProgress.length,
        closedCount: all.filter((l) => l.status === "cerrado").length,
        pipeline: statusMap,
      };
    },
  });

const PIPELINE_COLORS = [
  "hsl(211, 100%, 50%)",
  "hsl(271, 91%, 50%)",
  "hsl(40, 96%, 40%)",
  "hsl(145, 63%, 32%)",
  "hsl(0, 84%, 60%)",
];

const ACTIVITY_CONFIG = {
  ticket: { icon: Ticket, bg: "bg-destructive/10", text: "text-destructive", label: "Ticket" },
  task: { icon: CheckSquare, bg: "bg-primary/10", text: "text-primary", label: "Tarea" },
  event: { icon: Calendar, bg: "bg-accent/10", text: "text-accent-foreground", label: "Evento" },
};

/* ── Quick Actions ────────────────────────────────── */

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Users;
  url: string;
  module?: string; // for permission filtering
}

const ALL_ACTIONS: QuickAction[] = [
  { id: "contactos",  label: "Contactos",        icon: UserPlus,      url: "/contactos",         module: "Contactos" },
  { id: "tareas",     label: "Tareas",           icon: CheckSquare,   url: "/tareas",            module: "Tareas" },
  { id: "eventos",    label: "Eventos",          icon: Calendar,      url: "/eventos",           module: "Eventos" },
  { id: "creadores",  label: "Creadoras",        icon: Users,         url: "/creadores",         module: "Creadores" },
  { id: "leadgen",    label: "Lead Gen",         icon: MessageSquare, url: "/leadgen",           module: "LeadGen" },
  { id: "closers",    label: "Closers",          icon: Phone,         url: "/closers",           module: "Closers" },
  { id: "tickets",    label: "Tickets",          icon: Ticket,        url: "/tickets",           module: "Tickets" },
  { id: "hr",         label: "Recursos Humanos", icon: Briefcase,     url: "/hr",                module: "HR" },
  { id: "finanzas",   label: "Finanzas",         icon: DollarSign,    url: "/finanzas",          module: "Finanzas" },
  { id: "promolog",   label: "Promolog",         icon: Megaphone,     url: "/promolog",          module: "Promolog" },
  { id: "sales",      label: "Sales Dashboard",  icon: TrendingUp,    url: "/sales",             module: "Creator Sales" },
  { id: "admin",      label: "Administración",   icon: Settings,      url: "/admin/usuarios",    module: "Administración" },
];

const DEFAULT_ACTION_IDS = ["contactos", "tareas", "eventos"];
const MAX_SHORTCUTS = 6;
const LS_KEY = "dashboard_quick_actions";

function loadShortcuts(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_ACTION_IDS;
}

/* ── Component ────────────────────────────────────── */

const DashboardContent = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canAccess } = usePermissions();

  // Quick Actions state
  const [selectedIds, setSelectedIds] = useState<string[]>(loadShortcuts);
  const [configOpen, setConfigOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const availableActions = useMemo(
    () => ALL_ACTIONS.filter((a) => !a.module || canAccess(a.module)),
    [canAccess]
  );

  const activeActions = selectedIds
    .map((id) => availableActions.find((a) => a.id === id))
    .filter(Boolean) as QuickAction[];

  function openConfig() {
    setDraftIds([...selectedIds]);
    setConfigOpen(true);
  }
  function toggleDraft(id: string) {
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SHORTCUTS) return prev;
      return [...prev, id];
    });
  }
  function saveConfig() {
    setSelectedIds(draftIds);
    localStorage.setItem(LS_KEY, JSON.stringify(draftIds));
    setConfigOpen(false);
  }

  // Data hooks
  const { data: creatorsData, isLoading: creatorsLoading } = useCreatorsCount();
  const { data: ticketsData, isLoading: ticketsLoading } = useTicketsData();
  const { data: leadsData, isLoading: leadsLoading } = useLeadsData();
  const { data: earningsRows = [], isLoading: earningsLoading } = useEarningsData();
  const { data: weeklyData = [] } = useWeeklyStats();
  const { data: opKPIs } = useOperationalKPIs();
  const { data: recentActivity = [], isLoading: activityLoading } = useRecentActivity();
  const { data: pendingTasks = [] } = usePendingTasks();
  const { feed: announcements, banners } = useAnnouncementsByChannel();
  const { data: birthdays = [] } = useUpcomingBirthdays();
  const recordView = useRecordAnnouncementView();
  const recordOpen = useRecordAnnouncementOpen();
  const [detailAnnouncement, setDetailAnnouncement] = useState<Announcement | null>(null);
  const [kpiPopup, setKpiPopup] = useState<"creators" | "tickets" | "leads" | "employees" | "overdue" | null>(null);

  const handleOpenDetail = useCallback((a: Announcement) => {
    setDetailAnnouncement(a);
  }, []);

  const handleRecordView = useCallback((id: string) => {
    recordView(id);
  }, [recordView]);

  const handleRecordOpen = useCallback((id: string) => {
    recordOpen(id);
  }, [recordOpen]);

  const top5 = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const r of earningsRows) {
      const key = r.creator_id || r.pending_creator || r.id;
      const name = r.artistic_name || r.pending_creator || "Sin nombre";
      const existing = map.get(key);
      if (existing) {
        existing.total += r.total_earnings_gross ?? 0;
      } else {
        map.set(key, { name, total: r.total_earnings_gross ?? 0 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [earningsRows]);

  const pipelineData = useMemo(() => {
    if (!leadsData?.pipeline) return [];
    return Object.entries(leadsData.pipeline).map(([name, value]) => ({ name, value }));
  }, [leadsData]);

  const loading = "…";
  const fmt = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const getGridCols = (count: number) => {
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    if (count === 4) return "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4";
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
  };

  type KpiKey = "creators" | "tickets" | "leads" | "employees" | "overdue";
  const kpis = [
    {
      key: "creators" as KpiKey,
      label: "Total Creators",
      value: creatorsLoading ? loading : String(creatorsData?.total ?? 0),
      icon: Users,
      color: "bg-blue-500",
      subtitle: creatorsLoading ? "" : `${creatorsData?.active ?? 0} activas / ${creatorsData?.inactive ?? 0} inactivas`,
      show: canAccess("Creadores"),
    },
    {
      key: "tickets" as KpiKey,
      label: "Active Tickets",
      value: ticketsLoading ? loading : String(ticketsData?.active ?? 0),
      icon: Ticket,
      color: "bg-rose-500",
      subtitle: ticketsLoading ? "" : `${ticketsData?.resolved ?? 0} resueltos`,
      show: canAccess("Tickets"),
    },
    {
      key: "leads" as KpiKey,
      label: "New Leads Today",
      value: leadsLoading ? loading : String(leadsData?.todayCount ?? 0),
      icon: MessageSquare,
      color: "bg-violet-500",
      subtitle: leadsLoading ? "" : `${leadsData?.interestedCount ?? 0} interesados`,
      show: canAccess("LeadGen"),
    },
    {
      key: "employees" as KpiKey,
      label: "Empleados Activos",
      value: String(opKPIs?.totalEmployees ?? 0),
      icon: Users,
      color: "bg-emerald-500",
      subtitle: `${opKPIs?.absencesToday ?? 0} ausencias hoy`,
      show: canAccess("HR"),
    },
    {
      key: "overdue" as KpiKey,
      label: "Tareas Vencidas",
      value: String(opKPIs?.overdueTasks ?? 0),
      icon: Clock,
      color: "bg-amber-500",
      subtitle: `${opKPIs?.eventsToday ?? 0} eventos hoy`,
      show: true,
    },
  ].filter((k) => k.show);

  

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <header className="shrink-0 bg-background/60 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Vista general de toda la operación en tiempo real</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </Button>
        </div>
      </header>

      {/* Announcement Banners */}
      <AnnouncementBanner banners={banners} onViewDetail={handleOpenDetail} />

      {/* Scrollable Content */}
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards — patrón estándar; click abre modal */}
        <div className={`grid gap-3 ${getGridCols(kpis.length)}`}>
          {kpis.map((k) => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.value}
              icon={k.icon}
              color={k.color}
              subtitle={k.subtitle}
              onClick={() => setKpiPopup(k.key)}
            />
          ))}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-base font-semibold leading-none">Acciones Rápidas</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Accesos directos a los módulos que más utilizas</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={openConfig}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {activeActions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-[1px] transition-all duration-200 group"
                  onClick={() => navigate(action.url, { state: { fromDashboard: true } })}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="flex-1 text-sm font-medium">{action.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              ))}
              {activeActions.length === 0 && (
                <p className="col-span-6 text-sm text-muted-foreground text-center py-4">
                  No hay accesos configurados. Haz clic en el engranaje para agregar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Row 2: Weekly Performance + Avisos/Actividad */}
        <div className={`grid grid-cols-1 gap-4 ${canAccess("LeadGen") ? "lg:grid-cols-3" : ""}`}>
          {canAccess("LeadGen") && (
            <Card className="lg:col-span-2 transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Rendimiento Semanal</CardTitle>
                <CardDescription>Leads y Deals esta semana (datos reales)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="leads" stroke="hsl(211,100%,50%)" strokeWidth={2} name="Leads" dot={false} />
                      <Line type="monotone" dataKey="deals" stroke="hsl(145,63%,32%)" strokeWidth={2} name="Deals" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Avisos y Celebraciones */}
          <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-accent/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Avisos y Celebraciones
              </CardTitle>
              <CardDescription>Cumpleaños y anuncios internos</CardDescription>
            </CardHeader>
            <CardContent>
              {birthdays.length === 0 && announcements.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Sin avisos por el momento
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-auto">
                  {/* Birthdays */}
                  {birthdays.map((b) => (
                    <div key={b.id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                        <Cake className="h-3.5 w-3.5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{b.first_name} {b.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.isToday
                            ? "🎉 ¡Cumple años hoy!"
                            : `Cumple el ${format(new Date(b.birth_date + "T12:00:00"), "d 'de' MMMM", { locale: es })}`}
                        </p>
                      </div>
                      {b.isToday && (
                        <Badge className="bg-warning/10 text-warning hover:bg-warning/20 text-[10px]">Hoy</Badge>
                      )}
                    </div>
                  ))}
                  {/* Announcement Feed Cards */}
                  {announcements.map((a) => (
                    <AnnouncementFeedCard
                      key={a.id}
                      announcement={a}
                      onOpen={handleOpenDetail}
                      onVisible={handleRecordView}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 2b: Actividad Reciente */}
        <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actividad Reciente</CardTitle>
            <CardDescription>Tickets, tareas y eventos recientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
              {activityLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : recentActivity.length > 0 ? (
                recentActivity.filter((item) => {
                  if (item.type === "ticket" && !canAccess("Tickets")) return false;
                  if (item.type === "event" && !canAccess("Eventos")) return false;
                  return true;
                }).map((item) => {
                  const config = ACTIVITY_CONFIG[item.type];
                  const Icon = config.icon;
                  return (
                    <div key={`${item.type}-${item.id}`} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                        <Icon className={`h-3.5 w-3.5 ${config.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.date
                            ? formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: es })
                            : ""}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Pipeline + Top 5 + Pending Tasks */}
        {(() => {
          const row3Count = [canAccess("LeadGen"), canAccess("Creadores"), true].filter(Boolean).length;
          return (
        <div className={`grid gap-4 ${getGridCols(row3Count)}`}>
          {canAccess("LeadGen") && (
            <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-accent/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribución Pipeline</CardTitle>
                <CardDescription>Leads por estado</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineData.length > 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-48 w-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                            {pipelineData.map((_, i) => (
                              <Cell key={i} fill={PIPELINE_COLORS[i % PIPELINE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                      {pipelineData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[i % PIPELINE_COLORS.length] }} />
                          <span className="text-muted-foreground">{d.name}</span>
                          <span className="font-medium">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos de pipeline</p>
                )}
              </CardContent>
            </Card>
          )}

          {canAccess("Creadores") && (
            <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 5 Creadoras</CardTitle>
                <CardDescription>Por ingresos totales</CardDescription>
              </CardHeader>
              <CardContent>
                {earningsLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : top5.length > 0 ? (
                  <div className="space-y-3">
                    {top5.map((c, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{fmt(c.total)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-warning/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tareas Pendientes</CardTitle>
              <CardDescription>Próximas a vencer</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingTasks.length > 0 ? (
                <div className="space-y-3">
                  {pendingTasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                        <ListTodo className="h-3.5 w-3.5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <div className="flex items-center gap-2">
                          {t.due_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(t.due_at), { addSuffix: true, locale: es })}
                            </p>
                          )}
                          {t.priority && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.priority}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sin tareas pendientes</p>
              )}
            </CardContent>
          </Card>
        </div>
          );
        })()}

        {/* Row 4: Operational Cards */}
        {(() => {
          const row4Count = [canAccess("Tickets"), canAccess("Closers"), canAccess("HR")].filter(Boolean).length;
          if (row4Count === 0) return null;
          return (
        <div className={`grid gap-4 ${getGridCols(row4Count)}`}>
          {canAccess("Tickets") && <Card className="border-t-[3px] border-t-destructive transition-all duration-300 hover:translate-y-[-2px] hover:bg-gradient-to-b hover:from-destructive/5 hover:to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-destructive" />
                <div>
                  <CardTitle className="text-base">Customer Service</CardTitle>
                  <CardDescription>Tickets de soporte</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Urgentes</span>
                <Badge variant="destructive">{ticketsData?.urgent ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Resueltos</span>
                <Badge variant="secondary">{ticketsData?.resolved ?? 0}</Badge>
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-xs text-muted-foreground">
                  Tasa Resolución:{" "}
                  <span className="font-medium text-foreground">
                    {ticketsData && ticketsData.total > 0
                      ? `${Math.round((ticketsData.resolved / ticketsData.total) * 100)}%`
                      : "--"}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>}

          {canAccess("Closers") && (
            <Card className="border-t-[3px] border-t-primary transition-all duration-300 hover:translate-y-[-2px] hover:bg-gradient-to-b hover:from-primary/5 hover:to-transparent">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Closers</CardTitle>
                    <CardDescription>Actividad de ventas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Cerrados</span>
                  <Badge className="bg-success/10 text-success hover:bg-success/20">{leadsData?.closedCount ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Pipeline</span>
                  <Badge variant="secondary">{leadsData?.inProgressCount ?? 0}</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {canAccess("HR") && (
            <Card className="border-t-[3px] border-t-accent transition-all duration-300 hover:translate-y-[-2px] hover:bg-gradient-to-b hover:from-accent/5 hover:to-transparent">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-accent-foreground" />
                  <div>
                    <CardTitle className="text-base">Recursos Humanos</CardTitle>
                    <CardDescription>Resumen operacional</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Empleados activos</span>
                  <Badge className="bg-success/10 text-success hover:bg-success/20">{opKPIs?.totalEmployees ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ausencias hoy</span>
                  <Badge variant="secondary">{opKPIs?.absencesToday ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Eventos hoy</span>
                  <Badge variant="outline">{opKPIs?.eventsToday ?? 0}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
          );
        })()}
      </main>

      {/* Quick Actions Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Accesos Rápidos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecciona hasta {MAX_SHORTCUTS} módulos para mostrar en el dashboard.</p>
          <div className="space-y-2 max-h-72 overflow-auto py-2">
            {availableActions.map((action) => {
              const checked = draftIds.includes(action.id);
              const disabled = !checked && draftIds.length >= MAX_SHORTCUTS;
              return (
                <label
                  key={action.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checked ? "border-primary/40 bg-primary/5" : "border-border"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggleDraft(action.id)}
                  />
                  <action.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{action.label}</span>
                  {checked && <Check className="h-4 w-4 text-primary ml-auto" />}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button onClick={saveConfig}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Announcement Detail Modal */}
      <AnnouncementPublicDetail
        announcement={detailAnnouncement}
        open={!!detailAnnouncement}
        onOpenChange={(open) => !open && setDetailAnnouncement(null)}
        onOpened={handleRecordOpen}
      />

      {/* KPI Detail — desglose del KPI clickeado */}
      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "creators": return `Total Creators — ${creatorsData?.total ?? 0}`;
            case "tickets": return `Active Tickets — ${ticketsData?.active ?? 0}`;
            case "leads": return `New Leads Today — ${leadsData?.todayCount ?? 0}`;
            case "employees": return `Empleados Activos — ${opKPIs?.totalEmployees ?? 0}`;
            case "overdue": return `Tareas Vencidas — ${opKPIs?.overdueTasks ?? 0}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "creators": return "Estado de las creadoras del directorio";
            case "tickets": return "Tickets abiertos vs resueltos";
            case "leads": return "Leads ingresados hoy";
            case "employees": return "Headcount activo y ausencias del día";
            case "overdue": return "Tareas con due_date vencido + eventos del día";
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          if (kpiPopup === "creators") {
            return [
              { primary: "Activas", right: String(creatorsData?.active ?? 0), rightTone: "success" as const },
              { primary: "Inactivas", right: String(creatorsData?.inactive ?? 0), rightTone: "default" as const },
              { primary: "Total", right: String(creatorsData?.total ?? 0) },
            ];
          }
          if (kpiPopup === "tickets") {
            return [
              { primary: "Activos", right: String(ticketsData?.active ?? 0), rightTone: "warning" as const },
              { primary: "Resueltos", right: String(ticketsData?.resolved ?? 0), rightTone: "success" as const },
            ];
          }
          if (kpiPopup === "leads") {
            return [
              { primary: "Ingresados hoy", right: String(leadsData?.todayCount ?? 0), rightTone: "default" as const },
              { primary: "Interesados", right: String(leadsData?.interestedCount ?? 0), rightTone: "success" as const },
            ];
          }
          if (kpiPopup === "employees") {
            const rows: KpiRow[] = [
              { primary: "Total empleados activos", right: String(opKPIs?.totalEmployees ?? 0) },
              { primary: "Ausencias hoy", right: String(opKPIs?.absencesToday ?? 0), rightTone: "warning" as const },
            ];
            return rows;
          }
          if (kpiPopup === "overdue") {
            return [
              { primary: "Tareas vencidas", right: String(opKPIs?.overdueTasks ?? 0), rightTone: "destructive" as const },
              { primary: "Eventos hoy", right: String(opKPIs?.eventsToday ?? 0), rightTone: "default" as const },
            ];
          }
          return [];
        })()}
      />
    </div>
  );
};

export default DashboardContent;
