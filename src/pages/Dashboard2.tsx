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
import { Info, TrendingUp, Users, DollarSign, Calendar, ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from "lucide-react";

interface CreatorSummary {
  creatorId: string;
  name: string;
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

const Dashboard2 = () => {
  const { data: allRows = [], isLoading } = useEarningsData();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchText, setSearchText] = useState("");
  const [showZeros, setShowZeros] = useState(false);
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const { data: platformMap = {} } = useQuery({
    queryKey: ["creator-platforms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("creator_business")
        .select("creator_id, main_platform");
      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        if (r.creator_id && r.main_platform) map[r.creator_id] = r.main_platform;
      }
      return map;
    },
  });

  const lastMonth = useMemo(() => {
    const now = new Date();
    const m = subMonths(now, 1);
    const y = m.getFullYear();
    const mo = m.getMonth();
    const startStr = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const endStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startStr, endStr, month: m, lastDay };
  }, []);

  const label = useMemo(
    () => format(lastMonth.month, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()),
    [lastMonth]
  );

  // Build creator summaries — OnlyFans only
  const rawCreators = useMemo(() => {
    const map = new Map<string, CreatorSummary>();

    for (const r of allRows) {
      const d = r.effective_date;
      if (d < lastMonth.startStr || d > lastMonth.endStr) continue;

      const key = r.creator_id || r.pending_creator || r.id;

      // Filter: only OnlyFans creators (or unknown platform — they come from OF data anyway)
      const plat = r.creator_id ? platformMap[r.creator_id] : null;
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

    // Compute averages
    for (const c of map.values()) {
      c.avgPerDay = c.daysWithData > 0 ? c.total / c.daysWithData : 0;
      c.avgPerFan = c.activeFans > 0 ? c.total / c.activeFans : 0;
    }

    return Array.from(map.values());
  }, [allRows, lastMonth, platformMap]);

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
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        {label} <SortIcon col={col} />
      </span>
    </TableHead>
  );

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-5">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Ventas OnlyFans — {label}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Solo creadoras de OnlyFans · Clic en encabezado para ordenar
              </p>
            </div>

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
                  <p className="text-sm font-bold tabular-nums">{lastMonth.startStr}</p>
                  <p className="text-[10px] text-muted-foreground">→ {lastMonth.endStr}</p>
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
                  Datos de <code className="bg-muted px-1 rounded font-mono">of_gross_earnings</code> (OnlyFans). 
                  Se excluyen Unlok e Instagram. Deduplicados por creadora + día.
                  <span className="text-orange-500 dark:text-orange-400 ml-1">⚠ = data se cortó antes del día 20.</span>
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
                      <SortableHead col="total" label="Total Bruto" right />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creators.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                          {rawCreators.length > 0
                            ? "No hay resultados con los filtros actuales"
                            : `Sin datos para ${label}`}
                        </TableCell>
                      </TableRow>
                    ) : (
                      creators.map((c, i) => {
                        const stopped = dataStoppedEarly(c.lastDate);
                        const isZero = c.total === 0;
                        return (
                          <TableRow key={c.creatorId} className={isZero ? "opacity-50" : ""}>
                            <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">{c.name}</TableCell>
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
                            <TableCell className={`text-sm tabular-nums whitespace-nowrap ${stopped ? "text-orange-500 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}>
                              {format(new Date(c.lastDate + "T12:00:00"), "dd MMM", { locale: es })}
                              {stopped && " ⚠"}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${isZero ? "text-muted-foreground" : ""}`}>
                              {fmt(c.total)}
                            </TableCell>
                          </TableRow>
                        );
                      })
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
