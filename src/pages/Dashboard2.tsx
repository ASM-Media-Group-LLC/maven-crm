import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subMonths, format } from "date-fns";
import { es } from "date-fns/locale";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { supabase } from "@/integrations/supabase/client";
import { useEarningsData } from "./sales-performance/useEarningsData";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Info, TrendingUp, Users, DollarSign, Calendar,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Instagram, PieChart,
  BarChart3, MessageSquare, Repeat, Heart, Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface CreatorSummary {
  creatorId: string;
  name: string;
  instagramHandle: string | null;
  platform: string;
  total: number;
  net: number;
  subs: number;
  newSubs: number;
  recurringSubs: number;
  tips: number;
  messages: number;
  activeFans: number;
  newFans: number;
  daysWithData: number;
  lastDate: string;
  avgPerDay: number;
  avgPerFan: number;
}

type SortKey = "name" | "total" | "net" | "subs" | "newSubs" | "recurringSubs" | "tips" | "messages" | "activeFans" | "newFans" | "daysWithData" | "lastDate" | "avgPerDay" | "avgPerFan";
type SortDir = "asc" | "desc";

// Generate month options from data range
const getMonthOptions = () => {
  const months: { value: string; label: string; startStr: string; endStr: string }[] = [];
  const now = new Date();
  // Go back up to 4 months
  for (let i = 1; i <= 4; i++) {
    const m = subMonths(now, i);
    const y = m.getFullYear();
    const mo = m.getMonth();
    const startStr = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const endStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = format(m, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase());
    months.push({ value: `${y}-${String(mo + 1).padStart(2, "0")}`, label, startStr, endStr });
  }
  return months;
};

