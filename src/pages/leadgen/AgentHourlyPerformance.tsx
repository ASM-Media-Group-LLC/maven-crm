import { useState, useMemo, useEffect } from "react";
import { Clock, Target, TrendingUp, BarChart3 } from "lucide-react";
import { format, isSameDay, differenceInMinutes, differenceInSeconds, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LeadGenEntry } from "./useLeadGen";

interface AgentHourlyPerformanceProps {
  leads: LeadGenEntry[];
}

const OBJETIVO_POR_HORA = 20;

const qualityCards = [
  { key: "a+", label: "Top Quality", color: "text-emerald-500", bgIcon: "bg-emerald-500/20", hoverBg: "group-hover:bg-emerald-500/5" },
  { key: "a", label: "Excelente", color: "text-blue-500", bgIcon: "bg-blue-500/20", hoverBg: "group-hover:bg-blue-500/5" },
  { key: "b+", label: "Buena", color: "text-cyan-500", bgIcon: "bg-cyan-500/20", hoverBg: "group-hover:bg-cyan-500/5" },
  { key: "b", label: "Regular", color: "text-violet-500", bgIcon: "bg-violet-500/20", hoverBg: "group-hover:bg-violet-500/5" },
  { key: "c", label: "Básica", color: "text-muted-foreground", bgIcon: "bg-muted", hoverBg: "group-hover:bg-muted/50" },
];

const qualityBarColors: Record<string, string> = {
  "A+": "hsl(160, 60%, 45%)", "A": "hsl(217, 71%, 53%)",
  "B+": "hsl(187, 72%, 50%)", "B": "hsl(263, 70%, 50%)",
  "C": "hsl(215, 14%, 50%)",
};

