import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

const TABS = ["Ingresos vs Costos", "Costos por CC", "Productividad por Empleado", "Márgenes Operativos"] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ControlFinancieroPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Ingresos vs Costos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [ccFilter, setCcFilter] = useState("");

  const { data: payroll = [], isLoading: lp } = useQuery({
    queryKey: ["control-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("net_total, gross_total, status, cost_center, total_employees").limit(500);
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

  const { data: employees = [], isLoading: le } = useQuery({
    queryKey: ["control-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, base_salary, status").eq("status", "activo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payrollDetails = [], isLoading: ld } = useQuery({
    queryKey: ["control-payroll-details"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_details").select("employee_id, overtime_hours, overtime_amount, net_total").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = lp || li || lc;

  const ingresos = invoices.filter(i => i.status === "pagada").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const egresos = payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0) +
    commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0);
  const balance = ingresos - egresos;
  const margenPct = ingresos > 0 ? ((balance / ingresos) * 100).toFixed(1) : "0";

  // Costos por CC
  const ccGroups = payroll.reduce((acc, p) => {
    const cc = p.cost_center || "Sin CC";
    acc[cc] = (acc[cc] || 0) + (Number(p.net_total) || 0);
    return acc;
  }, {} as Record<string, number>);

  // Productividad
  const empProductivity = employees.map(e => {
    const empDetails = payrollDetails.filter(d => d.employee_id === e.id);
    const totalCost = empDetails.reduce((s, d) => s + (Number(d.net_total) || 0), 0) || Number(e.base_salary) || 0;
    const totalHours = empDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
    return { name: `${e.first_name} ${e.last_name}`, salary: Number(e.base_salary) || 0, cost: totalCost, hours: totalHours, ratio: totalHours > 0 ? totalCost / totalHours : 0 };
  });

  const renderTab = () => {
    switch (activeTab) {
      case "Costos por CC":
        return (
          <div className="space-y-5">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Centro de Costo</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {Object.entries(ccGroups).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin datos de centros de costo.</TableCell></TableRow>
                  ) : Object.entries(ccGroups).map(([cc, total]) => (
                    <TableRow key={cc} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{cc}</TableCell>
                      <TableCell className="text-sm">{fmt(total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{egresos > 0 ? ((total / egresos) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      case "Productividad por Empleado":
        return (
          <div className="space-y-5">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Salario</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Horas Extra</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Costo Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Ratio $/h</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {empProductivity.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin empleados activos.</TableCell></TableRow>
                  ) : empProductivity.map((e, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{e.name}</TableCell>
                      <TableCell className="text-sm">{fmt(e.salary)}</TableCell>
                      <TableCell className="text-sm">{e.hours}h</TableCell>
                      <TableCell className="text-sm">{fmt(e.cost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.ratio > 0 ? fmt(e.ratio) + "/h" : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      case "Márgenes Operativos":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DashboardMetricCard label="Margen Bruto" value={`${margenPct}%`} icon={TrendingUp} subtitle={fmt(balance)} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" valueColor={balance >= 0 ? "text-accent" : "text-destructive"} />
              <DashboardMetricCard label="Ingresos" value={fmt(ingresos)} icon={DollarSign} subtitle="Invoices pagados" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Egresos" value={fmt(egresos)} icon={TrendingDown} subtitle="Nómina + comisiones" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Concepto</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% sobre Ingresos</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="text-sm font-medium">Nómina</TableCell>
                    <TableCell className="text-sm">{fmt(payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ingresos > 0 ? ((payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0) / ingresos) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="text-sm font-medium">Comisiones</TableCell>
                    <TableCell className="text-sm">{fmt(commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ingresos > 0 ? ((commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0) / ingresos) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30 font-semibold">
                    <TableCell className="text-sm">Margen Neto</TableCell>
                    <TableCell className="text-sm">{fmt(balance)}</TableCell>
                    <TableCell className="text-sm">{margenPct}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        );
      default: // Ingresos vs Costos
        return (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <DashboardMetricCard label="Ingresos Totales" value={fmt(ingresos)} icon={TrendingUp} subtitle="Invoices pagados" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
                  <DashboardMetricCard label="Egresos Totales" value={fmt(egresos)} icon={TrendingDown} subtitle="Nómina + comisiones" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
                  <DashboardMetricCard label="Balance" value={fmt(balance)} icon={DollarSign} subtitle={balance >= 0 ? "Positivo" : "Negativo"} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" valueColor={balance < 0 ? "text-destructive" : "text-accent"} />
                  <DashboardMetricCard label="Margen" value={`${margenPct}%`} icon={BarChart3} subtitle="Sobre ingresos" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Concepto</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Mes Actual</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">Nómina</TableCell><TableCell className="text-sm">{fmt(payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0))}</TableCell><TableCell><Badge variant="secondary">Actual</Badge></TableCell></TableRow>
                  <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">Facturación (Pagada)</TableCell><TableCell className="text-sm">{fmt(ingresos)}</TableCell><TableCell><Badge variant="secondary">Actual</Badge></TableCell></TableRow>
                  <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">Comisiones (Pagadas)</TableCell><TableCell className="text-sm">{fmt(commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0))}</TableCell><TableCell><Badge variant="secondary">Actual</Badge></TableCell></TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Control Financiero</h1>
        <p className="text-sm text-muted-foreground">Vista analítica consolidada</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
            {TABS.map(t => (
              <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
            ))}
          </div>
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        </div>
        {renderTab()}
      </div>
    </div>
  );
}
