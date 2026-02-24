import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

const TABS = ["Ingresos vs Costos", "Costos por CC", "Productividad por Empleado", "Márgenes Operativos"] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ControlFinancieroPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Ingresos vs Costos");

  const { data: payroll = [], isLoading: lp } = useQuery({
    queryKey: ["control-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("net_total, status").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading: li } = useQuery({
    queryKey: ["control-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("amount, net_amount, status").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: lc } = useQuery({
    queryKey: ["control-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("estimated_amount, final_amount, status").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = lp || li || lc;

  const ingresos = invoices.filter(i => i.status === "pagada").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const egresos = payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0) +
    commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0);
  const balance = ingresos - egresos;

  const conceptos = [
    { concepto: "Nómina", actual: payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0), anterior: 0 },
    { concepto: "Facturación (Pagada)", actual: ingresos, anterior: 0 },
    { concepto: "Comisiones (Pagadas)", actual: commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0), anterior: 0 },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Control Financiero</h1>
        <p className="text-sm text-muted-foreground">Vista analítica consolidada de ingresos, egresos y balance</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
          ))}
        </div>

        {activeTab !== "Ingresos vs Costos" ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">Próximamente: {activeTab}</p>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Ingresos Totales" value={fmt(ingresos)} icon={TrendingUp} subtitle="Invoices pagados" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Egresos Totales" value={fmt(egresos)} icon={TrendingDown} subtitle="Nómina + comisiones" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
              <DashboardMetricCard label="Balance" value={fmt(balance)} icon={DollarSign} subtitle={balance >= 0 ? "Positivo" : "Negativo"} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" valueColor={balance < 0 ? "text-destructive" : "text-accent"} />
              <DashboardMetricCard label="Variación" value="—" icon={BarChart3} subtitle="vs mes anterior" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" />
            </>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b">
                <TableHead className="text-xs font-medium text-muted-foreground">Concepto</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Mes Anterior</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Mes Actual</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Variación</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conceptos.map(c => (
                <TableRow key={c.concepto}>
                  <TableCell className="text-sm font-medium">{c.concepto}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(c.anterior)}</TableCell>
                  <TableCell className="text-sm font-medium">{fmt(c.actual)}</TableCell>
                  <TableCell className="text-sm">—</TableCell>
                  <TableCell><Badge variant="secondary">Actual</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