const AgentHourlyPerformance = ({ leads }: AgentHourlyPerformanceProps) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const todayLeads = useMemo(() =>
    leads.filter(l => isSameDay(new Date(l.created_at), now)),
    [leads, now]);

  const lastHourLeads = useMemo(() =>
    todayLeads.filter(l => differenceInMinutes(now, new Date(l.created_at)) < 60),
    [todayLeads, now]);

  const prevHourLeads = useMemo(() =>
    todayLeads.filter(l => {
      const mins = differenceInMinutes(now, new Date(l.created_at));
      return mins >= 60 && mins < 120;
    }), [todayLeads, now]);

  const lastHourDelta = lastHourLeads.length - prevHourLeads.length;

  const firstLeadToday = useMemo(() => {
    if (todayLeads.length === 0) return null;
    const sorted = [...todayLeads].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return new Date(sorted[0].created_at);
  }, [todayLeads]);

  const totalSecondsActive = firstLeadToday ? Math.max(0, differenceInSeconds(now, firstLeadToday)) : 0;
  const activeHours = Math.floor(totalSecondsActive / 3600);
  const activeMinutes = Math.floor((totalSecondsActive % 3600) / 60);
  const activeSeconds = totalSecondsActive % 60;
  const hoursWorked = totalSecondsActive / 3600;
  const avgPerHour = hoursWorked > 0 ? (todayLeads.length / hoursWorked).toFixed(1) : "0";
  const esperados = Math.round(hoursWorked * OBJETIVO_POR_HORA);
  const diferencia = todayLeads.length - esperados;

  const qualityCounts = useMemo(() => {
    const counts: Record<string, number> = { "a+": 0, "a": 0, "b+": 0, "b": 0, "c": 0 };
    leads.forEach(l => {
      const cat = l.quality?.toLowerCase();
      if (cat && counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [leads]);

  const dailyData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = subDays(now, 6 - i);
    return {
      label: format(day, "EEE dd", { locale: es }),
      count: leads.filter(l => isSameDay(new Date(l.created_at), day)).length,
    };
  }), [leads, now]);

  const hourlyData = useMemo(() => {
    const data = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}:00`,
      count: todayLeads.filter(l => new Date(l.created_at).getHours() === i).length,
    }));
    const firstIdx = data.findIndex(h => h.count > 0);
    const lastIdx = data.length - 1 - [...data].reverse().findIndex(h => h.count > 0);
    return firstIdx >= 0 ? data.slice(firstIdx, lastIdx + 1) : data;
  }, [todayLeads]);

  const qualityDistData = useMemo(() =>
    Object.entries(qualityCounts)
      .filter(([_, v]) => v > 0)
      .map(([key, value]) => ({ category: key.toUpperCase(), count: value })),
    [qualityCounts]);

  const daysWithActivity = dailyData.filter(d => d.count > 0).length || 1;
  const avgPerDay = (leads.length / daysWithActivity).toFixed(1);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      {/* Active time + last hour header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Tiempo Activo</span>
          <span className="text-sm font-mono font-semibold">
            {String(activeHours).padStart(2, "0")}h {String(activeMinutes).padStart(2, "0")}min {String(activeSeconds).padStart(2, "0")}s
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
          <span className="text-xs text-muted-foreground">Última Hora</span>
          <span className="text-sm font-semibold">{lastHourLeads.length}</span>
          <Badge className={`text-xs ${lastHourDelta >= 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-destructive/20 text-destructive border-destructive/30"}`}>
            {lastHourDelta >= 0 ? `+${lastHourDelta}` : lastHourDelta}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="group transition-all duration-300 hover:scale-[1.03] hover:shadow-lg overflow-hidden border-none bg-card/50">
          <CardContent className="p-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Última Hora</p>
                <div className="h-8 w-8 rounded-md bg-primary/20 flex items-center justify-center text-primary">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-primary">{lastHourLeads.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Modelos contactados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="group transition-all duration-300 hover:scale-[1.03] hover:shadow-lg overflow-hidden border-none bg-card/50">
          <CardContent className="p-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Hoy</p>
                <div className="h-8 w-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Target className="h-4 w-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-emerald-500">{todayLeads.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Modelos contactados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="group transition-all duration-300 hover:scale-[1.03] hover:shadow-lg overflow-hidden border-none bg-card/50">
          <CardContent className="p-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Promedio por Hora</p>
                <div className="h-8 w-8 rounded-md bg-violet-500/20 flex items-center justify-center text-violet-500">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="text-3xl font-bold text-violet-500">{avgPerHour}</p>
              <p className="text-xs text-muted-foreground mt-1">Objetivo: {OBJETIVO_POR_HORA}/hora</p>
              <p className={`text-xs font-semibold mt-0.5 ${diferencia >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                Esperados: {esperados} | {diferencia >= 0 ? `+${diferencia}` : diferencia}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Cards */}
      <div className="grid grid-cols-5 gap-3">
        {qualityCards.map((q) => (
          <Card key={q.key} className="group transition-all duration-300 hover:scale-[1.03] hover:shadow-lg overflow-hidden border-none bg-card/50">
            <CardContent className="p-4 relative">
              <div className={`absolute inset-0 ${q.hoverBg} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{q.key.toUpperCase()}</p>
                  <div className={`h-6 w-6 rounded-md ${q.bgIcon} flex items-center justify-center`}>
                    <span className={`text-xs font-bold ${q.color}`}>{q.key.toUpperCase()}</span>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${q.color}`}>{qualityCounts[q.key]}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Resumen</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-2xl font-bold text-primary">{leads.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Leads</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-2xl font-bold text-primary">{avgPerDay}</p>
              <p className="text-xs text-muted-foreground mt-1">Promedio/Día</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-2xl font-bold text-primary">{hoursWorked.toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground mt-1">Horas Activas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-4">Leads por Día</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-4">Leads por Hora (Hoy)</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="count" name="Leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--card))", stroke: "hsl(var(--primary))", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Distribution */}
      {qualityDistData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold mb-4">Distribución por Categoría</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qualityDistData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 13, fontWeight: 600 }} width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}
                    shape={(props: any) => {
                      const color = qualityBarColors[props.category] || "hsl(var(--primary))";
                      return <rect {...props} fill={color} />;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AgentHourlyPerformance;
