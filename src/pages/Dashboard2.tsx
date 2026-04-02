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
import { Info, TrendingUp, Users, DollarSign, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface CreatorSummary {
  creatorId: string;
  name: string;
  platform: string;
  total: number;
  subs: number;
  tips: number;
  messages: number;
  activeFans: number;
  newFans: number;
  daysWithData: number;
  lastDate: string;
}

type SortKey = "name" | "platform" | "subs" | "tips" | "messages" | "activeFans" | "daysWithData" | "total" | "lastDate";
type SortDir = "asc" | "desc";

const PLATFORM_COLORS: Record<string, string> = {
  OnlyFans: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  Onlyfans: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  Unlok: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  Instagram: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
};

const Dashboard2 = () => {
  const { data: allRows = [], isLoading } = useEarningsData();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const { creators: rawCreators, grandTotal, totalFans, latestDate, totalRows } = useMemo(() => {
    const map = new Map<string, CreatorSummary>();
    let latest = "";
    let rowCount = 0;

    for (const r of allRows) {
      const d = r.effective_date;
      if (d < lastMonth.startStr || d > lastMonth.endStr) continue;
      rowCount++;
      if (d > latest) latest = d;

      const key = r.creator_id || r.pending_creator || r.id;
      const existing = map.get(key);

      if (existing) {
        existing.total += r.total_earnings_gross ?? 0;
        existing.subs += r.subscription_gross ?? 0;
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
          platform: (r.creator_id ? platformMap[r.creator_id] : null) || "—",
          total: r.total_earnings_gross ?? 0,
          subs: r.subscription_gross ?? 0,
          tips: r.tips_gross ?? 0,
          messages: r.message_gross ?? 0,
          activeFans: r.active_fans ?? 0,
          newFans: r.new_fans ?? 0,
          daysWithData: 1,
          lastDate: d,
        });
      }
    }

    return {
      creators: Array.from(map.values()),
      grandTotal: Array.from(map.values()).reduce((s, c) => s + c.total, 0),
      totalFans: Array.from(map.values()).reduce((s, c) => s + c.activeFans, 0),
      latestDate: latest,
      totalRows: rowCount,
    };
  }, [allRows, lastMonth, platformMap]);

  const creators = useMemo(() => {
    const sorted = [...rawCreators];
    sorted.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "platform": av = a.platform.toLowerCase(); bv = b.platform.toLowerCase(); break;
        case "lastDate": av = a.lastDate; bv = b.lastDate; break;
        default: av = a[sortKey]; bv = b[sortKey];
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawCreators, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "platform" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 text-primary" />
      : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtShort = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n);

  // Flag: if lastDate is before the 20th of the month, data stopped early
  const dataStoppedEarly = (lastDate: string) => {
    const day = parseInt(lastDate.split("-")[2], 10);
    return day < 20;
  };

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
                Ventas por Creadora — {label}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Fuente: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">of_gross_earnings</code> · Plataforma: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">creator_business</code> · Clic en encabezado para ordenar
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
                    <Users className="h-3.5 w-3.5" /> Creadoras Activas
                  </div>
                  <p className="text-xl font-bold tabular-nums">{creators.length}</p>
                  <p className="text-[10px] text-muted-foreground">{totalFans.toLocaleString()} fans activos</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" /> Promedio / Creadora
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {creators.length > 0 ? fmt(grandTotal / creators.length) : "$0"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{totalRows.toLocaleString()} registros</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Última Data
                  </div>
                  <p className="text-xl font-bold tabular-nums">
                    {latestDate ? format(new Date(latestDate + "T12:00:00"), "dd MMM", { locale: es }) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{lastMonth.startStr} → {lastMonth.endStr}</p>
                </div>
              </div>
            )}

            {/* Info banner */}
            {!isLoading && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <strong>Fuente:</strong> Reportes diarios de OnlyFans importados automáticamente. 
                  Plataforma (OF/Unlok) del perfil comercial. Datos deduplicados por creadora + día. 
                  <span className="text-orange-500 dark:text-orange-400 ml-1">⚠ Las filas con "Última data" temprana indican que dejaron de reportar o se fueron.</span>
                </div>
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
              <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-380px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                        <span className="flex items-center gap-1">Creadora <SortIcon col="name" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("platform")}>
                        <span className="flex items-center gap-1">Plataforma <SortIcon col="platform" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("subs")}>
                        <span className="flex items-center gap-1 justify-end">Subs <SortIcon col="subs" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("tips")}>
                        <span className="flex items-center gap-1 justify-end">Tips <SortIcon col="tips" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("messages")}>
                        <span className="flex items-center gap-1 justify-end">Msgs <SortIcon col="messages" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("activeFans")}>
                        <span className="flex items-center gap-1 justify-end">Fans <SortIcon col="activeFans" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("daysWithData")}>
                        <span className="flex items-center gap-1 justify-end">Días <SortIcon col="daysWithData" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastDate")}>
                        <span className="flex items-center gap-1">Última data <SortIcon col="lastDate" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none font-semibold" onClick={() => toggleSort("total")}>
                        <span className="flex items-center gap-1 justify-end">Total Bruto <SortIcon col="total" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creators.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          Sin datos para {label}
                        </TableCell>
                      </TableRow>
                    ) : (
                      creators.map((c, i) => {
                        const stopped = dataStoppedEarly(c.lastDate);
                        const isZero = c.total === 0;
                        return (
                          <TableRow key={c.creatorId} className={isZero ? "opacity-60" : ""}>
                            <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`text-[10px] font-medium ${PLATFORM_COLORS[c.platform] || ""}`}>
                                {c.platform}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.subs)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.tips)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.messages)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.activeFans.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.daysWithData}</TableCell>
                            <TableCell className={`text-sm tabular-nums ${stopped ? "text-orange-500 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}>
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
