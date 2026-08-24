import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Ticket, CalendarCheck, MessageSquare, Phone,
  Headphones, AlertCircle, RefreshCw,
  UserMinus, Zap, Settings2, Check,
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
import StatChip from "@/components/StatChip";
import { UserAvatar } from "@/components/UserAvatar";
import { Crown } from "lucide-react";
import { startOfMonth } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { useBestCloser } from "@/hooks/useOperationsDashboard";
import KpiDetailDialog, { type KpiRow } from "./KpiDetailDialog";
import { useDashboard2Summary } from "@/pages/sales-performance/useDashboard2Summary";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { useWeeklyStats, useOperationalKPIs, useRecentActivity } from "@/hooks/useDashboardData";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
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
};

/* ── Quick Actions ────────────────────────────────── */

interface QuickAction {
  id: string;
  label: TranslationKey;
  icon: typeof Users;
  url: string;
  module?: string; // for permission filtering
}

const ALL_ACTIONS: QuickAction[] = [
  { id: "contactos",  label: "dashboard.action.contacts", icon: UserPlus,      url: "/contactos",         module: "Contactos" },
  { id: "creadores",  label: "dashboard.action.creators", icon: Users,         url: "/creadores",         module: "Creadores" },
  { id: "leadgen",    label: "dashboard.action.leadgen",  icon: MessageSquare, url: "/leadgen",           module: "LeadGen" },
  { id: "closers",    label: "dashboard.action.closers",  icon: Phone,         url: "/closers",           module: "Closers" },
  { id: "tickets",    label: "dashboard.action.tickets",  icon: Ticket,        url: "/tickets",           module: "Tickets" },
  { id: "hr",         label: "dashboard.action.hr",       icon: Briefcase,     url: "/hr",                module: "HR" },
  { id: "finanzas",   label: "dashboard.action.finance",  icon: DollarSign,    url: "/finanzas",          module: "Finanzas" },
  { id: "promolog",   label: "dashboard.action.promolog", icon: Megaphone,     url: "/promolog",          module: "Promolog" },
  { id: "sales",      label: "dashboard.action.sales",    icon: TrendingUp,    url: "/sales",             module: "Creator Sales" },
  { id: "admin",      label: "dashboard.action.admin",    icon: Settings,      url: "/admin/usuarios",    module: "Administración" },
];