const Dashboard2 = () => {
  const navigate = useNavigate();
  const { data: allRows = [], isLoading } = useEarningsData();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchText, setSearchText] = useState("");
  const [showZeros, setShowZeros] = useState(false);
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [showPareto, setShowPareto] = useState(false);

  const monthOptions = useMemo(getMonthOptions, []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value || "");

  const selectedPeriod = useMemo(() => {
    return monthOptions.find((m) => m.value === selectedMonth) || monthOptions[0];
  }, [selectedMonth, monthOptions]);

  const { data: creatorInfoMap = {} } = useQuery({
    queryKey: ["creator-info-dashboard2"],
    queryFn: async () => {
      const [{ data: biz }, { data: crs }] = await Promise.all([
        supabase.from("creator_business").select("creator_id, main_platform"),
        supabase.from("creators").select("id, instagram_handle"),
      ]);
      const map: Record<string, { platform: string; ig: string | null }> = {};
      for (const r of biz ?? []) {
        if (r.creator_id) map[r.creator_id] = { platform: r.main_platform || "", ig: null };
      }
      for (const c of crs ?? []) {
        if (map[c.id]) {
          map[c.id].ig = c.instagram_handle || null;
        } else {
          map[c.id] = { platform: "", ig: c.instagram_handle || null };
        }
      }
      return map;
    },
  });

  // Build creator summaries — OnlyFans only
  const rawCreators = useMemo(() => {
    if (!selectedPeriod) return [];
    const map = new Map<string, CreatorSummary>();

    for (const r of allRows) {
      const d = r.effective_date;
      if (d < selectedPeriod.startStr || d > selectedPeriod.endStr) continue;

      const key = r.creator_id || r.pending_creator || r.id;

      const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
      const plat = info?.platform || null;
      const normPlat = (plat || "").toLowerCase();
      if (normPlat === "unlok" || normPlat === "instagram") continue;

      const existing = map.get(key);

      if (existing) {
        existing.total += r.total_earnings_gross ?? 0;
        existing.net += (r.total_earnings_gross ?? 0) * 0.8;
        existing.subs += r.subscription_gross ?? 0;
        existing.newSubs += r.new_subscriptions_sub_gross ?? 0;
        existing.recurringSubs += r.recurring_sub_gross ?? 0;
        existing.tips += r.tips_gross ?? 0;
        existing.messages += r.message_gross ?? 0;
        existing.activeFans = Math.max(existing.activeFans, r.active_fans ?? 0);
        existing.newFans += r.new_fans ?? 0;
        existing.daysWithData++;
        if (d > existing.lastDate) existing.lastDate = d;
      } else {
        map.set(key, {
          creatorId: key,
          name: r.artistic_name || r.pending_creator || "Sin nombre",
          instagramHandle: info?.ig || null,
          platform: plat || "OnlyFans",
          total: r.total_earnings_gross ?? 0,
          net: (r.total_earnings_gross ?? 0) * 0.8,
          subs: r.subscription_gross ?? 0,
          newSubs: r.new_subscriptions_sub_gross ?? 0,
          recurringSubs: r.recurring_sub_gross ?? 0,
          tips: r.tips_gross ?? 0,
          messages: r.message_gross ?? 0,
          activeFans: r.active_fans ?? 0,
          newFans: r.new_fans ?? 0,
          daysWithData: 1,
          lastDate: d,
          avgPerDay: 0,
          avgPerFan: 0,
        });
      }
    }

    for (const c of map.values()) {
      c.avgPerDay = c.daysWithData > 0 ? c.total / c.daysWithData : 0;
      c.avgPerFan = c.activeFans > 0 ? c.total / c.activeFans : 0;
    }

    return Array.from(map.values());
  }, [allRows, selectedPeriod, creatorInfoMap]);

  // Pareto (80/20) analysis
  const paretoAnalysis = useMemo(() => {
    const sorted = [...rawCreators].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const total = sorted.reduce((s, c) => s + c.total, 0);
    if (total === 0) return { top: [], rest: [], topPercent: 0, topRevenue: 0, totalRevenue: 0, topCount: 0, totalCount: sorted.length };

    let cumulative = 0;
    let cutoff = 0;
    for (let i = 0; i < sorted.length; i++) {
      cumulative += sorted[i].total;
      if (cumulative >= total * 0.8) {
        cutoff = i + 1;
        break;
      }
    }
    if (cutoff === 0) cutoff = sorted.length;

    const top = sorted.slice(0, cutoff);
    const rest = sorted.slice(cutoff);
    const topRevenue = top.reduce((s, c) => s + c.total, 0);

    return {
      top,
      rest,
      topPercent: sorted.length > 0 ? (cutoff / sorted.length) * 100 : 0,
      topRevenue,
      totalRevenue: total,
      topCount: cutoff,
      totalCount: sorted.length,
    };
  }, [rawCreators]);

  // Apply filters
  const filteredCreators = useMemo(() => {
    let list = rawCreators;
    if (!showZeros) list = list.filter((c) => c.total > 0);
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    const minV = parseFloat(minTotal);
    if (!isNaN(minV)) list = list.filter((c) => c.total >= minV);
    const maxV = parseFloat(maxTotal);
    if (!isNaN(maxV)) list = list.filter((c) => c.total <= maxV);
    return list;
  }, [rawCreators, showZeros, searchText, minTotal, maxTotal]);

  // Sort
  const creators = useMemo(() => {
    const sorted = [...filteredCreators];
    sorted.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "lastDate": av = a.lastDate; bv = b.lastDate; break;
        default: av = a[sortKey]; bv = b[sortKey];
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredCreators, sortKey, sortDir]);

  const grandTotal = filteredCreators.reduce((s, c) => s + c.total, 0);
  const totalFans = filteredCreators.reduce((s, c) => s + c.activeFans, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 text-primary" />
      : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtShort = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n);

  const dataStoppedEarly = (lastDate: string) => {
    const day = parseInt(lastDate.split("-")[2], 10);
    return day < 20;
  };

  const SortableHead = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        {label} <SortIcon col={col} />
      </span>
    </TableHead>
  );

  const CreatorRow = ({ c, i }: { c: CreatorSummary; i: number }) => {
    const stopped = dataStoppedEarly(c.lastDate);
    const isZero = c.total === 0;
    const isTop = paretoAnalysis.top.some((t) => t.creatorId === c.creatorId);
    return (
      <TableRow key={c.creatorId} className={`${isZero ? "opacity-50" : ""} ${showPareto && isTop ? "bg-primary/5" : ""}`}>
        <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {showPareto && isTop && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" title="Top 80/20" />
            )}
            {c.instagramHandle && (
              <a
                href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"
                title={`@${c.instagramHandle.replace(/^@/, "")}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Instagram className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left"
              onClick={() => navigate(`/creadores/${c.creatorId}`)}
            >
              {c.name}
            </button>
          </div>
        </TableCell>
        <TableCell className={`text-right tabular-nums font-semibold ${isZero ? "text-muted-foreground" : ""}`}>{fmt(c.total)}</TableCell>
        <TableCell className={`text-right tabular-nums font-semibold ${isZero ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(c.net)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.subs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.newSubs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.recurringSubs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.tips)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.messages)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.activeFans.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.newFans.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerDay)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerFan)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.daysWithData}</TableCell>
        <TableCell className={`text-sm tabular-nums whitespace-nowrap ${stopped ? "font-medium" : "text-muted-foreground"}`} style={stopped ? { color: "hsl(25, 95%, 53%)" } : undefined}>
          {format(new Date(c.lastDate + "T12:00:00"), "dd MMM", { locale: es })}
          {stopped && " ⚠"}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-5">
            {/* Header with month selector */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Ventas OnlyFans — {selectedPeriod?.label}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Período: {selectedPeriod?.startStr} → {selectedPeriod?.endStr} · Clic en encabezado para ordenar
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Seleccionar mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={showPareto ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPareto(!showPareto)}
                  className="gap-1.5"
                >
                  <PieChart className="h-4 w-4" />
                  80/20
                </Button>
              </div>
            </div>

            {/* Pareto Analysis Panel */}
            {showPareto && !isLoading && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Análisis 80/20 (Pareto)</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Top creadoras (generan el 80%)</p>
                    <p className="text-2xl font-bold text-primary tabular-nums">{paretoAnalysis.topCount}</p>
                    <p className="text-xs text-muted-foreground">
                      de {paretoAnalysis.totalCount} activas ({paretoAnalysis.topPercent.toFixed(1)}%)
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Ingresos del Top</p>
                    <p className="text-2xl font-bold tabular-nums">{fmt(paretoAnalysis.topRevenue)}</p>
                    <p className="text-xs text-muted-foreground">
                      {paretoAnalysis.totalRevenue > 0
                        ? `${((paretoAnalysis.topRevenue / paretoAnalysis.totalRevenue) * 100).toFixed(1)}% del total`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                    <p className="text-xs text-muted-foreground">Resto de creadoras</p>
                    <p className="text-2xl font-bold tabular-nums text-muted-foreground">
                      {fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {paretoAnalysis.rest.length} creadoras generan el {paretoAnalysis.totalRevenue > 0
                        ? (100 - (paretoAnalysis.topRevenue / paretoAnalysis.totalRevenue) * 100).toFixed(1)
                        : "0"}% restante
                    </p>
                  </div>
                </div>
                {/* TOP 80% — detailed breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                    🔥 Top {paretoAnalysis.topCount} creadoras (generan el 80%) — Montos BRUTOS · Desglose interno
                  </p>
                  <div className="space-y-1.5">
                    {paretoAnalysis.top.map((c, i) => {
                      const pctOfTop = paretoAnalysis.topRevenue > 0 ? (c.total / paretoAnalysis.topRevenue) * 100 : 0;
                      const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                      return (
                        <div key={c.creatorId} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                          <span className="text-xs font-bold text-primary w-5 shrink-0 tabular-nums">{i + 1}</span>
                          {c.instagramHandle && (
                            <a
                              href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"
                              title={`@${c.instagramHandle.replace(/^@/, "")}`}
                            >
                              <Instagram className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]"
                            onClick={() => navigate(`/creadores/${c.creatorId}`)}
                          >
                            {c.name}
                          </button>
                          <div className="flex-1 mx-2">
                            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(pctOfTop, 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold tabular-nums w-[60px] text-right text-primary">{pctOfTop.toFixed(1)}%</span>
                          <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">({pctOfTotal.toFixed(1)}% tot)</span>
                          <span className="text-sm font-semibold tabular-nums w-[100px] text-right">{fmt(c.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Todos los montos son <strong>BRUTOS</strong> (antes del 20% de OF). Los % de barra son relativos al grupo Top ({fmt(paretoAnalysis.topRevenue)}). El "% tot" es sobre el total general ({fmt(paretoAnalysis.totalRevenue)}).
                  </p>
                </div>

                {/* BOTTOM 20% */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                    📉 Resto ({paretoAnalysis.rest.length} creadoras) — generan el {paretoAnalysis.totalRevenue > 0 ? (100 - (paretoAnalysis.topRevenue / paretoAnalysis.totalRevenue) * 100).toFixed(1) : "0"}% · BRUTO
                  </p>
                  {paretoAnalysis.rest.length > 0 ? (
                    <div className="space-y-1">
                      {paretoAnalysis.rest.map((c, i) => {
                        const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                        return (
                          <div key={c.creatorId} className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5">
                            <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{paretoAnalysis.topCount + i + 1}</span>
                            {c.instagramHandle && (
                              <a
                                href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"
                                title={`@${c.instagramHandle.replace(/^@/, "")}`}
                              >
                                <Instagram className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              className="text-sm text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]"
                              onClick={() => navigate(`/creadores/${c.creatorId}`)}
                            >
                              {c.name}
                            </button>
                            <div className="flex-1 mx-2">
                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-muted-foreground/40 transition-all"
                                  style={{ width: `${Math.min(pctOfTotal * 5, 100)}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">{pctOfTotal.toFixed(1)}%</span>
                            <span className="text-sm tabular-nums text-muted-foreground w-[100px] text-right">{fmt(c.total)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay creadoras en este grupo.</p>
                  )}
                </div>
              </div>
            )}

            {/* KPI Cards */}
            {!isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" /> Total Bruto
                  </div>
                  <p className="text-xl font-bold tabular-nums">{fmt(grandTotal)}</p>
                  <p className="text-[10px] text-muted-foreground">Neto (80%): {fmt(grandTotal * 0.8)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Creadoras
                  </div>
                  <p className="text-xl font-bold tabular-nums">{filteredCreators.length}</p>
                  <p className="text-[10px] text-muted-foreground">{totalFans.toLocaleString()} fans activos</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Promedio / Creadora
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {filteredCreators.length > 0 ? fmt(grandTotal / filteredCreators.length) : "$0"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Período
                  </div>
                  <p className="text-sm font-bold tabular-nums">{selectedPeriod?.startStr}</p>
                  <p className="text-[10px] text-muted-foreground">→ {selectedPeriod?.endStr}</p>
                </div>
              </div>
            )}

            {/* Filters toolbar */}
            {!isLoading && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar creadora…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Mín $</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minTotal}
                    onChange={(e) => setMinTotal(e.target.value)}
                    className="h-8 w-20 text-sm tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Máx $</Label>
                  <Input
                    type="number"
                    placeholder="∞"
                    value={maxTotal}
                    onChange={(e) => setMaxTotal(e.target.value)}
                    className="h-8 w-20 text-sm tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Switch id="show-zeros" checked={showZeros} onCheckedChange={setShowZeros} />
                  <Label htmlFor="show-zeros" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                    Mostrar $0
                  </Label>
                </div>
              </div>
            )}

            {/* Info banner */}
            {!isLoading && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>Bruto</strong> = lo que reporta OF (100%). <strong>Neto</strong> = agencia recibe (80%).
                  Fuente: <code className="bg-muted px-1 rounded font-mono">of_gross_earnings</code>. Se excluyen Unlok e Instagram.
                  <span className="ml-1" style={{ color: "hsl(25, 95%, 53%)" }}>⚠ = data cortada antes del día 20.</span>
                </span>
              </div>
            )}

            {/* Table */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-420px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <SortableHead col="name" label="Creadora" />
                      <SortableHead col="total" label="Bruto" right />
                      <SortableHead col="net" label="Neto (80%)" right />
                      <SortableHead col="subs" label="Subs" right />
                      <SortableHead col="newSubs" label="Nuevas" right />
                      <SortableHead col="recurringSubs" label="Recurrentes" right />
                      <SortableHead col="tips" label="Tips" right />
                      <SortableHead col="messages" label="Msgs" right />
                      <SortableHead col="activeFans" label="Fans" right />
                      <SortableHead col="newFans" label="New Fans" right />
                      <SortableHead col="avgPerDay" label="$/Día" right />
                      <SortableHead col="avgPerFan" label="$/Fan" right />
                      <SortableHead col="daysWithData" label="Días" right />
                      <SortableHead col="lastDate" label="Última data" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creators.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center py-12 text-muted-foreground">
                          {rawCreators.length > 0
                            ? "No hay resultados con los filtros actuales"
                            : `Sin datos para ${selectedPeriod?.label}`}
                        </TableCell>
                      </TableRow>
                    ) : (
                      creators.map((c, i) => <CreatorRow key={c.creatorId} c={c} i={i} />)
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard2;
