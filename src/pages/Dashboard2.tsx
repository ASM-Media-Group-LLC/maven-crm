import { useMemo } from "react";
import { startOfMonth, subMonths, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { useEarningsData } from "./sales-performance/useEarningsData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface CreatorSummary {
  creatorId: string;
  name: string;
  total: number;
  subs: number;
  tips: number;
  messages: number;
}

const Dashboard2 = () => {
  const { data: allRows = [], isLoading } = useEarningsData();

  const lastMonth = useMemo(() => {
    const now = new Date();
    const m = subMonths(now, 1);
    const y = m.getFullYear();
    const mo = m.getMonth(); // 0-indexed
    const startStr = `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const endStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startStr, endStr, month: m };
  }, []);

  const label = useMemo(
    () =>
      format(lastMonth.month, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) =>
        c.toUpperCase()
      ),
    [lastMonth]
  );

  const creators = useMemo(() => {
    const map = new Map<string, CreatorSummary>();

    for (const r of allRows) {
      const d = r.effective_date; // string "YYYY-MM-DD"
      if (d < lastMonth.startStr || d > lastMonth.endStr) continue;

      const key = r.creator_id || r.pending_creator || r.id;
      const existing = map.get(key);

      if (existing) {
        existing.total += r.total_earnings_gross ?? 0;
        existing.subs += r.subscription_gross ?? 0;
        existing.tips += r.tips_gross ?? 0;
        existing.messages += r.message_gross ?? 0;
      } else {
        map.set(key, {
          creatorId: key,
          name: r.artistic_name || r.pending_creator || "Sin nombre",
          total: r.total_earnings_gross ?? 0,
          subs: r.subscription_gross ?? 0,
          tips: r.tips_gross ?? 0,
          messages: r.message_gross ?? 0,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allRows, lastMonth]);

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const grandTotal = creators.reduce((s, c) => s + c.total, 0);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Ventas por Creadora — {label}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {creators.length} creadoras · Total: {fmt(grandTotal)}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-220px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Creadora</TableHead>
                      <TableHead className="text-right">Suscripciones</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                      <TableHead className="text-right">Mensajes</TableHead>
                      <TableHead className="text-right font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creators.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          Sin datos para {label}
                        </TableCell>
                      </TableRow>
                    ) : (
                      creators.map((c, i) => (
                        <TableRow key={c.creatorId}>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.subs)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.tips)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.messages)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {fmt(c.total)}
                          </TableCell>
                        </TableRow>
                      ))
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
