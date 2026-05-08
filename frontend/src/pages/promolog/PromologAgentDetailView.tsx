import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, Search, Check, Minus, X, TrendingUp, Table2, Users, BarChart3, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DataTableShell from "@/components/ui/data-table-shell";
import PromologTable from "./PromologTable";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, Legend,
} from "recharts";
import type { PromologEntry } from "./PromologEntryCard";
import ViewPromologEntryModal from "./ViewPromologEntryModal";

const networkOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "telegram", label: "Telegram" },
];

const promotedToResult = (promoted: string | null): string => {
  switch (promoted) {
    case "true": return "Sí";
    case "false": return "No";
    case "partial": return "Parcial";
    case "pending": return "Pendiente";
    default: return "Pendiente";
  }
};

interface PromologAgentDetailViewProps {
  agent: { id: string; name: string };
  onBack: () => void;
}

const COLORS = {
  si: "hsl(var(--success))",
  parcial: "hsl(var(--warning))",
  no: "hsl(var(--destructive))",
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  muted: "hsl(var(--muted-foreground))",
};

const NETWORK_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  tiktok: "#000000",
  x: "#1DA1F2",
  telegram: "#0088cc",
};

const PromologAgentDetailView = ({ agent, onBack }: PromologAgentDetailViewProps) => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const isManagement = ["admin", "manager", "supervisor"].includes(role ?? "");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("promos");
  type KpiKey = "total" | "si" | "parcial" | "no" | "exito" | "avg" | "hoy";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterNetwork, setFilterNetwork] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<PromologEntry | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) setStatsCollapsed(true);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setStatsCollapsed(false);
  };

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });

  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p: any) => { if (p.id && p.full_name) map[p.id] = p.full_name; });
    return map;
  }, [profiles]);

  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: ["promolog-agent-detail", agent.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("promolog_entries")
        .select("*, creators(name, artistic_name, instagram_handle)")
        .or(`reviewed_by.eq.${agent.id},created_by.eq.${agent.id}`)
        .order("date", { ascending: false });

      if (dateFrom) query = query.gte("date", dateFrom.toISOString().split("T")[0]);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        query = query.lt("date", toDate.toISOString().split("T")[0]);
      }

      const { data, error } = await query;
      if (error) throw error;

      const map = new Map<string, any>();
      for (const e of data ?? []) {
        const dayKey = e.date?.split("T")[0] ?? e.date;
        const key = `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, e);
        } else {
          const score = (r: any) =>
            (r.evidence_url ? 1 : 0) + (r.notes ? 1 : 0) + (r.reviewed_by ? 1 : 0) + (r.action_taken ? 1 : 0);
          if (score(e) > score(existing)) map.set(key, e);
        }
      }
      return Array.from(map.values());
    },
  });

  const entries: PromologEntry[] = useMemo(() => {
    return rawEntries.map((pe: any) => {
      const dateObj = new Date(pe.date);
      const creator = pe.creators as any;
      return {
        id: pe.id,
        ticketNumber: pe.ticket_number || "",
        name: creator?.artistic_name || creator?.name || "Sin nombre",
        handle: creator?.instagram_handle || undefined,
        network: (pe.network || "").toLowerCase(),
        platform: pe.platform || "OnlyFans",
        result: promotedToResult(pe.promoted),
        date: dateObj.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
        time: dateObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: true }),
        agent: (pe.reviewed_by && profilesMap[pe.reviewed_by]) || "—",
        notes: pe.notes || "",
        creator_id: pe.creator_id,
        reviewed_by: pe.reviewed_by || undefined,
      };
    });
  }, [rawEntries, profilesMap]);

  // KPIs
  const totalEntries = entries.length;
  const siCount = entries.filter(e => e.result === "Sí").length;
  const parcialCount = entries.filter(e => e.result === "Parcial").length;
  const noCount = entries.filter(e => e.result === "No").length;
  const successRate = totalEntries > 0 ? Math.round((siCount / totalEntries) * 100) : 0;

  // Performance data
  const promosByDay = useMemo(() => {
    const days: { date: string; total: number; si: number; parcial: number; no: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayStr = format(d, "yyyy-MM-dd");
      const dayLabel = format(d, "EEE d", { locale: es });
      const dayEntries = rawEntries.filter((e: any) => (e.date?.split("T")[0] ?? "") === dayStr);
      days.push({
        date: dayLabel,
        total: dayEntries.length,
        si: dayEntries.filter((e: any) => e.promoted === "true").length,
        parcial: dayEntries.filter((e: any) => e.promoted === "partial").length,
        no: dayEntries.filter((e: any) => e.promoted === "false").length,
      });
    }
    return days;
  }, [rawEntries]);

  const promosByHour = useMemo(() => {
    const hours: { hour: string; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const label = `${h.toString().padStart(2, "0")}:00`;
      const count = rawEntries.filter((e: any) => {
        const d = new Date(e.date);
        return isToday(d) && d.getHours() === h;
      }).length;
      hours.push({ hour: label, count });
    }
    return hours;
  }, [rawEntries]);

  const networkDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    rawEntries.forEach((e: any) => {
      const net = (e.network || "otro").toLowerCase();
      map[net] = (map[net] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rawEntries]);

  const resultDistribution = useMemo(() => [
    { name: "Sí", value: siCount, color: COLORS.si },
    { name: "Parcial", value: parcialCount, color: COLORS.parcial },
    { name: "No", value: noCount, color: COLORS.no },
  ], [siCount, parcialCount, noCount]);

  const avgPerDay = useMemo(() => {
    const daySet = new Set(rawEntries.map((e: any) => e.date?.split("T")[0]));
    return daySet.size > 0 ? Math.round(totalEntries / daySet.size * 10) / 10 : 0;
  }, [rawEntries, totalEntries]);

  // Filtered entries for table
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.ticketNumber.toLowerCase().includes(q)) return false;
      }
      if (filterNetwork && e.network !== filterNetwork) return false;
      if (filterPlatform && !(e.platform || "").toLowerCase().includes(filterPlatform)) return false;
      return true;
    });
  }, [entries, searchTerm, filterNetwork, filterPlatform]);

  const handleNotesChange = async (entryId: string, notes: string | null) => {
    const { error } = await supabase.from("promolog_entries").update({ notes }).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-agent-detail", agent.id] });
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{agent.name}</h1>
              <Badge variant="outline" className="text-xs shrink-0">{totalEntries} promos</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Detalle del agente — Promolog</p>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="promos">
              <Table2 className="h-4 w-4 mr-1.5" />Promos
            </TabsTrigger>
            <TabsTrigger value="rendimiento">
              <BarChart3 className="h-4 w-4 mr-1.5" />Rendimiento
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {activeTab === "promos" && (
        <>
          {/* KPI Cards — clickeables, abren modal con detalle */}
          <div className={`shrink-0 px-6 pt-4 transition-all duration-300 overflow-hidden ${statsCollapsed ? "max-h-0 opacity-0 py-0" : "max-h-[240px] opacity-100 pb-2"}`}>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Total" value={String(totalEntries)} icon={Table2} color="bg-blue-500" onClick={() => setKpiPopup("total")} />
              <KpiCard label="Sí" value={String(siCount)} icon={Check} color="bg-emerald-500" onClick={() => setKpiPopup("si")} />
              <KpiCard label="Parcial" value={String(parcialCount)} icon={Minus} color="bg-amber-500" onClick={() => setKpiPopup("parcial")} />
              <KpiCard label="No" value={String(noCount)} icon={X} color="bg-rose-500" onClick={() => setKpiPopup("no")} />
              <KpiCard label="Éxito" value={`${successRate}%`} icon={TrendingUp} color="bg-violet-500" onClick={() => setKpiPopup("exito")} />
            </div>
          </div>

          {/* Filters */}
          <div className="shrink-0 px-6 pb-2 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar modelo..." className="pl-9 h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Select value={filterNetwork || undefined} onValueChange={(v) => setFilterNetwork(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Red Social" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {networkOptions.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPlatform || undefined} onValueChange={(v) => setFilterPlatform(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Plataforma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="onlyfans">OnlyFans</SelectItem>
                  <SelectItem value="unlok">Unlok</SelectItem>
                  <SelectItem value="otra">Otra</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onApply={(from, to) => { setDateFrom(from); setDateTo(to); setStatsCollapsed(false); }}
                placeholder="Fechas"
                className="h-9"
              />
              {(searchTerm || filterNetwork || filterPlatform || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchTerm(""); setFilterNetwork(""); setFilterPlatform(""); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="mr-1.5 h-4 w-4" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 px-6 pb-4 flex flex-col">
            <DataTableShell
              onScroll={handleScroll}
              className="flex-1 min-h-0"
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
              totalCount={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            >
              <PromologTable
                entries={filtered.slice((page - 1) * pageSize, page * pageSize)}
                onView={(entry) => setViewingEntry(entry)}
                onNotesChange={handleNotesChange}
                viewOnly
              />
            </DataTableShell>
          </div>
        </>
      )}

      {activeTab === "rendimiento" && (
        <div className="flex-1 min-h-0 overflow-auto p-6 space-y-6">
          {/* Summary KPIs — clickeables */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Promos" value={String(totalEntries)} icon={Table2} color="bg-blue-500" onClick={() => setKpiPopup("total")} />
            <KpiCard label="Promedio/Día" value={String(avgPerDay)} icon={TrendingUp} color="bg-violet-500" onClick={() => setKpiPopup("avg")} />
            <KpiCard label="Tasa de Éxito" value={`${successRate}%`} icon={Check} color="bg-emerald-500" onClick={() => setKpiPopup("exito")} />
            <KpiCard label="Hoy" value={String(rawEntries.filter((e: any) => isToday(new Date(e.date))).length)} icon={Clock} color="bg-amber-500" onClick={() => setKpiPopup("hoy")} />
          </div>

          {/* Charts row 1: Promos por Día + Promos por Hora */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Promos por Día (últimos 7 días)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={promosByDay} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="si" stackId="a" fill={COLORS.si} name="Sí" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="parcial" stackId="a" fill={COLORS.parcial} name="Parcial" />
                    <Bar dataKey="no" stackId="a" fill={COLORS.no} name="No" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Promos por Hora (Hoy)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={promosByHour}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} className="text-muted-foreground" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="count" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 3 }} name="Promos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2: Redes + Resultados */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Distribución por Red Social</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={networkDistribution} layout="vertical" barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="value" name="Promos" radius={[0, 4, 4, 0]}>
                      {networkDistribution.map((entry, i) => (
                        <Cell key={i} fill={NETWORK_COLORS[entry.name] || COLORS.muted} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Distribución por Resultado</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={resultDistribution} layout="vertical" barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="value" name="Promos" radius={[0, 4, 4, 0]}>
                      {resultDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <ViewPromologEntryModal
        open={!!viewingEntry}
        onOpenChange={(o) => !o && setViewingEntry(null)}
        entry={viewingEntry}
      />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Promos — ${totalEntries}`;
            case "si": return `Promos con Sí — ${siCount}`;
            case "parcial": return `Promos Parciales — ${parcialCount}`;
            case "no": return `Promos con No — ${noCount}`;
            case "exito": return `Tasa de Éxito — ${successRate}%`;
            case "avg": return `Promedio por día — ${avgPerDay}`;
            case "hoy": return `Promos de Hoy`;
            default: return "";
          }
        })()}
        subtitle={kpiPopup === "exito" ? `${siCount} de ${totalEntries} con resultado Sí` : undefined}
        rows={(() => {
          if (!kpiPopup) return [];
          let list: any[] = rawEntries;
          if (kpiPopup === "si") list = rawEntries.filter((e: any) => e.result === "Sí");
          else if (kpiPopup === "parcial") list = rawEntries.filter((e: any) => e.result === "Parcial");
          else if (kpiPopup === "no") list = rawEntries.filter((e: any) => e.result === "No");
          else if (kpiPopup === "hoy") list = rawEntries.filter((e: any) => isToday(new Date(e.date)));
          else if (kpiPopup === "exito" || kpiPopup === "avg") {
            return [
              { primary: "Total entradas", right: String(totalEntries) },
              { primary: "Resultados Sí", right: String(siCount), rightTone: "success" as const },
              { primary: "Resultados Parcial", right: String(parcialCount), rightTone: "warning" as const },
              { primary: "Resultados No", right: String(noCount), rightTone: "destructive" as const },
              { primary: "Promedio por día", right: String(avgPerDay) },
              { primary: "Tasa de éxito", right: `${successRate}%`, rightTone: Number(successRate) >= 50 ? "success" as const : "warning" as const },
            ];
          }
          const tone = (result: string): KpiRow["rightTone"] =>
            result === "Sí" ? "success" : result === "No" ? "destructive" : result === "Parcial" ? "warning" : "default";
          return list.slice(0, 100).map((e: any): KpiRow => ({
            primary: e.creator_name ?? e.creator_handle ?? "Sin creador",
            secondary: `${e.network ?? "—"} · ${e.date ? new Date(e.date).toLocaleDateString("es") : "—"}`,
            right: e.result ?? "—",
            rightTone: tone(e.result ?? ""),
          }));
        })()}
      />
    </main>
  );
};

export default PromologAgentDetailView;
