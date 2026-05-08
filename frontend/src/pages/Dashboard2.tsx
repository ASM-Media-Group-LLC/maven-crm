import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subMonths, format } from "date-fns";
import { es } from "date-fns/locale";
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
  Info, TrendingUp, TrendingDown, Users, DollarSign, Calendar,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Instagram, PieChart,
  BarChart3, MessageSquare, Repeat, Heart, Eye, AlertTriangle, Target, Crown, X,
  Download, Zap, Activity, Lock, Brain, Layers, BarChart, Sparkles, UserCheck, ShieldAlert,
  Telescope, ArrowRight, ChevronRight, Scale, GitCompare, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import {
  PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useUserRole } from "@/hooks/useUserRole";
// jspdf + jspdf-autotable are loaded on demand inside exportPdf() so
// the (large) PDF chunk only enters the bundle when the user actually
// clicks export. Saves ~140 KB gzipped on the cold-load critical path.

// ─── Types ───────────────────────────────────────────────────────
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

const getMonthOptions = () => {
  const months: { value: string; label: string; startStr: string; endStr: string }[] = [];
  const now = new Date();
  for (let i = 0; i <= 4; i++) {
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

const PIE_COLORS = ["hsl(221,83%,53%)","hsl(142,71%,45%)","hsl(25,95%,53%)","hsl(280,67%,55%)","hsl(350,80%,55%)","hsl(190,80%,45%)","hsl(45,93%,47%)","hsl(160,60%,45%)","hsl(320,70%,50%)","hsl(200,70%,50%)","hsl(100,60%,45%)","hsl(0,70%,55%)","hsl(260,50%,55%)","hsl(30,80%,50%)","hsl(170,70%,40%)","hsl(220,50%,60%)","hsl(60,70%,50%)","hsl(310,60%,55%)","hsl(140,50%,50%)","hsl(10,70%,50%)"];

// ─── Component ───────────────────────────────────────────────────
const Dashboard2 = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { data: allRows = [], isLoading } = useEarningsData();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [ddSort, setDdSort] = useState<Record<string, { key: string; dir: "asc" | "desc" }>>({
    mom: { key: "delta", dir: "desc" },
    compare: { key: "total", dir: "desc" },
    scalability: { key: "total", dir: "desc" },
    channels: { key: "total", dir: "desc" },
  });
  const ddToggleSort = (tab: string, key: string) => {
    setDdSort(prev => {
      const cur = prev[tab] ?? { key: "total", dir: "desc" };
      if (cur.key === key) return { ...prev, [tab]: { key, dir: cur.dir === "desc" ? "asc" : "desc" } };
      return { ...prev, [tab]: { key, dir: "desc" } };
    });
  };
  const ddSortedList = <T extends Record<string, any>>(tab: string, list: T[]): T[] => {
    const s = ddSort[tab] ?? { key: "total", dir: "desc" };
    return [...list].sort((a, b) => {
      const av = a[s.key] ?? 0, bv = b[s.key] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return s.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return s.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  };
  const ddHead = (tab: string, key: string, label: string, align = "text-right") => (
    <TableHead
      className={`${align} cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => ddToggleSort(tab, key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}{ddSort[tab]?.key === key ? (ddSort[tab].dir === "desc" ? " ↓" : " ↑") : ""}
      </span>
    </TableHead>
  );
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
  const [showDeepDive, setShowDeepDive] = useState(false);

  // Subtabs del dashboard. "resumen" = vista por default (dashboard
  // completo). Los otros valores abren sus respectivos modals/panels y
  // cierran los demás. Reemplaza los botones tooltip-icon viejos para
  // matchear el patrón de Panel de Control (Reclutamiento modelos /
  // Reclutamiento chatters).
  type DashTab = "resumen" | "metrics" | "pareto" | "alerts" | "projection" | "deepdive";
  const [dashTab, setDashTab] = useState<DashTab>("resumen");
  const switchDashTab = (next: DashTab) => {
    setDashTab(next);
    setShowMetrics(next === "metrics");
    setShowPareto(next === "pareto");
    setShowAlerts(next === "alerts");
    setShowProjection(next === "projection");
    setShowDeepDive(next === "deepdive");
  };

  // Popup que muestra una lista de creadoras ordenada por una métrica
  // específica. Triggered por click en las KPI cards (Revenue Bruto,
  // Creadoras, etc). null = cerrado.
  type KpiList = "revenue" | "creators" | null;
  const [kpiListOpen, setKpiListOpen] = useState<KpiList>(null);
  const [deepDiveTab, setDeepDiveTab] = useState<"mom" | "compare" | "scalability" | "alerts" | "channels" | "opportunities" | "chatter" | "ltv" | "content_roi" | "cohort">("mom");

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

  // Pareto analysis
  const paretoAnalysis = useMemo(() => {
    const sorted = [...rawCreators].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const total = sorted.reduce((s, c) => s + c.total, 0);
    if (total === 0) return { top: [], rest: [], topPercent: 0, topRevenue: 0, totalRevenue: 0, topCount: 0, totalCount: sorted.length };
    let cumulative = 0;
    let cutoff = 0;
    for (let i = 0; i < sorted.length; i++) {
      cumulative += sorted[i].total;
      if (cumulative >= total * 0.8) { cutoff = i + 1; break; }
    }
    if (cutoff === 0) cutoff = sorted.length;
    const top = sorted.slice(0, cutoff);
    const rest = sorted.slice(cutoff);
    const topRevenue = top.reduce((s, c) => s + c.total, 0);
    return { top, rest, topPercent: sorted.length > 0 ? (cutoff / sorted.length) * 100 : 0, topRevenue, totalRevenue: total, topCount: cutoff, totalCount: sorted.length };
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
    const avgPerCreator = active.length > 0 ? totalBruto / active.length : 0;
    const topCreator = active.length > 0 ? active.reduce((best, c) => c.total > best.total ? c : best, active[0]) : null;
    const zeroCreators = rawCreators.filter((c) => c.total === 0).length;
    const creatorsUnder1k = active.filter((c) => c.total < 1000).length;
    const creatorsOver10k = active.filter((c) => c.total >= 10000).length;
    // Growth: creators growing vs falling
    const topCreatorImpact = topCreator && totalBruto > 0 ? (topCreator.total / totalBruto) * 100 : 0;
    return { renewalRate, tipsPct, msgsPct, subsPct, avgPerFanGlobal, totalNewSubs, totalRecurring, totalTips, totalMsgs, totalSubs, totalBruto, avgPerCreator, topCreator, zeroCreators, creatorsUnder1k, creatorsOver10k, activeCount: active.length, totalFansAll, topCreatorImpact };
  }, [rawCreators]);

  // Pie data
  const pieData = useMemo(() => {
    if (paretoGroup === "80") {
      const items = paretoAnalysis.top.map((c) => ({ name: c.name, value: c.total }));
      const restTotal = paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue;
      if (restTotal > 0) items.push({ name: `Resto (${paretoAnalysis.rest.length})`, value: restTotal });
      return items;
    }
    return paretoAnalysis.rest.map((c) => ({ name: c.name, value: c.total }));
  }, [paretoAnalysis, paretoGroup]);

  const pieGroupTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  // Previous month for comparison
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

  // Growth vs decline counts
  const growthStats = useMemo(() => {
    let growing = 0, declining = 0, stable = 0;
    for (const c of rawCreators) {
      const prev = prevMonthMap.get(c.creatorId);
      if (!prev || prev === 0) continue;
      const change = ((c.total - prev) / prev) * 100;
      if (change > 5) growing++;
      else if (change < -5) declining++;
      else stable++;
    }
    return { growing, declining, stable };
  }, [rawCreators, prevMonthMap]);

  // Previous month total for comparison
  const prevMonthTotal = useMemo(() => {
    let total = 0;
    for (const v of prevMonthMap.values()) total += v;
    return total;
  }, [prevMonthMap]);

  const totalChangePercent = prevMonthTotal > 0 ? ((hlKpis.totalBruto - prevMonthTotal) / prevMonthTotal) * 100 : 0;

  const fmtInline = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Alerts
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

  // Projection
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
      if (ex) { ex.total += r.total_earnings_gross ?? 0; ex.days++; }
      else { map.set(key, { name: r.artistic_name || r.pending_creator || "Sin nombre", ig: info?.ig || null, total: r.total_earnings_gross ?? 0, days: 1, creatorId: key }); }
    }
    return Array.from(map.values())
      .filter((c) => c.total > 0)
      .map((c) => ({ ...c, projected: c.days > 0 ? (c.total / c.days) * daysInMonth : 0, dailyAvg: c.days > 0 ? c.total / c.days : 0 }))
      .sort((a, b) => b.projected - a.projected);
  }, [allRows, creatorInfoMap]);

  const projectionTotal = useMemo(() => projection.reduce((s, c) => s + c.projected, 0), [projection]);

  // Filters
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
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtShort = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n);
  const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  const dataStoppedEarly = (lastDate: string) => {
    const day = parseInt(lastDate.split("-")[2], 10);
    return day < 20;
  };

  const exportPdf = async () => {
    if (!selectedPeriod) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
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
      <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>{label} <SortIcon col={col} /></span>
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
            {showPareto && isTop && <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" title="Top 80/20" />}
            {c.instagramHandle && (
              <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0" onClick={(e) => e.stopPropagation()}>
                <Instagram className="h-3.5 w-3.5" />
              </a>
            )}
            <button className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
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
          return <TableCell className={`text-right tabular-nums text-xs font-medium ${color}`}>{change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(0)}%</TableCell>;
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

  // ─── Render ────────────────────────────────────────────────────
  return (
          <main className="flex-1 overflow-auto">
            {/* ══════ COMPACT HEADER ══════ */}
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-bold text-foreground tracking-tight">
                    Ventas OF
                  </h1>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <TooltipProvider delayDuration={200}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[10px] text-muted-foreground cursor-help">
                          <Info className="h-3.5 w-3.5 inline" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        <strong>Bruto</strong> = lo que reporta OF (100%). <strong>Neto</strong> = agencia (80%).
                        Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">of_gross_earnings</code>. Excluye Unlok/IG.
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs px-3"
                      onClick={exportPdf}
                      disabled={isLoading || creators.length === 0}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Exportar PDF
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Subtabs — el dashboard principal sigue siempre visible
                  arriba; al pickear una tab distinta de "Resumen" se
                  abre el modal/panel correspondiente. Replica el patrón
                  de Panel de Control (Reclutamiento modelos / chatters). */}
              <Tabs value={dashTab} onValueChange={(v) => switchDashTab(v as DashTab)}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Métricas detalladas
                  </TabsTrigger>
                  <TabsTrigger value="pareto" className="gap-1.5">
                    <PieChart className="h-3.5 w-3.5" /> Análisis 80/20
                  </TabsTrigger>
                  <TabsTrigger value="alerts" className="gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Red Flags
                    {alerts.length > 0 && (
                      <span className="ml-1 px-1.5 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {alerts.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="projection" className="gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Proyección del mes
                  </TabsTrigger>
                  <TabsTrigger value="deepdive" className="gap-1.5">
                    <Telescope className="h-3.5 w-3.5" /> Más análisis
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* ══════ EXECUTIVE KPI STRIP ══════ */}
              {!isLoading && (
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Revenue Bruto — clickable */}
                  <button
                    type="button"
                    onClick={() => setKpiListOpen("revenue")}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
                  >
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-emerald-500 transition-opacity group-hover:opacity-50" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
                        <DollarSign className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Revenue Bruto</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{fmtK(grandTotal)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Net {fmtK(grandTotal * 0.8)}
                          {prevMonthTotal > 0 && (
                            <span className={`ml-1.5 font-semibold ${totalChangePercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {totalChangePercent >= 0 ? "↑" : "↓"}{Math.abs(totalChangePercent).toFixed(1)}%
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Creadoras — clickable */}
                  <button
                    type="button"
                    onClick={() => setKpiListOpen("creators")}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
                  >
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-blue-500 transition-opacity group-hover:opacity-50" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Creadoras</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.activeCount}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {hlKpis.zeroCreators} inactivas
                          {hlKpis.zeroCreators > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive/60 align-middle" />}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* ARPC — derived metric, no popup */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-violet-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">ARPC</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{fmtK(hlKpis.avgPerCreator)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Avg Revenue / Creator</p>
                      </div>
                    </div>
                  </div>

                  {/* $/Fan — derived metric */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-rose-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500">
                        <Heart className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">$/Fan</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">${hlKpis.avgPerFanGlobal.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{hlKpis.totalFansAll.toLocaleString()} fans</p>
                      </div>
                    </div>
                  </div>

                  {/* Retention — derived metric */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-cyan-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500">
                        <Repeat className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Retención</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.renewalRate.toFixed(1)}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Tasa de renovación</p>
                      </div>
                    </div>
                  </div>

                  {/* Revenue Mix — stacked bar, no popup */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-amber-500" />
                    <div className="relative space-y-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500">
                        <BarChart className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Revenue Mix</p>
                      <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${hlKpis.msgsPct}%` }} title={`Msgs ${hlKpis.msgsPct.toFixed(0)}%`} />
                        <div className="h-full bg-rose-500 transition-all" style={{ width: `${hlKpis.tipsPct}%` }} title={`Tips ${hlKpis.tipsPct.toFixed(0)}%`} />
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${hlKpis.subsPct}%` }} title={`Subs ${hlKpis.subsPct.toFixed(0)}%`} />
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />Msg {hlKpis.msgsPct.toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />Tip {hlKpis.tipsPct.toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />Sub {hlKpis.subsPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════ STRATEGIC INSIGHTS ══════ */}
              {!isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Revenue Concentration */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Crown className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Concentración de Revenue</p>
                        <p className="text-[10px] text-muted-foreground">Análisis Pareto</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold tabular-nums text-primary">{paretoAnalysis.topCount}</span>
                        <span className="text-xs text-muted-foreground">de {paretoAnalysis.totalCount} creadoras = 80% revenue</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${paretoAnalysis.topPercent}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Top {paretoAnalysis.topPercent.toFixed(0)}% genera {fmt(paretoAnalysis.topRevenue)}</span>
                      </div>
                    </div>
                    {hlKpis.topCreator && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border">
                        <Crown className="h-3 w-3 text-amber-500" />
                        <span className="text-[11px] font-medium truncate">{hlKpis.topCreator.name}</span>
                        <span className="text-[10px] text-primary font-bold ml-auto tabular-nums">{hlKpis.topCreatorImpact.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>

                  {/* Growth Velocity */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Activity className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Velocidad de Crecimiento</p>
                        <p className="text-[10px] text-muted-foreground">vs mes anterior</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-500/10 p-2">
                        <p className="text-lg font-bold tabular-nums text-emerald-500">{growthStats.growing}</p>
                        <p className="text-[9px] text-muted-foreground">Creciendo</p>
                      </div>
                      <div className="rounded-lg bg-muted p-2">
                        <p className="text-lg font-bold tabular-nums text-muted-foreground">{growthStats.stable}</p>
                        <p className="text-[9px] text-muted-foreground">Estable</p>
                      </div>
                      <div className="rounded-lg bg-destructive/10 p-2">
                        <p className="text-lg font-bold tabular-nums text-destructive">{growthStats.declining}</p>
                        <p className="text-[9px] text-muted-foreground">Cayendo</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <span className="text-[10px] text-muted-foreground">
                        {hlKpis.creatorsOver10k} creadoras &gt; $10k · {hlKpis.creatorsUnder1k} &lt; $1k
                      </span>
                    </div>
                  </div>

                  {/* Monetization Efficiency */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Eficiencia de Monetización</p>
                        <p className="text-[10px] text-muted-foreground">Revenue por canal</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: "Mensajería", value: hlKpis.totalMsgs, pct: hlKpis.msgsPct, color: "bg-blue-500" },
                        { label: "Tips", value: hlKpis.totalTips, pct: hlKpis.tipsPct, color: "bg-rose-500" },
                        { label: "Suscripciones", value: hlKpis.totalSubs, pct: hlKpis.subsPct, color: "bg-emerald-500" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-20 shrink-0">{item.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold tabular-nums w-12 text-right">{fmtK(item.value)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <span className="text-[10px] text-muted-foreground">
                        Nuevas subs: {hlKpis.totalNewSubs.toLocaleString()} · Recurrentes: {hlKpis.totalRecurring.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}


              {/* ══════ ALERTS PANEL ══════ */}
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
                    <div className="grid grid-cols-3 gap-3">
                      {sections.map((s) => (
                        <button key={s.key} onClick={() => setAlertTab(alertTab === s.key ? null : s.key)}
                          className={`rounded-lg border-2 p-3 text-left transition-all ${alertTab === s.key ? `${s.border} ${s.bg} ring-2 ring-offset-1 ring-offset-background ring-primary/20` : "border-border bg-card hover:border-muted-foreground/30"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-base">{s.emoji}</span>
                            <span className={`text-xl font-bold tabular-nums ${s.items.length > 0 ? s.text : "text-muted-foreground"}`}>{s.items.length}</span>
                          </div>
                          <p className={`text-xs font-semibold ${s.items.length > 0 ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                          {/* Creator name previews */}
                          {s.items.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {s.items.slice(0, 3).map((a, idx) => (
                                <p key={idx} className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                  <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                                  {a.creator.name}
                                </p>
                              ))}
                              {s.items.length > 3 && (
                                <p className="text-[9px] text-muted-foreground/60">+{s.items.length - 3} más…</p>
                              )}
                            </div>
                          )}
                          {s.items.length === 0 && (
                            <p className="text-[9px] text-muted-foreground mt-0.5">{s.desc}</p>
                          )}
                        </button>
                      ))}
                    </div>
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
                              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
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

              {/* ══════ PROJECTION PANEL ══════ */}
              {showProjection && !isLoading && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-accent-foreground" />
                      <h2 className="text-sm font-bold text-foreground">
                        Proyección {format(new Date(), "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase())}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Proyección bruto</p>
                      <p className="text-lg font-bold tabular-nums">{fmt(projectionTotal)}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Basado en {new Date().getDate() - 1} días. Fórmula: (acumulado / días) × días del mes.
                  </p>
                  {projection.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos del mes actual.</p>
                  ) : (
                    <div className="rounded-lg border border-border bg-card overflow-auto max-h-[300px]">
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

              {/* ══════ FILTERS ══════ */}
              {!isLoading && (
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <div className="relative flex-1 min-w-[160px] max-w-[220px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Buscar creadora…" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-8 h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Mín $</Label>
                    <Input type="number" placeholder="0" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} className="h-8 w-16 text-xs tabular-nums" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Máx $</Label>
                    <Input type="number" placeholder="∞" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} className="h-8 w-16 text-xs tabular-nums" />
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Switch id="show-zeros" checked={showZeros} onCheckedChange={setShowZeros} className="scale-90" />
                    <Label htmlFor="show-zeros" className="text-[10px] text-muted-foreground cursor-pointer">$0</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums ml-2">{filteredCreators.length} creadoras</span>
                  </div>
                </div>
              )}

              {/* ══════ TABLE ══════ */}
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-480px)]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <SortableHead col="name" label="Creadora" />
                        <SortableHead col="total" label="Bruto" right />
                        <SortableHead col="net" label="Neto" right />
                        <TableHead className="text-right whitespace-nowrap text-xs">vs Ant.</TableHead>
                        <SortableHead col="subs" label="Subs" right />
                        <SortableHead col="newSubs" label="Nuevas" right />
                        <SortableHead col="recurringSubs" label="Recur." right />
                        <SortableHead col="tips" label="Tips" right />
                        <SortableHead col="messages" label="Msgs" right />
                        <SortableHead col="activeFans" label="Fans" right />
                        <SortableHead col="newFans" label="New" right />
                        <SortableHead col="avgPerDay" label="$/Día" right />
                        <SortableHead col="avgPerFan" label="$/Fan" right />
                        <SortableHead col="daysWithData" label="Días" right />
                        <SortableHead col="lastDate" label="Última" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creators.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={16} className="text-center py-12 text-muted-foreground">
                            {rawCreators.length > 0 ? "No hay resultados con los filtros actuales" : `Sin datos para ${selectedPeriod?.label}`}
                          </TableCell>
                        </TableRow>
                      ) : (
                        creators.map((c, i) => <CreatorRow key={c.creatorId} c={c} i={i} />)
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* ══════ KPI LIST POPUP — click en cards Revenue/Creadoras ══════ */}
            <Dialog open={kpiListOpen !== null} onOpenChange={(o) => !o && setKpiListOpen(null)}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {kpiListOpen === "revenue" ? (
                      <>
                        <DollarSign className="h-5 w-5 text-emerald-500" />
                        Revenue por Creadora · {selectedPeriod?.label}
                      </>
                    ) : (
                      <>
                        <Users className="h-5 w-5 text-blue-500" />
                        Creadoras ({creators.length}) · {selectedPeriod?.label}
                      </>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-1 mt-2">
                  {creators.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Sin datos para este período.
                    </p>
                  ) : (
                    [...creators]
                      .sort((a, b) =>
                        kpiListOpen === "revenue" ? b.total - a.total : a.name.localeCompare(b.name),
                      )
                      .map((c, idx) => (
                        <button
                          key={c.creatorId}
                          type="button"
                          onClick={() => {
                            navigate(`/creadores/${c.creatorId}`);
                            setKpiListOpen(null);
                          }}
                          className="flex items-center justify-between w-full gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-accent hover:border-primary/40 text-left"
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground tabular-nums w-6 shrink-0">
                              {idx + 1}.
                            </span>
                            <span className="font-medium truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-bold tabular-nums text-emerald-500">
                              {fmtK(c.total)}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
                              {c.activeFans?.toLocaleString() ?? 0} fans
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* ══════ METRICS DIALOG ══════ */}
            <Dialog open={showMetrics} onOpenChange={(o) => { setShowMetrics(o); if (!o && dashTab === "metrics") setDashTab("resumen"); }}>
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
                          <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary mx-auto">{item.icon}</div>
                          <p className="text-2xl font-bold tabular-nums">{item.value}</p>
                          <p className="text-xs font-medium text-foreground">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {isAdmin && (
                    <>
                      <div className="h-px bg-border" />
                      <div>
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">CEO Insights</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/20 text-primary mx-auto"><Crown className="h-4 w-4" /></div>
                            <p className="text-sm font-bold truncate">{hlKpis.topCreator?.name || "—"}</p>
                            <p className="text-xl font-bold tabular-nums text-primary">{hlKpis.topCreator ? fmt(hlKpis.topCreator.total) : "$0"}</p>
                            <p className="text-[10px] text-muted-foreground">top creadora</p>
                          </div>
                          <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted text-muted-foreground mx-auto"><Target className="h-4 w-4" /></div>
                            <p className="text-xl font-bold tabular-nums">{fmt(hlKpis.avgPerCreator)}</p>
                            <p className="text-xs font-medium text-foreground">Promedio</p>
                            <p className="text-[10px] text-muted-foreground">{hlKpis.activeCount} activas</p>
                          </div>
                          <div className="rounded-xl border border-destructive/30 bg-gradient-to-b from-destructive/10 to-destructive/5 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-destructive/20 text-destructive mx-auto"><AlertTriangle className="h-4 w-4" /></div>
                            <p className="text-2xl font-bold tabular-nums">{hlKpis.zeroCreators}</p>
                            <p className="text-xs font-medium text-foreground">Inactivas</p>
                            <p className="text-[10px] text-muted-foreground">$0 en ventas</p>
                          </div>
                          <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/30 p-4 space-y-2 text-center">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-muted text-muted-foreground mx-auto"><TrendingUp className="h-4 w-4" /></div>
                            <p className="text-sm font-bold tabular-nums">{hlKpis.creatorsOver10k} <span className="text-muted-foreground font-normal">{'>'} $10k</span></p>
                            <p className="text-sm font-bold tabular-nums">{hlKpis.creatorsUnder1k} <span className="text-muted-foreground font-normal">{'<'} $1k</span></p>
                            <p className="text-[10px] text-muted-foreground">distribución</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* ══════ PARETO DIALOG ══════ */}
            <Dialog open={showPareto} onOpenChange={(o) => { setShowPareto(o); if (!o && dashTab === "pareto") setDashTab("resumen"); }}>
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
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <Button variant={paretoView === "list" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoView("list")}>Lista</Button>
                      <Button variant={paretoView === "chart" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoView("chart")}>Gráfico</Button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <Button variant={paretoGroup === "80" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoGroup("80")}>Top 20% (generan 80%)</Button>
                      <Button variant={paretoGroup === "20" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoGroup("20")}>Bottom 80% (generan 20%)</Button>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-bold tabular-nums">{paretoAnalysis.topCount} <span className="text-muted-foreground font-normal text-xs">de {paretoAnalysis.totalCount}</span></p>
                      <p className="text-[10px] text-muted-foreground">generan 80% del revenue</p>
                    </div>
                  </div>

                  {paretoView === "chart" && (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={400}>
                          <RechartsPie>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={160} paddingAngle={1} stroke="hsl(var(--border))"
                              label={({ name, percent }: { name: string; percent: number }) => percent > 0.03 ? `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%` : ''}
                              labelLine={true}
                            >
                              {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                              itemStyle={{ color: "hsl(var(--foreground))" }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                              formatter={(value: number, name: string) => [fmt(value), name]}
                            />
                          </RechartsPie>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend with names */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 px-2">
                        {pieData.map((d, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs truncate">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                            <span className="truncate text-foreground">{d.name}</span>
                            <span className="text-muted-foreground tabular-nums ml-auto shrink-0">{fmtK(d.value)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border bg-muted/30 px-6 py-2.5 w-full text-center rounded-b-lg">
                        <p className="text-[10px] text-muted-foreground">
                          Montos <strong>BRUTOS</strong> · {paretoGroup === "80" ? `Top ${paretoAnalysis.topCount} creadoras generan ${fmt(paretoAnalysis.topRevenue)}` : `Bottom ${paretoAnalysis.rest.length} generan ${fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}`} de {fmt(paretoAnalysis.totalRevenue)} total
                        </p>
                      </div>
                    </div>
                  )}

                  {paretoView === "list" && (
                    <div className="space-y-5">
                      {paretoGroup === "80" && (
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
                                  <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"><Instagram className="h-3.5 w-3.5" /></a>
                                )}
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
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
                      )}
                      {paretoGroup === "20" && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-widest">📉 Resto ({paretoAnalysis.rest.length})</p>
                        {paretoAnalysis.rest.length > 0 ? (
                          <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
                            {paretoAnalysis.rest.map((c, i) => {
                              const restRevenue = paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue;
                              const pctOfRest = restRevenue > 0 ? (c.total / restRevenue) * 100 : 0;
                              const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                              return (
                                <div key={c.creatorId} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 hover:bg-muted/40 transition-colors">
                                  <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{paretoAnalysis.topCount + i + 1}</span>
                                  {c.instagramHandle && (
                                    <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"><Instagram className="h-3.5 w-3.5" /></a>
                                  )}
                                  <button className="text-sm text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                  <div className="flex-1 mx-2">
                                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-muted-foreground/40 transition-all" style={{ width: `${Math.min(pctOfRest, 100)}%` }} />
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold tabular-nums w-[60px] text-right text-muted-foreground">{pctOfRest.toFixed(1)}%</span>
                                  <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">({pctOfTotal.toFixed(1)}%)</span>
                                  <span className="text-sm tabular-nums text-muted-foreground w-[100px] text-right">{fmt(c.total)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-sm text-muted-foreground">Ninguna.</p>}
                      </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* ══════ DEEP DIVE DIALOG ══════ */}
            <Dialog open={showDeepDive} onOpenChange={(o) => { setShowDeepDive(o); if (!o && dashTab === "deepdive") setDashTab("resumen"); }}>
              <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
                <div className="px-6 pt-5 pb-3 border-b border-border shrink-0">
                   <DialogHeader>
                     <DialogTitle className="text-lg flex items-center gap-2">
                       <Telescope className="h-5 w-5 text-primary" />
                       Deep Dive
                       <span className="text-muted-foreground">—</span>
                       <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                         <SelectTrigger className="h-8 w-[160px] text-sm font-medium">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           {monthOptions.map((m) => (
                             <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </DialogTitle>
                   </DialogHeader>
                  <div className="flex flex-wrap items-center gap-1 mt-3 bg-muted rounded-lg p-1">
                    {([
                      { key: "mom" as const, icon: <GitCompare className="h-3.5 w-3.5" />, label: "MoM", desc: "Mes vs Mes" },
                      { key: "compare" as const, icon: <Scale className="h-3.5 w-3.5" />, label: "Ranking", desc: "Posición por revenue" },
                      { key: "scalability" as const, icon: <Target className="h-3.5 w-3.5" />, label: "Escalabilidad", desc: "Potencial de crecimiento" },
                      { key: "channels" as const, icon: <BarChart3 className="h-3.5 w-3.5" />, label: "Canales", desc: "Msgs vs Tips vs Subs" },
                      { key: "opportunities" as const, icon: <Sparkles className="h-3.5 w-3.5" />, label: "Oportunidades", desc: "Dónde hay potencial" },
                      { key: "alerts" as const, icon: <ShieldAlert className="h-3.5 w-3.5" />, label: `Alertas (${alerts.length})`, desc: "Riesgos activos" },
                    ]).map((tab) => (
                      <UITooltip key={tab.key}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={deepDiveTab === tab.key ? "default" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1 flex-1 min-w-0"
                            onClick={() => setDeepDiveTab(tab.key)}
                          >
                            {tab.icon} <span className="truncate">{tab.label}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{tab.desc}</TooltipContent>
                      </UITooltip>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1 bg-muted/50 rounded-lg p-1">
                    <span className="text-[9px] text-muted-foreground px-2 shrink-0 uppercase tracking-widest font-semibold">Roadmap</span>
                    {([
                      { key: "chatter" as const, icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Chatters", desc: "Rendimiento por chatter (próximamente)" },
                      { key: "ltv" as const, icon: <UserCheck className="h-3.5 w-3.5" />, label: "LTV", desc: "Valor de vida del cliente (próximamente)" },
                      { key: "content_roi" as const, icon: <Layers className="h-3.5 w-3.5" />, label: "Content ROI", desc: "Retorno por tipo de contenido (próximamente)" },
                      { key: "cohort" as const, icon: <Brain className="h-3.5 w-3.5" />, label: "Cohortes", desc: "Retención por grupo de fans (próximamente)" },
                    ]).map((tab) => (
                      <UITooltip key={tab.key}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={deepDiveTab === tab.key ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1 flex-1 min-w-0 opacity-70"
                            onClick={() => setDeepDiveTab(tab.key)}
                          >
                            {tab.icon} <span className="truncate">{tab.label}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{tab.desc}</TooltipContent>
                      </UITooltip>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {/* ── MoM Comparison ── */}
                  {deepDiveTab === "mom" && (() => {
                     const currentIdx = monthOptions.findIndex((m) => m.value === selectedMonth);
                     const prevPeriod = monthOptions[currentIdx + 1];
                     const momBase = rawCreators
                       .filter((c) => c.total > 0 || prevMonthMap.has(c.creatorId))
                       .map((c) => {
                         const prev = prevMonthMap.get(c.creatorId) ?? 0;
                         const change = prev > 0 ? ((c.total - prev) / prev) * 100 : (c.total > 0 ? 100 : 0);
                         const delta = c.total - prev;
                         return { ...c, prev, change, delta };
                       });
                     const momCreators = ddSortedList("mom", momBase);

                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">📊 Comparativa Mes vs Mes (MoM)</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Compara el revenue de cada creadora entre el mes seleccionado y el mes anterior. Identifica quién creció, quién cayó y en cuánto.</p>
                         </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Actual</p>
                            <p className="text-lg font-bold tabular-nums">{fmtK(hlKpis.totalBruto)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Anterior</p>
                            <p className="text-lg font-bold tabular-nums">{fmtK(prevMonthTotal)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Diferencia</p>
                            <p className={`text-lg font-bold tabular-nums ${totalChangePercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {totalChangePercent >= 0 ? "+" : ""}{fmtK(hlKpis.totalBruto - prevMonthTotal)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Cambio %</p>
                            <p className={`text-lg font-bold tabular-nums ${totalChangePercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {totalChangePercent >= 0 ? "↑" : "↓"}{Math.abs(totalChangePercent).toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Creator-by-creator comparison table */}
                        <div className="rounded-lg border border-border bg-card overflow-auto max-h-[420px]">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-card">
                              <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("mom", "total", "Mes Actual")}
                                 {ddHead("mom", "prev", "Mes Anterior")}
                                 {ddHead("mom", "delta", "Diferencia")}
                                 {ddHead("mom", "change", "Cambio %")}
                                 <TableHead className="text-center w-20">Tendencia</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {momCreators.map((c, i) => (
                                <TableRow key={c.creatorId}>
                                  <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                  <TableCell>
                                    <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                      {c.name}
                                    </button>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(c.total)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.prev > 0 ? fmt(c.prev) : "—"}</TableCell>
                                  <TableCell className={`text-right tabular-nums text-sm font-medium ${c.delta >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                    {c.delta >= 0 ? "+" : ""}{fmtShort(c.delta)}
                                  </TableCell>
                                  <TableCell className={`text-right tabular-nums text-sm font-medium ${c.change >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                    {c.prev > 0 ? `${c.change >= 0 ? "+" : ""}${c.change.toFixed(0)}%` : "Nueva"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {c.change > 10 && <Badge variant="outline" className="text-[9px] h-5 border-emerald-500/40 text-emerald-500">↑ Crece</Badge>}
                                    {c.change <= 10 && c.change >= -10 && <Badge variant="outline" className="text-[9px] h-5 border-muted-foreground/30">= Estable</Badge>}
                                    {c.change < -10 && <Badge variant="outline" className="text-[9px] h-5 border-destructive/40 text-destructive">↓ Cae</Badge>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Creator Ranking ── */}
                  {deepDiveTab === "compare" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const topTotal = rawCreators.filter(x => x.total > 0).reduce((s, x) => s + x.total, 0);
                       const pct = topTotal > 0 ? (c.total / topTotal) * 100 : 0;
                       const retention = c.subs > 0 ? (c.recurringSubs / c.subs) * 100 : 0;
                       return { ...c, pct, retention };
                     });
                     const ranked = ddSortedList("compare", base);
                     const topTotal = base.reduce((s, c) => s + c.total, 0);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">🏆 Ranking de Creadoras</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Posición de cada creadora por revenue bruto total. Muestra su participación en el total, eficiencia ($/Día, $/Fan) y tasa de retención de suscriptores.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">Ranking completo por revenue bruto. Muestra participación individual, performance relativa y posición.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("compare", "total", "Bruto")}
                                 {ddHead("compare", "pct", "% Total")}
                                 <TableHead className="w-[180px]">Participación</TableHead>
                                 {ddHead("compare", "avgPerDay", "$/Día")}
                                 {ddHead("compare", "avgPerFan", "$/Fan")}
                                 {ddHead("compare", "activeFans", "Fans")}
                                 {ddHead("compare", "retention", "Retención")}
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {ranked.map((c, i) => {
                                return (
                                  <TableRow key={c.creatorId}>
                                    <TableCell className="text-xs text-muted-foreground tabular-nums font-bold">{i + 1}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1.5">
                                        {i < 3 && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                                        <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                          {c.name}
                                        </button>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(c.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.pct.toFixed(1)}%</TableCell>
                                    <TableCell>
                                       <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                         <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(c.pct * 2, 100)}%` }} />
                                       </div>
                                     </TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerDay)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerFan)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.activeFans.toLocaleString()}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">
                                       <span className={c.retention > 50 ? "text-emerald-500" : c.retention > 30 ? "text-amber-500" : "text-destructive"}>
                                         {c.retention.toFixed(0)}%
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Scalability ── */}
                  {deepDiveTab === "scalability" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const target = c.total * 1.2;
                       const gap = target - c.total;
                       const progress = c.total > 0 ? (c.total / target) * 100 : 0;
                       return { ...c, target, gap, progress };
                     });
                     const active = ddSortedList("scalability", base);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">📈 Escalabilidad</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">¿Cuánto más podría generar cada creadora? Se calcula un target de +20% sobre su actual y se sugiere la acción más efectiva para alcanzarlo.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">¿Cuánto más podría generar cada creadora? Target: +20% sobre su actual.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("scalability", "total", "Actual")}
                                 {ddHead("scalability", "target", "Target")}
                                 {ddHead("scalability", "gap", "Falta")}
                                 <TableHead className="w-[140px]">Progreso</TableHead>
                                 <TableHead className="text-center">Sugerencia</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {active.map((c, i) => {
                                const action = c.avgPerFan < hlKpis.avgPerFanGlobal * 0.5
                                   ? "💰 Monetizar mejor"
                                   : c.messages / (c.total || 1) < 0.3
                                   ? "💬 Más mensajería"
                                   : c.newFans <= 0
                                   ? "📣 Adquirir fans"
                                   : "✅ Mantener";
                                 return (
                                   <TableRow key={c.creatorId}>
                                     <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                     <TableCell>
                                       <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                         {c.name}
                                       </button>
                                     </TableCell>
                                     <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtShort(c.total)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-primary">{fmtShort(c.target)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-emerald-500">+{fmtShort(c.gap)}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                         <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(c.progress, 100)}%` }} />
                                        </div>
                                         <span className="text-[10px] text-muted-foreground tabular-nums w-8">{c.progress.toFixed(0)}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center text-xs">{action}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Summary insight */}
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">Insight de Escalabilidad</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Si todas las creadoras activas ({active.length}) alcanzan su target +20%, el revenue bruto mensual pasaría de {fmtK(hlKpis.totalBruto)} a <strong className="text-primary">{fmtK(hlKpis.totalBruto * 1.2)}</strong>.
                              La oportunidad más grande está en creadoras con $/Fan por debajo del promedio ({fmt(hlKpis.avgPerFanGlobal)}/fan) — mejorar su monetización genera mayor impacto.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Alerts Review ── */}
                  {deepDiveTab === "alerts" && (() => {
                    const zeros = alerts.filter((a) => a.type === "zero");
                    const drops = alerts.filter((a) => a.type === "drop");
                    const fanLoss = alerts.filter((a) => a.type === "fanLoss");

                    const renderSection = (title: string, emoji: string, items: typeof alerts, borderColor: string, bgColor: string) => (
                      <div className={`rounded-xl border-2 ${borderColor} ${bgColor} p-4 space-y-3`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{emoji}</span>
                          <h3 className="text-sm font-bold text-foreground">{title}</h3>
                          <Badge variant="outline" className="text-[9px] h-5 ml-auto">{items.length}</Badge>
                        </div>
                        {items.length === 0 ? (
                          <div className="flex items-center gap-2 py-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <p className="text-sm text-muted-foreground">Sin alertas en esta categoría</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {items.map((a, i) => (
                              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2.5">
                                <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0 font-bold">{i + 1}</span>
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${a.creator.creatorId}`)}>
                                  {a.creator.name}
                                </button>
                                <span className="text-sm text-muted-foreground flex-1">{a.detail}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                  {a.creator.activeFans > 0 ? `${a.creator.activeFans} fans` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-foreground">Resumen de Alertas — {selectedPeriod?.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {alerts.length} alertas activas: {zeros.length} inactivas, {drops.length} caídas severas, {fanLoss.length} perdiendo fans
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-destructive">{zeros.length}</p>
                              <p className="text-[9px] text-muted-foreground">Inactivas</p>
                            </div>
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-orange-500">{drops.length}</p>
                              <p className="text-[9px] text-muted-foreground">Caída</p>
                            </div>
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-amber-500">{fanLoss.length}</p>
                              <p className="text-[9px] text-muted-foreground">Fan Loss</p>
                            </div>
                          </div>
                        </div>
                        {renderSection("Inactivas — Revenue $0", "🔴", zeros, "border-destructive/30", "bg-destructive/5")}
                        {renderSection("Caída severa (>30%)", "🟠", drops, "border-orange-400/30", "bg-orange-500/5")}
                        {renderSection("Pérdida de fans", "🟡", fanLoss, "border-yellow-400/30", "bg-yellow-500/5")}
                      </div>
                    );
                  })()}

                  {/* ── Revenue por Canal (Deep) ── */}
                  {deepDiveTab === "channels" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const msgPct = c.total > 0 ? (c.messages / c.total) * 100 : 0;
                       const tipPct = c.total > 0 ? (c.tips / c.total) * 100 : 0;
                       const subPct = c.total > 0 ? (c.subs / c.total) * 100 : 0;
                       return { ...c, msgPct, tipPct, subPct };
                     });
                     const active = ddSortedList("channels", base);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">💬 Análisis por Canal de Monetización</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Desglose de ingresos por canal (Mensajería, Tips, Suscripciones) para cada creadora. Si una creadora tiene &gt;70% en un solo canal, aparece con ⚠ indicando riesgo de dependencia.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">Desglose detallado por canal de monetización para cada creadora. Identifica dependencias y oportunidades de diversificación.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("channels", "total", "Total")}
                                 {ddHead("channels", "messages", "Msgs $")}
                                 {ddHead("channels", "msgPct", "Msgs %")}
                                 {ddHead("channels", "tips", "Tips $")}
                                 {ddHead("channels", "tipPct", "Tips %")}
                                 {ddHead("channels", "subs", "Subs $")}
                                 {ddHead("channels", "subPct", "Subs %")}
                                 <TableHead className="text-center">Canal Dominante</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {active.map((c, i) => {
                                const dominant = c.msgPct >= c.tipPct && c.msgPct >= c.subPct ? "💬 Msgs" : c.tipPct >= c.subPct ? "💰 Tips" : "🔄 Subs";
                                 const concentrated = Math.max(c.msgPct, c.tipPct, c.subPct) > 70;
                                return (
                                  <TableRow key={c.creatorId}>
                                    <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                    <TableCell>
                                      <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtShort(c.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.messages)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.msgPct.toFixed(0)}%</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.tips)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.tipPct.toFixed(0)}%</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.subs)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.subPct.toFixed(0)}%</TableCell>
                                    <TableCell className="text-center text-xs">
                                      <span className={concentrated ? "text-amber-500 font-semibold" : ""}>{dominant}</span>
                                      {concentrated && <span className="text-[9px] text-amber-500 ml-1">⚠</span>}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">Insight de Diversificación</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {active.filter(c => { const max = Math.max(c.total > 0 ? (c.messages / c.total) * 100 : 0, c.total > 0 ? (c.tips / c.total) * 100 : 0, c.total > 0 ? (c.subs / c.total) * 100 : 0); return max > 70; }).length} creadoras tienen &gt;70% concentrado en un solo canal — riesgo de dependencia. Diversificar canales reduce volatilidad.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Top Oportunidades ── */}
                  {deepDiveTab === "opportunities" && (() => {
                    const active = rawCreators.filter((c) => c.total > 0);
                    const lowMonetization = active.filter(c => c.avgPerFan < hlKpis.avgPerFanGlobal * 0.6 && c.activeFans > 50).sort((a, b) => b.activeFans - a.activeFans).slice(0, 10);
                    const highGrowth = active.filter(c => { const prev = prevMonthMap.get(c.creatorId); return prev && prev > 0 && ((c.total - prev) / prev) > 0.2; }).sort((a, b) => b.total - a.total).slice(0, 10);
                    const underperforming = active.filter(c => c.avgPerFan > 0 && c.activeFans < 100 && c.total > 500).sort((a, b) => b.avgPerFan - a.avgPerFan).slice(0, 10);

                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">🎯 Oportunidades de Crecimiento</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Tres categorías accionables: creadoras en racha de crecimiento, creadoras con muchos fans pero baja monetización, y creadoras con buena monetización pero pocos fans.</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Creadoras con mayor potencial de crecimiento basado en métricas actuales.</p>
                        
                        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🚀</span>
                            <h3 className="text-sm font-bold text-foreground">Alto Crecimiento</h3>
                            <span className="text-[10px] text-muted-foreground">Crecieron &gt;20% vs mes anterior — mantener impulso</span>
                          </div>
                          {highGrowth.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {highGrowth.map((c, i) => {
                                const prev = prevMonthMap.get(c.creatorId) ?? 0;
                                const pct = prev > 0 ? ((c.total - prev) / prev * 100) : 0;
                                return (
                                  <div key={c.creatorId} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
                                    <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                    <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                    <span className="text-sm tabular-nums font-semibold">{fmtShort(c.total)}</span>
                                    <span className="text-xs tabular-nums text-emerald-500 font-bold ml-auto">↑{pct.toFixed(0)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">💎</span>
                            <h3 className="text-sm font-bold text-foreground">Sub-monetizadas</h3>
                            <span className="text-[10px] text-muted-foreground">$/Fan bajo vs promedio ({fmt(hlKpis.avgPerFanGlobal)}) pero +50 fans — oportunidad de monetización</span>
                          </div>
                          {lowMonetization.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {lowMonetization.map((c, i) => (
                                <div key={c.creatorId} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
                                  <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                  <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                  <span className="text-sm tabular-nums">{fmtShort(c.total)}</span>
                                  <span className="text-xs text-muted-foreground">{c.activeFans} fans</span>
                                  <span className="text-xs tabular-nums text-blue-500 font-bold ml-auto">{fmt(c.avgPerFan)}/fan</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border-2 border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📣</span>
                            <h3 className="text-sm font-bold text-foreground">Necesitan Audiencia</h3>
                            <span className="text-[10px] text-muted-foreground">Buen $/Fan pero &lt;100 fans — necesitan adquisición</span>
                          </div>
                          {underperforming.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {underperforming.map((c, i) => (
                                <div key={c.creatorId} className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-3 py-2">
                                  <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                  <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                  <span className="text-sm tabular-nums">{fmtShort(c.total)}</span>
                                  <span className="text-xs text-muted-foreground">{c.activeFans} fans</span>
                                  <span className="text-xs tabular-nums text-purple-500 font-bold ml-auto">{fmt(c.avgPerFan)}/fan</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Chatter Performance (Placeholder) ── */}
                  {deepDiveTab === "chatter" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border-2 border-dashed border-blue-400/40 bg-blue-500/5 p-8 text-center space-y-4">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-blue-500/10 mx-auto">
                          <MessageSquare className="h-8 w-8 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Chatter Performance</h3>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Análisis de rendimiento por chatter: revenue generado, msgs/hora, tasa de conversión, y ranking comparativo.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                          {["Revenue por Chatter", "Msgs/Hora", "Conversión Fan→Pago", "Ranking Chatters"].map(m => (
                            <div key={m} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                              <p className="text-[10px] text-muted-foreground">{m}</p>
                              <p className="text-lg font-bold text-muted-foreground/40 mt-1">—</p>
                            </div>
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs border-dashed"><Lock className="h-3 w-3 mr-1" />Requiere integración de datos de chatters</Badge>
                      </div>
                    </div>
                  )}

                  {/* ── Customer LTV (Placeholder) ── */}
                  {deepDiveTab === "ltv" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border-2 border-dashed border-emerald-400/40 bg-emerald-500/5 p-8 text-center space-y-4">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 mx-auto">
                          <UserCheck className="h-8 w-8 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Customer Lifetime Value</h3>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Valor del ciclo de vida del fan: cuánto gasta en promedio, cuánto tiempo se queda, y tasa de reactivación.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                          {["LTV Promedio", "Churn Rate", "Tiempo Promedio", "Reactivación %"].map(m => (
                            <div key={m} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                              <p className="text-[10px] text-muted-foreground">{m}</p>
                              <p className="text-lg font-bold text-muted-foreground/40 mt-1">—</p>
                            </div>
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs border-dashed"><Lock className="h-3 w-3 mr-1" />Requiere tracking de fans individuales</Badge>
                      </div>
                    </div>
                  )}

                  {/* ── Content ROI (Placeholder) ── */}
                  {deepDiveTab === "content_roi" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border-2 border-dashed border-purple-400/40 bg-purple-500/5 p-8 text-center space-y-4">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-purple-500/10 mx-auto">
                          <Layers className="h-8 w-8 text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Content ROI</h3>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Retorno de inversión por tipo de contenido: qué formatos generan más revenue, engagement y conversión.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                          {["Revenue/Post", "Engagement Rate", "Conversión Contenido", "Top Formato"].map(m => (
                            <div key={m} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                              <p className="text-[10px] text-muted-foreground">{m}</p>
                              <p className="text-lg font-bold text-muted-foreground/40 mt-1">—</p>
                            </div>
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs border-dashed"><Lock className="h-3 w-3 mr-1" />Requiere tracking de contenido publicado</Badge>
                      </div>
                    </div>
                  )}

                  {/* ── Cohort Analysis (Placeholder) ── */}
                  {deepDiveTab === "cohort" && (
                    <div className="space-y-5">
                      <div className="rounded-xl border-2 border-dashed border-amber-400/40 bg-amber-500/5 p-8 text-center space-y-4">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/10 mx-auto">
                          <Brain className="h-8 w-8 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">Cohort Analysis</h3>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Retención por cohorte de fans: qué mes de adquisición retiene mejor, patrones de comportamiento y churn por grupo.</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
                          {["Retención M1", "Retención M3", "Mejor Cohorte", "Churn Rate/Cohorte"].map(m => (
                            <div key={m} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                              <p className="text-[10px] text-muted-foreground">{m}</p>
                              <p className="text-lg font-bold text-muted-foreground/40 mt-1">—</p>
                            </div>
                          ))}
                        </div>
                        <Badge variant="outline" className="text-xs border-dashed"><Lock className="h-3 w-3 mr-1" />Requiere datos históricos de fans por cohorte</Badge>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </main>
  );
};

export default Dashboard2;
