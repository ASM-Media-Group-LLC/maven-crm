import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreatorDailyEarnings } from "@/hooks/useCreatorDailyEarnings";
import CreatorEarningsCalendar from "./CreatorEarningsCalendar";

interface Props {
  creatorId: string;
}

const money2 = (n: number | null) =>
  n != null ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const money0 = (n: number) => `$${Math.round(n || 0).toLocaleString("en-US")}`;

const MonetizacionTabContent = ({ creatorId }: Props) => {
  // ── Ingreso diario desde BLU (creator_daily_earnings), MES ACTUAL ──
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const pad = (n: number) => String(n).padStart(2, "0");
  const fromDate = `${year}-${pad(month + 1)}-01`;
  const toDate = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const { data: daily = [], isLoading: loadingDaily } = useCreatorDailyEarnings(creatorId, fromDate, toDate);

  const sum = (k: keyof (typeof daily)[number]) => daily.reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const totalGross = sum("total_gross");
  const channels: Array<[string, keyof (typeof daily)[number]]> = [
    ["Suscripciones", "subscription_gross"], ["Mensajes", "message_gross"], ["Tips", "tips_gross"],
    ["Posts (PPV)", "post_gross"], ["Referidos", "referral_gross"], ["Streams", "stream_gross"],
  ];

  // ── Monetización mensual (manual, tabla existente) ──
  const { data: records, isLoading } = useQuery({
    queryKey: ["creator_monetization", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_monetization")
        .select("id, month_year, amount, notes")
        .eq("creator_id", creatorId)
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const formatMonth = (monthYear: string) => {
    try {
      return format(parseISO(monthYear), "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase());
    } catch {
      return monthYear;
    }
  };

  return (
    <div className="space-y-4">
      {/* Ingresos OnlyFans (BLU) — diario, se llena solo (micro blu-bridge). RLS de
          management: sin acceso/datos muestra el estado vacío (no rompe). */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Ingresos OnlyFans (BLU)
          </CardTitle>
          <CardDescription>Gross diario · este mes</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDaily ? (
            <Skeleton className="h-24 w-full" />
          ) : daily.length > 0 ? (
            <div className="space-y-4">
              {/* Total del período + desglose por canal */}
              <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                <div>
                  <div className="text-xs text-muted-foreground">Total del mes</div>
                  <div className="text-2xl font-bold tabular-nums">{money0(totalGross)}</div>
                </div>
                <div className="text-xs text-muted-foreground pb-1">{daily.length} días con ingreso</div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {channels.filter(([, k]) => sum(k) > 0).map(([label, k]) => (
                  <div key={String(k)} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="text-sm font-semibold tabular-nums">{money0(sum(k))}</div>
                  </div>
                ))}
              </div>
              {/* Calendario del mes con 🔥 (mejor de cada 5 días) + 👑 (mejor del mes) */}
              <CreatorEarningsCalendar daily={daily} year={year} month={month} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sin datos de ingresos (BLU) en los últimos 30 días.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Monetización mensual (manual, existente) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5" />
            Monetización Mensual
          </CardTitle>
          <CardDescription>Histórico de monetización por mes (carga manual)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : records && records.length > 0 ? (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatMonth(r.month_year)}</TableCell>
                      <TableCell>{money2(r.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No hay datos de monetización registrados
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MonetizacionTabContent;
