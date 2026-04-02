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
  BarChart3, MessageSquare, Repeat, Heart, Eye, AlertTriangle, Target, Crown, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import {
  PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useUserRole } from "@/hooks/useUserRole";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const { isAdmin } = useUserRole();
  const { data: allRows = [], isLoading } = useEarningsData();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchText, setSearchText] = useState("");
  const [showZeros, setShowZeros] = useState(false);
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [showPareto, setShowPareto] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertTab, setAlertTab] = useState<"zero" | "drop" | "fanLoss" | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const [paretoView, setParetoView] = useState<"list" | "chart">("list");
  const [paretoGroup, setParetoGroup] = useState<"80" | "20">("80");
  const PIE_COLORS = ["hsl(221,83%,53%)","hsl(142,71%,45%)","hsl(25,95%,53%)","hsl(280,67%,55%)","hsl(350,80%,55%)","hsl(190,80%,45%)","hsl(45,93%,47%)","hsl(160,60%,45%)","hsl(320,70%,50%)","hsl(200,70%,50%)","hsl(100,60%,45%)","hsl(0,70%,55%)","hsl(260,50%,55%)","hsl(30,80%,50%)","hsl(170,70%,40%)","hsl(220,50%,60%)","hsl(60,70%,50%)","hsl(310,60%,55%)","hsl(140,50%,50%)","hsl(10,70%,50%)"];

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

  // High-level KPIs
  const hlKpis = useMemo(() => {
    const active = rawCreators.filter((c) => c.total > 0);
    const totalBruto = active.reduce((s, c) => s + c.total, 0);
    const totalTips = active.reduce((s, c) => s + c.tips, 0);
    const totalMsgs = active.reduce((s, c) => s + c.messages, 0);
    const totalSubs = active.reduce((s, c) => s + c.subs, 0);
    const totalNewSubs = active.reduce((s, c) => s + c.newSubs, 0);
    const totalRecurring = active.reduce((s, c) => s + c.recurringSubs, 0);
    const totalFansAll = active.reduce((s, c) => s + c.activeFans, 0);
    const renewalRate = totalSubs > 0 ? (totalRecurring / totalSubs) * 100 : 0;
    const tipsPct = totalBruto > 0 ? (totalTips / totalBruto) * 100 : 0;
    const msgsPct = totalBruto > 0 ? (totalMsgs / totalBruto) * 100 : 0;
    const subsPct = totalBruto > 0 ? (totalSubs / totalBruto) * 100 : 0;
    const avgPerFanGlobal = totalFansAll > 0 ? totalBruto / totalFansAll : 0;
    // CEO metrics
    const avgPerCreator = active.length > 0 ? totalBruto / active.length : 0;
    const topCreator = active.length > 0 ? active.reduce((best, c) => c.total > best.total ? c : best, active[0]) : null;
    const zeroCreators = rawCreators.filter((c) => c.total === 0).length;
    const creatorsUnder1k = active.filter((c) => c.total < 1000).length;
    const creatorsOver10k = active.filter((c) => c.total >= 10000).length;
    return { renewalRate, tipsPct, msgsPct, subsPct, avgPerFanGlobal, totalNewSubs, totalRecurring, totalTips, totalMsgs, totalSubs, totalBruto, avgPerCreator, topCreator, zeroCreators, creatorsUnder1k, creatorsOver10k, activeCount: active.length };
  }, [rawCreators]);

  // Pie chart data for pareto — switches between 80 and 20 group
  const pieData = useMemo(() => {
    if (paretoGroup === "80") {
      const items = paretoAnalysis.top.map((c) => ({ name: c.name, value: c.total }));
      const restTotal = paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue;
      if (restTotal > 0) items.push({ name: `Resto (${paretoAnalysis.rest.length})`, value: restTotal });
      return items;
    } else {
      return paretoAnalysis.rest.map((c) => ({ name: c.name, value: c.total }));
    }
  }, [paretoAnalysis, paretoGroup]);

  const pieGroupTotal = useMemo(() => {
    return pieData.reduce((s, d) => s + d.value, 0);
  }, [pieData]);

  // Previous month summaries for comparison
  const prevMonthMap = useMemo(() => {
    if (!selectedPeriod || monthOptions.length < 2) return new Map<string, number>();
    const currentIdx = monthOptions.findIndex((m) => m.value === selectedMonth);
    const prevPeriod = monthOptions[currentIdx + 1];
    if (!prevPeriod) return new Map<string, number>();

    const map = new Map<string, number>();
    for (const r of allRows) {
      const d = r.effective_date;
      if (d < prevPeriod.startStr || d > prevPeriod.endStr) continue;
      const key = r.creator_id || r.pending_creator || r.id;
      const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
      const normPlat = (info?.platform || "").toLowerCase();
      if (normPlat === "unlok" || normPlat === "instagram") continue;
      map.set(key, (map.get(key) || 0) + (r.total_earnings_gross ?? 0));
    }
    return map;
  }, [allRows, selectedMonth, selectedPeriod, monthOptions, creatorInfoMap]);

  const fmtInline = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Alerts / Red Flags
  const alerts = useMemo(() => {
    const items: { type: "drop" | "zero" | "fanLoss"; creator: CreatorSummary; detail: string }[] = [];
    for (const c of rawCreators) {
      const prev = prevMonthMap.get(c.creatorId);
      if (c.total === 0 && prev && prev > 0) {
        items.push({ type: "zero", creator: c, detail: `Vendía ${fmtInline(prev)} → ahora $0` });
      } else if (prev && prev > 0 && c.total > 0) {
        const change = ((c.total - prev) / prev) * 100;
        if (change <= -30) {
          items.push({ type: "drop", creator: c, detail: `Cayó ${Math.abs(change).toFixed(0)}% (${fmtInline(prev)} → ${fmtInline(c.total)})` });
        }
      }
      if (c.activeFans > 0 && c.newFans < 0) {
        items.push({ type: "fanLoss", creator: c, detail: `Perdiendo fans: ${c.newFans} netos` });
      }
    }
    return items.sort((a, b) => {
      const order = { zero: 0, drop: 1, fanLoss: 2 };
      return order[a.type] - order[b.type];
    });
  }, [rawCreators, prevMonthMap]);

  // Current month projection
  const projection = useMemo(() => {
    const now = new Date();
    const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    if (dayOfMonth <= 1) return [];

    const map = new Map<string, { name: string; ig: string | null; total: number; days: number; creatorId: string }>();
    for (const r of allRows) {
      const d = r.effective_date;
      if (d < currentMonthStart) continue;
      const key = r.creator_id || r.pending_creator || r.id;
      const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
      const normPlat = (info?.platform || "").toLowerCase();
      if (normPlat === "unlok" || normPlat === "instagram") continue;
      const ex = map.get(key);
      if (ex) {
        ex.total += r.total_earnings_gross ?? 0;
        ex.days++;
      } else {
        map.set(key, {
          name: r.artistic_name || r.pending_creator || "Sin nombre",
          ig: info?.ig || null,
          total: r.total_earnings_gross ?? 0,
          days: 1,
          creatorId: key,
        });
      }
    }
    return Array.from(map.values())
      .filter((c) => c.total > 0)
      .map((c) => ({
        ...c,
        projected: c.days > 0 ? (c.total / c.days) * daysInMonth : 0,
        dailyAvg: c.days > 0 ? c.total / c.days : 0,
      }))
      .sort((a, b) => b.projected - a.projected);
  }, [allRows, creatorInfoMap]);

  const projectionTotal = useMemo(() => projection.reduce((s, c) => s + c.projected, 0), [projection]);

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

  const exportPdf = () => {
    if (!selectedPeriod) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Ventas OnlyFans - ${selectedPeriod.label}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Periodo: ${selectedPeriod.startStr} a ${selectedPeriod.endStr} | Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 21);
    doc.setFontSize(10);
    const activeCount = creators.filter(c => c.total > 0).length;
    doc.text(`Total Bruto: ${fmt(grandTotal)}  |  Neto (80%): ${fmt(grandTotal * 0.8)}  |  Creadoras: ${activeCount}  |  Retencion: ${hlKpis.renewalRate.toFixed(1)}%`, 14, 28);
    const tHead = [["#", "Creadora", "Instagram", "Bruto", "Neto 80%", "Subs", "Nuevas", "Recur.", "Tips", "Msgs", "Fans", "New", "$/Dia", "$/Fan", "Dias", "Ultima"]];
    const tBody = creators.map((c, i) => [
      String(i + 1), c.name, c.instagramHandle ? "@" + c.instagramHandle.replace(/^@/, "") : "-",
      fmt(c.total), fmt(c.net), fmtShort(c.subs), fmtShort(c.newSubs), fmtShort(c.recurringSubs),
      fmtShort(c.tips), fmtShort(c.messages), String(c.activeFans), String(c.newFans),
      fmtShort(c.avgPerDay), fmtShort(c.avgPerFan), String(c.daysWithData),
      format(new Date(c.lastDate + "T12:00:00"), "dd MMM", { locale: es }),
    ]);
    autoTable(doc, { startY: 33, head: tHead, body: tBody, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 }, alternateRowStyles: { fillColor: [245, 245, 250] }, margin: { left: 8, right: 8 } });
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Analisis 80/20 (Pareto)", 14, 15);
    doc.setFontSize(9);
    const topPct = paretoAnalysis.totalRevenue > 0 ? ((paretoAnalysis.topRevenue / paretoAnalysis.totalRevenue) * 100).toFixed(1) : "0";
    doc.text(`Top ${paretoAnalysis.topCount} = ${fmt(paretoAnalysis.topRevenue)} (${topPct}%)  |  Resto ${paretoAnalysis.rest.length} = ${fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}`, 14, 22);
    const pH = [["#", "Creadora", "Instagram", "Bruto", "% Top", "% Total"]];
    const pB = paretoAnalysis.top.map((c, i) => [
      String(i + 1), c.name, c.instagramHandle ? "@" + c.instagramHandle.replace(/^@/, "") : "-",
      fmt(c.total),
      (paretoAnalysis.topRevenue > 0 ? (c.total / paretoAnalysis.topRevenue * 100).toFixed(1) : "0") + "%",
      (paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue * 100).toFixed(1) : "0") + "%",
    ]);
    autoTable(doc, { startY: 27, head: pH, body: pB, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 64, 175], textColor: 255 }, alternateRowStyles: { fillColor: [245, 245, 250] }, margin: { left: 14, right: 14 } });
    doc.save(`Ventas_OnlyFans_${selectedPeriod.value}.pdf`);
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
        {(() => {
          const prev = prevMonthMap.get(c.creatorId);
          if (!prev || prev === 0) return <TableCell className="text-right tabular-nums text-xs text-muted-foreground">—</TableCell>;
          const change = ((c.total - prev) / prev) * 100;
          const color = change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < -10 ? "text-destructive" : "text-muted-foreground";
          return (
            <TableCell className={`text-right tabular-nums text-xs font-medium ${color}`}>
              {change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(0)}%
            </TableCell>
          );
        })()}
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
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMetrics(true)}
                  className="gap-1.5"
                >
                  <BarChart3 className="h-4 w-4" />
                  Métricas
                </Button>
                <Button
                  variant={showPareto ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPareto(true)}
                  className="gap-1.5"
                >
                  <PieChart className="h-4 w-4" />
                  80/20
                </Button>
                <Button
                  variant={showAlerts ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAlerts(!showAlerts)}
                  className="gap-1.5"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Alertas {alerts.length > 0 && <Badge variant="destructive" className="ml-0.5 h-5 px-1.5 text-[10px]">{alerts.length}</Badge>}
                </Button>
                <Button
                  variant={showProjection ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowProjection(!showProjection)}
                  className="gap-1.5"
                >
                  <Target className="h-4 w-4" />
                  Proyección
                </Button>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={exportPdf} className="gap-1.5" disabled={isLoading || creators.length === 0}>
                    <DollarSign className="h-4 w-4" />
                    PDF
                  </Button>
                )}
              </div>
            </div>

            {/* ── Metrics Dialog ── */}
            <Dialog open={showMetrics} onOpenChange={setShowMetrics}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
                <div className="p-6 pb-0">
                  <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Métricas — {selectedPeriod?.label}
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-8">
                  {/* Revenue Split — visual bars */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">Distribución de Revenue</h3>
                    <div className="space-y-4">
                      {[
                        { icon: <MessageSquare className="h-4 w-4" />, pct: hlKpis.msgsPct, label: "Mensajería", amount: hlKpis.totalMsgs, color: "bg-blue-500" },
                        { icon: <Heart className="h-4 w-4" />, pct: hlKpis.tipsPct, label: "Tips", amount: hlKpis.totalTips, color: "bg-rose-500" },
                        { icon: <Eye className="h-4 w-4" />, pct: hlKpis.subsPct, label: "Suscripciones", amount: hlKpis.totalSubs, color: "bg-emerald-500" },
                      ].map((item, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">{item.icon} {item.label}</div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold tabular-nums">{fmt(item.amount)}</span>
                              <span className="text-xs font-bold tabular-nums text-muted-foreground w-14 text-right">{item.pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${item.color} transition-all duration-500`} style={{ width: `${Math.min(item.pct, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  {/* Retención & Fans */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">Retención & Fans</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { icon: <Repeat className="h-4 w-4" />, value: `${hlKpis.renewalRate.toFixed(1)}%`, label: "Retención", sub: "tasa de renovación" },
                        { icon: <DollarSign className="h-4 w-4" />, value: fmt(hlKpis.avgPerFanGlobal), label: "$/Fan", sub: "promedio por fan" },
                        { icon: <Users className="h-4 w-4" />, value: hlKpis.totalNewSubs.toLocaleString(), label: "Nuevas Subs", sub: "este período" },
                        { icon: <Repeat className="h-4 w-4" />, value: hlKpis.totalRecurring.toLocaleString(), label: "Recurrentes", sub: "renovaciones" },
                      ].map((item, idx) => (
                        <div key={idx} className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-2 text-center">
                          <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary mx-auto">
                            {item.icon}
                          </div>
                          <p className="text-2xl font-bold tabular-nums">{item.value}</p>
                          <p className="text-xs font-medium text-foreground">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CEO Insights */}
                  {isAdmin && (
                    <>
                      <div className="h-px bg-border" />
                      <div>
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">CEO Insights</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/20 text-primary mx-auto">
                              <Crown className="h-4 w-4" />
                            </div>
                            <p className="text-sm font-bold truncate">{hlKpis.topCreator?.name || "—"}</p>
                            <p className="text-xl font-bold tabular-nums text-primary">{hlKpis.topCreator ? fmt(hlKpis.topCreator.total) : "$0"}</p>
                            <p className="text-[10px] text-muted-foreground">top creadora</p>
                          </div>
                          <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted text-muted-foreground mx-auto">
                              <Target className="h-4 w-4" />
                            </div>
                            <p className="text-xl font-bold tabular-nums">{fmt(hlKpis.avgPerCreator)}</p>
                            <p className="text-xs font-medium text-foreground">Promedio</p>
                            <p className="text-[10px] text-muted-foreground">{hlKpis.activeCount} activas</p>
                          </div>
                          <div className="rounded-xl border border-destructive/30 bg-gradient-to-b from-destructive/10 to-destructive/5 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-destructive/20 text-destructive mx-auto">
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <p className="text-2xl font-bold tabular-nums">{hlKpis.zeroCreators}</p>
                            <p className="text-xs font-medium text-foreground">Inactivas</p>
                            <p className="text-[10px] text-muted-foreground">$0 en ventas</p>
                          </div>
                          <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted text-muted-foreground mx-auto">
                              <TrendingUp className="h-4 w-4" />
                            </div>
                            <p className="text-sm font-bold tabular-nums">
                              {hlKpis.creatorsOver10k} <span className="text-muted-foreground font-normal">{'>'} $10k</span>
                            </p>
                            <p className="text-sm font-bold tabular-nums">
                              {hlKpis.creatorsUnder1k} <span className="text-muted-foreground font-normal">{'<'} $1k</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">distribución</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* ── Pareto Dialog ── */}
            <Dialog open={showPareto} onOpenChange={setShowPareto}>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
                <div className="p-6 pb-0">
                  <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-primary" />
                      Análisis 80/20 — {selectedPeriod?.label}
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-6">
                  {/* Summary cards + view toggle */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="grid grid-cols-3 gap-3 flex-1 min-w-0">
                      <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 text-center space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top (80%)</p>
                        <p className="text-3xl font-bold text-primary tabular-nums">{paretoAnalysis.topCount}</p>
                        <p className="text-xs text-muted-foreground">de {paretoAnalysis.totalCount}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 text-center space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue Top</p>
                        <p className="text-2xl font-bold tabular-nums">{fmt(paretoAnalysis.topRevenue)}</p>
                        <p className="text-xs text-muted-foreground">bruto</p>
                      </div>
                      <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 text-center space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resto</p>
                        <p className="text-2xl font-bold tabular-nums text-muted-foreground">{fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}</p>
                        <p className="text-xs text-muted-foreground">{paretoAnalysis.rest.length} creadoras</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                      <Button variant={paretoView === "list" ? "default" : "ghost"} size="sm" className="h-8 px-3 text-xs rounded-md" onClick={() => setParetoView("list")}>
                        <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Lista
                      </Button>
                      <Button variant={paretoView === "chart" ? "default" : "ghost"} size="sm" className="h-8 px-3 text-xs rounded-md" onClick={() => setParetoView("chart")}>
                        <PieChart className="h-3.5 w-3.5 mr-1.5" /> Gráfica
                      </Button>
                    </div>
                  </div>

                  {/* CHART VIEW — clean donut + sidebar legend */}
                  {paretoView === "chart" && (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-border">
                        <div className="lg:col-span-3 p-6 flex items-center justify-center" style={{ minHeight: 400 }}>
                          <ResponsiveContainer width="100%" height={400}>
                            <RechartsPie>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                outerRadius="85%"
                                innerRadius="50%"
                                dataKey="value"
                                nameKey="name"
                                paddingAngle={1}
                                label={false}
                              >
                                {pieData.map((_, idx) => (
                                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="hsl(var(--background))" strokeWidth={2} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => fmt(value)}
                                contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                              />
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        <div className="lg:col-span-2 p-4 overflow-y-auto" style={{ maxHeight: 420 }}>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Desglose</p>
                          <div className="space-y-2">
                            {pieData.map((d, idx) => {
                              const pct = paretoAnalysis.totalRevenue > 0 ? (d.value / paretoAnalysis.totalRevenue) * 100 : 0;
                              return (
                                <div key={idx} className="flex items-center gap-2.5 py-1 border-b border-border/50 last:border-0">
                                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                  <span className="text-sm truncate flex-1 min-w-0">{d.name}</span>
                                  <span className="text-xs font-semibold tabular-nums shrink-0">{fmt(d.value)}</span>
                                  <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-11 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-border bg-muted/30 px-6 py-2.5">
                        <p className="text-[10px] text-muted-foreground text-center">
                          Montos <strong>BRUTOS</strong> · "Resto" agrupa {paretoAnalysis.rest.length} creadoras (~20% del revenue)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* LIST VIEW */}
                  {paretoView === "list" && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-widest">🔥 Top {paretoAnalysis.topCount} — BRUTO</p>
                        <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                          {paretoAnalysis.top.map((c, i) => {
                            const pctOfTop = paretoAnalysis.topRevenue > 0 ? (c.total / paretoAnalysis.topRevenue) * 100 : 0;
                            const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                            return (
                              <div key={c.creatorId} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted/50 transition-colors">
                                <span className="text-xs font-bold text-primary w-5 shrink-0 tabular-nums">{i + 1}</span>
                                {c.instagramHandle && (
                                  <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0">
                                    <Instagram className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                  {c.name}
                                </button>
                                <div className="flex-1 mx-2">
                                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pctOfTop, 100)}%` }} />
                                  </div>
                                </div>
                                <span className="text-sm font-bold tabular-nums w-[60px] text-right text-primary">{pctOfTop.toFixed(1)}%</span>
                                <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">({pctOfTotal.toFixed(1)}%)</span>
                                <span className="text-sm font-semibold tabular-nums w-[100px] text-right">{fmt(c.total)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="h-px bg-border" />
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-widest">📉 Resto ({paretoAnalysis.rest.length})</p>
                        {paretoAnalysis.rest.length > 0 ? (
                          <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                            {paretoAnalysis.rest.map((c, i) => {
                              const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                              return (
                                <div key={c.creatorId} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 hover:bg-muted/40 transition-colors">
                                  <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{paretoAnalysis.topCount + i + 1}</span>
                                  {c.instagramHandle && (
                                    <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0">
                                      <Instagram className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <button className="text-sm text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                    {c.name}
                                  </button>
                                  <div className="flex-1 mx-2">
                                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-muted-foreground/40 transition-all" style={{ width: `${Math.min(pctOfTotal * 5, 100)}%` }} />
                                    </div>
                                  </div>
                                  <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">{pctOfTotal.toFixed(1)}%</span>
                                  <span className="text-sm tabular-nums text-muted-foreground w-[100px] text-right">{fmt(c.total)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-sm text-muted-foreground">Ninguna.</p>}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Alerts Panel */}
            {showAlerts && !isLoading && (() => {
              const zeros = alerts.filter((a) => a.type === "zero");
              const drops = alerts.filter((a) => a.type === "drop");
              const fanLoss = alerts.filter((a) => a.type === "fanLoss");

              const sections = [
                { key: "zero" as const, emoji: "🔴", label: "Inactivas ($0)", desc: "Vendían el mes pasado, ahora $0", items: zeros, border: "border-destructive/40", bg: "bg-destructive/10", text: "text-destructive" },
                { key: "drop" as const, emoji: "🟠", label: "Caída > 30%", desc: "Revenue cayó más del 30%", items: drops, border: "border-orange-400/40", bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
                { key: "fanLoss" as const, emoji: "🟡", label: "Perdiendo Fans", desc: "Fans netos negativos", items: fanLoss, border: "border-yellow-400/40", bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400" },
              ];

              const activeSection = sections.find((s) => s.key === alertTab);
              const activeItems = activeSection?.items || [];

              return (
                <div className="space-y-3">
                  {/* Summary cards — click to expand */}
                  <div className="grid grid-cols-3 gap-3">
                    {sections.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setAlertTab(alertTab === s.key ? null : s.key)}
                        className={`rounded-lg border-2 p-4 text-left transition-all ${
                          alertTab === s.key ? `${s.border} ${s.bg} ring-2 ring-offset-1 ring-offset-background ring-primary/20` : "border-border bg-card hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-lg">{s.emoji}</span>
                          <span className={`text-2xl font-bold tabular-nums ${s.items.length > 0 ? s.text : "text-muted-foreground"}`}>{s.items.length}</span>
                        </div>
                        <p className={`text-sm font-semibold ${s.items.length > 0 ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Expanded detail list */}
                  {alertTab && activeSection && (
                    <div className={`rounded-lg border-2 ${activeSection.border} ${activeSection.bg} p-4 space-y-2`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{activeSection.emoji}</span>
                        <h3 className={`text-sm font-bold ${activeSection.text}`}>{activeSection.label}</h3>
                        <span className="text-xs text-muted-foreground">— {activeItems.length} creadora{activeItems.length !== 1 ? "s" : ""}</span>
                      </div>
                      {activeItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">Sin alertas en esta categoría ✓</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                          {activeItems.map((a, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2.5">
                              <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}</span>
                              {a.creator.instagramHandle && (
                                <a href={`https://instagram.com/${a.creator.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0">
                                  <Instagram className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[110px]" onClick={() => navigate(`/creadores/${a.creator.creatorId}`)}>
                                {a.creator.name}
                              </button>
                              <span className="text-sm text-muted-foreground flex-1">{a.detail}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Projection Panel */}
            {showProjection && !isLoading && (
              <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-accent-foreground" />
                    <h2 className="text-lg font-bold text-foreground">
                      Proyección {format(new Date(), "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase())}
                    </h2>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Proyección total bruto</p>
                    <p className="text-xl font-bold tabular-nums">{fmt(projectionTotal)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Basado en {new Date().getDate() - 1} días transcurridos. Fórmula: (acumulado / días con data) × días del mes.
                </p>
                {projection.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos del mes actual.</p>
                ) : (
                  <div className="rounded-lg border border-border bg-card overflow-auto max-h-[350px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Creadora</TableHead>
                          <TableHead className="text-right">Acumulado</TableHead>
                          <TableHead className="text-right">$/Día</TableHead>
                          <TableHead className="text-right">Días</TableHead>
                          <TableHead className="text-right font-semibold">Proyectado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projection.map((c, i) => (
                          <TableRow key={c.creatorId}>
                            <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {c.ig && (
                                  <a href={`https://instagram.com/${c.ig.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0">
                                    <Instagram className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                  {c.name}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmt(c.total)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmt(c.dailyAvg)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.days}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(c.projected)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
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
                      <TableHead className="text-right whitespace-nowrap text-xs">vs Ant.</TableHead>
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
                        <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
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
