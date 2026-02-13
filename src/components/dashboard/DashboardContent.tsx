import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Ticket, CalendarCheck, MessageSquare, Phone,
  Headphones, FileCode, AlertCircle, RefreshCw, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import DashboardMetricCard from "./DashboardMetricCard";
import { useEarningsData } from "@/pages/sales-performance/useEarningsData";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

/* ── Data hooks ─────────────────────────────────────── */

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
      const recent = all.slice(0, 5);
      return { active: activeTickets.length, resolved: resolved.length, urgent: urgent.length, recent, total: all.length };
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

      // Group by status for pipeline
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

/* ── Placeholder data ─────────────────────────────── */

const weeklyData = [
  { day: "Lun", leads: 12, deals: 3, compliance: 85 },
  { day: "Mar", leads: 19, deals: 5, compliance: 78 },
  { day: "Mié", leads: 15, deals: 4, compliance: 92 },
  { day: "Jue", leads: 22, deals: 7, compliance: 88 },
  { day: "Vie", leads: 18, deals: 6, compliance: 75 },
  { day: "Sáb", leads: 8, deals: 2, compliance: 90 },
  { day: "Dom", leads: 5, deals: 1, compliance: 95 },
];

const dealsWeekly = [
  { day: "Lun", deals: 3 },
  { day: "Mar", deals: 5 },
  { day: "Mié", deals: 4 },
  { day: "Jue", deals: 7 },
  { day: "Vie", deals: 6 },
  { day: "Sáb", deals: 2 },
  { day: "Dom", deals: 1 },
];

const PIPELINE_COLORS = [
  "hsl(211, 100%, 50%)",  // primary
  "hsl(271, 91%, 50%)",   // accent
  "hsl(40, 96%, 40%)",    // warning
  "hsl(145, 63%, 32%)",   // success
  "hsl(0, 84%, 60%)",     // destructive
];

/* ── Component ────────────────────────────────────── */

const DashboardContent = () => {
  const navigate = useNavigate();
  const { data: creatorsData, isLoading: creatorsLoading } = useCreatorsCount();
  const { data: ticketsData, isLoading: ticketsLoading } = useTicketsData();
  const { data: leadsData, isLoading: leadsLoading } = useLeadsData();
  const { data: earningsRows = [], isLoading: earningsLoading } = useEarningsData();

  // Top 5 creators by earnings
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

  // Pipeline donut data
  const pipelineData = useMemo(() => {
    if (!leadsData?.pipeline) return [];
    return Object.entries(leadsData.pipeline).map(([name, value]) => ({ name, value }));
  }, [leadsData]);

  const loading = "…";

  const kpis = [
    {
      label: "Total Creators",
      value: creatorsLoading ? loading : String(creatorsData?.total ?? 0),
      icon: Users,
      valueColor: "text-primary",
      subtitle: creatorsLoading ? "" : `${creatorsData?.active ?? 0} activas / ${creatorsData?.inactive ?? 0} inactivas`,
    },
    {
      label: "Active Tickets",
      value: ticketsLoading ? loading : String(ticketsData?.active ?? 0),
      icon: Ticket,
      valueColor: "text-destructive",
      subtitle: ticketsLoading ? "" : `${ticketsData?.resolved ?? 0} resueltos`,
    },
    {
      label: "Promotion Compliance",
      value: "39%",
      icon: CalendarCheck,
      valueColor: "text-warning",
      subtitle: "Weekly average",
    },
    {
      label: "New Leads Today",
      value: leadsLoading ? loading : String(leadsData?.todayCount ?? 0),
      icon: MessageSquare,
      valueColor: "text-accent",
      subtitle: leadsLoading ? "" : `${leadsData?.interestedCount ?? 0} interesados`,
    },
    {
      label: "Deals in Progress",
      value: leadsLoading ? loading : String(leadsData?.inProgressCount ?? 0),
      icon: Phone,
      valueColor: "text-success",
      subtitle: leadsLoading ? "" : `${leadsData?.closedCount ?? 0} cerrados`,
    },
  ];

  const fmt = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Vista general de toda la operación en tiempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <DashboardMetricCard key={k.label} {...k} />
        ))}
      </div>

      {/* Row 2: Weekly Performance + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rendimiento Semanal</CardTitle>
            <CardDescription>Leads, Deals y Compliance</CardDescription>
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
                  <Line type="monotone" dataKey="compliance" stroke="hsl(271,91%,50%)" strokeWidth={2} name="Compliance %" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actividad Reciente</CardTitle>
            <CardDescription>Últimas acciones del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ticketsLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : ticketsData?.recent && ticketsData.recent.length > 0 ? (
                ticketsData.recent.map((t) => (
                  <div key={t.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.created_at
                          ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: es })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Pipeline + Top 5 + Deals Semanales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pipeline Donut */}
        <Card>
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
                      <Pie
                        data={pipelineData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
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
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIPELINE_COLORS[i % PIPELINE_COLORS.length] }}
                      />
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

        {/* Top 5 Creators */}
        <Card>
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
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
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

        {/* Deals Semanales */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deals Semanales</CardTitle>
            <CardDescription>Deals cerrados por día</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsWeekly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
                  <Tooltip />
                  <Bar dataKey="deals" fill="hsl(145,63%,32%)" radius={[4, 4, 0, 0]} name="Deals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Operational Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Customer Service */}
        <Card className="border-t-[3px] border-t-destructive">
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
        </Card>

        {/* Closers */}
        <Card className="border-t-[3px] border-t-primary">
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
              <span className="text-sm">En llamada</span>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">--</Badge>
            </div>
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

        {/* Scripts and Tools */}
        <Card className="border-t-[3px] border-t-accent">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-accent" />
              <div>
                <CardTitle className="text-base">Scripts and Tools</CardTitle>
                <CardDescription>Recursos del equipo</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Scripts activos</span>
              <Badge className="bg-accent/10 text-accent hover:bg-accent/20">--</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Templates</span>
              <Badge variant="secondary">--</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Objetivos</span>
              <Badge variant="secondary">--</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default DashboardContent;