const DEFAULT_ACTION_IDS = ["contactos", "creadores", "tickets"];
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canAccess } = usePermissions();
  const { user } = useAuth();
  const profileQ = useMyProfile();
  // Banner "Mejor cerrador" del mes en curso (mismo hook que Closers/Panel).
  // Solo se consulta si el rol puede ver Closers.
  const bestCloserRange = useMemo(
    () => ({ from: startOfMonth(new Date()), to: new Date() }),
    [],
  );
  const bestCloserQ = useBestCloser(bestCloserRange);
  const firstName = (
    user?.user_metadata?.full_name || profileQ.data?.full_name || ""
  ).split(" ")[0];
  // "domingo 23 de agosto" con la primera letra en mayúscula
  const fechaHoy = (() => {
    const f = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
    return f.charAt(0).toUpperCase() + f.slice(1);
  })();

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
  // Top creadoras all-time (agregado server-side, 1 request) — antes bajaba 13k filas crudas.
  const { data: earningsSummary = [], isLoading: earningsLoading } = useDashboard2Summary("2000-01-01", "2100-01-01");
  const { data: weeklyData = [] } = useWeeklyStats();
  const { data: opKPIs } = useOperationalKPIs();
  const { data: recentActivity = [], isLoading: activityLoading } = useRecentActivity();
  const { feed: announcements, banners } = useAnnouncementsByChannel();
  const { data: birthdays = [] } = useUpcomingBirthdays();

  // Confetti breve cuando hay al menos un cumpleaños en el widget de
  // Avisos y Celebraciones. Una sola vez por montaje y una vez por dia
  // (flag en sessionStorage), y nunca si el usuario prefiere menos movimiento.
  const confettiFiredRef = useRef(false);
  useEffect(() => {
    if (confettiFiredRef.current) return;
    if (birthdays.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const key = `confetti-celebraciones-${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(key)) return;
    confettiFiredRef.current = true;
    sessionStorage.setItem(key, "1");
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      disableForReducedMotion: true,
    });
  }, [birthdays]);
  const recordView = useRecordAnnouncementView();
  const recordOpen = useRecordAnnouncementOpen();
  const [detailAnnouncement, setDetailAnnouncement] = useState<Announcement | null>(null);
  const [kpiPopup, setKpiPopup] = useState<"creators" | "tickets" | "leads" | "employees" | null>(null);

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
    // earningsSummary ya viene agregado por creadora (server-side); solo ordenamos.
    return earningsSummary
      .map((r) => ({ name: r.artistic_name || r.blu_creator_name || t("dashboard.noName"), total: r.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [earningsSummary, t]);

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

  type KpiKey = "creators" | "tickets" | "leads" | "employees";
  const kpis = [
    {
      key: "creators" as KpiKey,
      label: t("dashboard.kpiTotalCreators"),
      value: creatorsLoading ? loading : String(creatorsData?.total ?? 0),
      icon: Users,
      color: "bg-blue-500",
      subtitle: creatorsLoading ? "" : t("dashboard.kpiCreatorsSub", { active: creatorsData?.active ?? 0, inactive: creatorsData?.inactive ?? 0 }),
      show: canAccess("Creadores"),
    },
    {
      key: "tickets" as KpiKey,
      label: t("dashboard.kpiActiveTickets"),
      value: ticketsLoading ? loading : String(ticketsData?.active ?? 0),
      icon: Ticket,
      color: "bg-rose-500",
      subtitle: ticketsLoading ? "" : t("dashboard.kpiTicketsSub", { n: ticketsData?.resolved ?? 0 }),
      show: canAccess("Tickets"),
    },
    {
      key: "leads" as KpiKey,
      label: t("dashboard.kpiNewLeadsToday"),
      value: leadsLoading ? loading : String(leadsData?.todayCount ?? 0),
      icon: MessageSquare,
      color: "bg-violet-500",
      subtitle: leadsLoading ? "" : t("dashboard.kpiLeadsSub", { n: leadsData?.interestedCount ?? 0 }),
      show: canAccess("LeadGen"),
    },
    {
      key: "employees" as KpiKey,
      label: t("dashboard.kpiActiveEmployees"),
      value: String(opKPIs?.totalEmployees ?? 0),
      icon: Users,
      color: "bg-emerald-500",
      subtitle: t("dashboard.kpiEmployeesSub", { n: opKPIs?.absencesToday ?? 0 }),
      show: canAccess("HR"),
    },
  ].filter((k) => k.show);

  

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {firstName ? t("dashboard.greeting", { name: firstName }) : t("dashboard.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("dashboard.headerSubtitle", { date: fechaHoy })}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5" /> {t("dashboard.refresh")}
            </Button>
          </div>
        </div>
      </header>

      {/* Announcement Banners */}
      <AnnouncementBanner banners={banners} onViewDetail={handleOpenDetail} />

      {/* Scrollable Content */}
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Mejor cerrador del mes — el momento con personalidad del mockup.
            Mismo dato que el hero de Closers; visible solo con permiso. */}
        {canAccess("Closers") && bestCloserQ.data ? (
          <button
            type="button"
            onClick={() => navigate("/closers")}
            className="flex w-full items-center gap-4 rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-pink-500/10 to-transparent p-4 text-left transition-transform hover:scale-[1.005]"
          >
            <UserAvatar name={bestCloserQ.data.name} size="lg" ring />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-500">
                {t("dashboard.bestCloser", { month: format(new Date(), "MMMM", { locale: es }) })}
              </div>
              <div className="truncate text-lg font-bold">{bestCloserQ.data.name}</div>
              <div className="text-xs text-muted-foreground">
                {bestCloserQ.data.closes} {bestCloserQ.data.closes === 1 ? t("dashboard.closeSingular") : t("dashboard.closePlural")} · {t("dashboard.qaAvg", { score: Math.round(bestCloserQ.data.avgScore) })}
              </div>
            </div>
            <Crown className="h-7 w-7 shrink-0 text-amber-500" />
          </button>
        ) : null}
        {/* KPI Cards — stat-chips compactos; click abre modal */}
        <div className={`grid gap-3 ${getGridCols(kpis.length)}`}>
          {kpis.map((k) => (
            <StatChip
              key={k.label}
              label={k.label}
              value={k.value}
              icon={<k.icon className="h-3.5 w-3.5" />}
              color={k.color}
              hint={k.subtitle || undefined}
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
                  <p className="text-base font-semibold leading-none">{t("dashboard.quickActions")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("dashboard.quickActionsDesc")}</p>
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
                  <span className="flex-1 text-sm font-medium">{t(action.label)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              ))}
              {activeActions.length === 0 && (
                <p className="col-span-6 text-sm text-muted-foreground text-center py-4">
                  {t("dashboard.quickActionsEmpty")}
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
                <CardTitle className="text-base">{t("dashboard.weeklyTitle")}</CardTitle>
                <CardDescription>{t("dashboard.weeklyDesc")}</CardDescription>
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
                {t("dashboard.celebrationsTitle")}
              </CardTitle>
              <CardDescription>{t("dashboard.celebrationsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {birthdays.length === 0 && announcements.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {t("dashboard.celebrationsEmpty")}
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
                            ? t("dashboard.birthdayToday")
                            : t("dashboard.birthdayOn", { date: format(new Date(b.birth_date + "T12:00:00"), "d 'de' MMMM", { locale: es }) })}
                        </p>
                      </div>
                      {b.isToday && (
                        <Badge className="bg-warning/10 text-warning hover:bg-warning/20 text-[10px]">{t("dashboard.today")}</Badge>
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
            <CardTitle className="text-base">{t("dashboard.recentActivityTitle")}</CardTitle>
            <CardDescription>{t("dashboard.recentActivityDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
              {activityLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : recentActivity.length > 0 ? (
                recentActivity.filter((item) => {
                  if (item.type === "ticket" && !canAccess("Tickets")) return false;
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
                <p className="text-sm text-muted-foreground">{t("dashboard.recentActivityEmpty")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Pipeline + Top 5 */}
        {(() => {
          const row3Count = [canAccess("LeadGen"), canAccess("Creadores")].filter(Boolean).length;
          if (row3Count === 0) return null;
          return (
        <div className={`grid gap-4 ${getGridCols(row3Count)}`}>
          {canAccess("LeadGen") && (
            <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-accent/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dashboard.pipelineTitle")}</CardTitle>
                <CardDescription>{t("dashboard.pipelineDesc")}</CardDescription>
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
                  <p className="text-sm text-muted-foreground text-center py-8">{t("dashboard.pipelineEmpty")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {canAccess("Creadores") && (
            <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dashboard.top5Title")}</CardTitle>
                <CardDescription>{t("dashboard.top5Desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {earningsLoading ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
                  <p className="text-sm text-muted-foreground text-center py-8">{t("dashboard.noData")}</p>
                )}
              </CardContent>
            </Card>
          )}

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
                  <CardTitle className="text-base">{t("dashboard.csTitle")}</CardTitle>
                  <CardDescription>{t("dashboard.csDesc")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("dashboard.urgent")}</span>
                <Badge variant="destructive">{ticketsData?.urgent ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t("dashboard.resolved")}</span>
                <Badge variant="secondary">{ticketsData?.resolved ?? 0}</Badge>
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.resolutionRate")}{" "}
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
                    <CardTitle className="text-base">{t("dashboard.closersTitle")}</CardTitle>
                    <CardDescription>{t("dashboard.closersDesc")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t("dashboard.closed")}</span>
                  <Badge className="bg-success/10 text-success hover:bg-success/20">{leadsData?.closedCount ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t("dashboard.pipeline")}</span>
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
                    <CardTitle className="text-base">{t("dashboard.hrTitle")}</CardTitle>
                    <CardDescription>{t("dashboard.hrDesc")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t("dashboard.activeEmployeesRow")}</span>
                  <Badge className="bg-success/10 text-success hover:bg-success/20">{opKPIs?.totalEmployees ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t("dashboard.absencesToday")}</span>
                  <Badge variant="secondary">{opKPIs?.absencesToday ?? 0}</Badge>
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
            <DialogTitle>{t("dashboard.configTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("dashboard.configHint", { n: MAX_SHORTCUTS })}</p>
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
                  <span className="text-sm font-medium">{t(action.label)}</span>
                  {checked && <Check className="h-4 w-4 text-primary ml-auto" />}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveConfig}>{t("dashboard.save")}</Button>
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
            case "creators": return `${t("dashboard.kpiTotalCreators")} — ${creatorsData?.total ?? 0}`;
            case "tickets": return `${t("dashboard.kpiActiveTickets")} — ${ticketsData?.active ?? 0}`;
            case "leads": return `${t("dashboard.kpiNewLeadsToday")} — ${leadsData?.todayCount ?? 0}`;
            case "employees": return `${t("dashboard.kpiActiveEmployees")} — ${opKPIs?.totalEmployees ?? 0}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "creators": return t("dashboard.kpiCreatorsSubtitle");
            case "tickets": return t("dashboard.kpiTicketsSubtitle");
            case "leads": return t("dashboard.kpiLeadsSubtitle");
            case "employees": return t("dashboard.kpiEmployeesSubtitle");
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          if (kpiPopup === "creators") {
            return [
              { primary: t("dashboard.rowActive"), right: String(creatorsData?.active ?? 0), rightTone: "success" as const },
              { primary: t("dashboard.rowInactive"), right: String(creatorsData?.inactive ?? 0), rightTone: "default" as const },
              { primary: t("dashboard.rowTotal"), right: String(creatorsData?.total ?? 0) },
            ];
          }
          if (kpiPopup === "tickets") {
            return [
              { primary: t("dashboard.rowActiveM"), right: String(ticketsData?.active ?? 0), rightTone: "warning" as const },
              { primary: t("dashboard.rowResolved"), right: String(ticketsData?.resolved ?? 0), rightTone: "success" as const },
            ];
          }
          if (kpiPopup === "leads") {
            return [
              { primary: t("dashboard.rowToday"), right: String(leadsData?.todayCount ?? 0), rightTone: "default" as const },
              { primary: t("dashboard.rowInterested"), right: String(leadsData?.interestedCount ?? 0), rightTone: "success" as const },
            ];
          }
          if (kpiPopup === "employees") {
            const rows: KpiRow[] = [
              { primary: t("dashboard.rowTotalEmployees"), right: String(opKPIs?.totalEmployees ?? 0) },
              { primary: t("dashboard.rowAbsencesToday"), right: String(opKPIs?.absencesToday ?? 0), rightTone: "warning" as const },
            ];
            return rows;
          }
          return [];
        })()}
      />
    </div>
  );
};

export default DashboardContent;
