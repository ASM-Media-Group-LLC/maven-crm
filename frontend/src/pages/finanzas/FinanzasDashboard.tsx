import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  DollarSign, FileText, Users, TrendingUp, TrendingDown, AlertTriangle,
  ListChecks, BarChart3, X, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from "recharts";
import { startOfMonth, endOfMonth, subMonths, format, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function HRPersonnelCards() {
  const navigate = useNavigate();

  const { data: hrData } = useQuery({
    queryKey: ["fin-hr-personnel"],
    queryFn: async () => {
      const { data: emps, error: e1 } = await supabase.from("employees").select("id, status, department_id, base_salary");
      if (e1) throw e1;
      const activos = (emps ?? []).filter(e => e.status === "activo");
      const depts = new Set(activos.map(e => e.department_id).filter(Boolean));

      const now = new Date();
      const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const { data: deductions, error: e2 } = await supabase.from("employee_deductions").select("amount").ilike("month_year", `%${monthYear}%`);
      if (e2) throw e2;
      const dedTotal = (deductions ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0);

      const { data: payroll, error: e3 } = await supabase.from("payroll_periods").select("net_total").ilike("period_name", `%${monthYear}%`);
      if (e3) throw e3;
      const netTotal = (payroll ?? []).reduce((s, p) => s + (Number(p.net_total) || 0), 0);
      const costPerEmp = activos.length > 0 ? netTotal / activos.length : 0;

      return { headcount: activos.length, costPerEmp, dedTotal, deptCount: depts.size };
    },
  });

  const cards = [
    { label: "Empleados Activos", value: String(hrData?.headcount ?? 0), icon: Users, sub: "Headcount", path: "/hr" },
    { label: "Costo Prom/Emp", value: fmt(hrData?.costPerEmp ?? 0), icon: Users, sub: "Nómina / headcount", path: "/finanzas/nomina" },
    { label: "Deducciones Mes", value: fmt(hrData?.dedTotal ?? 0), icon: TrendingDown, sub: "Acumuladas", path: "/hr/deducciones" },
    { label: "Departamentos", value: String(hrData?.deptCount ?? 0), icon: Users, sub: "Con empleados activos", path: "/hr/organigrama" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />Headcount y Costos de Personal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(c => (
            <DashboardMetricCard
              key={c.label}
              label={c.label}
              value={c.value}
              icon={c.icon}
              subtitle={c.sub}
              color="primary"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanzasDashboard() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));
  const [costCenter, setCostCenter] = useState("");
  const [area, setArea] = useState("");
  const [tipo, setTipo] = useState("ambos");
  const [chartRange, setChartRange] = useState<"3M" | "6M" | "12M">("6M");

  const { data: payroll = [], isLoading: lp } = useQuery({
    queryKey: ["fin-dash-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("status, gross_total, net_total, cost_center, created_at").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading: li } = useQuery({
    queryKey: ["fin-dash-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("status, amount, fee_amount, net_amount, created_at, payment_method").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: lc } = useQuery({
    queryKey: ["fin-dash-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("status, estimated_amount, final_amount, area, cost_center, created_at").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = lp || li || lc;

  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const inRange = (d: string, from: Date, to: Date) => {
    try { return isWithinInterval(new Date(d), { start: from, end: to }); } catch { return false; }
  };

  // Current month
  const curInvoicesPaid = invoices.filter(i => i.status === "pagada" && inRange(i.created_at, currentMonthStart, currentMonthEnd));
  const curIngresos = curInvoicesPaid.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const curNomina = payroll.filter(p => inRange(p.created_at, currentMonthStart, currentMonthEnd)).reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const curComisiones = commissions.filter(c => inRange(c.created_at, currentMonthStart, currentMonthEnd)).reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0);
  const curCostos = curNomina + commissions.filter(c => c.status === "pagado" && inRange(c.created_at, currentMonthStart, currentMonthEnd)).reduce((s, c) => s + (Number(c.final_amount) || 0), 0);
  const curMargen = curIngresos - curCostos;
  const curMargenPct = curIngresos > 0 ? (curMargen / curIngresos) * 100 : 0;

  // Previous month
  const prevIngresos = invoices.filter(i => i.status === "pagada" && inRange(i.created_at, prevMonthStart, prevMonthEnd)).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const prevCostos = payroll.filter(p => inRange(p.created_at, prevMonthStart, prevMonthEnd)).reduce((s, p) => s + (Number(p.net_total) || 0), 0);

  const nominaProyectada = payroll.filter(p => (p.status === "borrador" || p.status === "calculado") && inRange(p.created_at, currentMonthStart, currentMonthEnd)).reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const facturasPendientes = invoices.filter(i => i.status === "enviada").length;
  const facturasVencidas = invoices.filter(i => i.status === "vencida").length;
  const variacion = pctChange(curIngresos, prevIngresos);

  // Alerts
  const nominaSinCerrar = payroll.filter(p => p.status === "borrador" || p.status === "calculado").length;
  const comisionFueraRango = commissions.filter(c => (Number(c.estimated_amount) || 0) > 50000).length;
  const comisionesPorAprobar = commissions.filter(c => c.status === "proyectado").length;
  const invoicesPorEnviar = invoices.filter(i => i.status === "borrador").length;

  const alerts = useMemo(() => {
    const list: { label: string; count: number; severity: "destructive" | "warning" | "default" }[] = [];
    if (facturasVencidas > 0) list.push({ label: "Facturas vencidas", count: facturasVencidas, severity: "destructive" });
    if (nominaSinCerrar > 0) list.push({ label: "Batch de nómina sin cerrar", count: nominaSinCerrar, severity: "warning" });
    if (comisionFueraRango > 0) list.push({ label: "Comisión fuera de rango", count: comisionFueraRango, severity: "warning" });
    if (facturasPendientes > 0) list.push({ label: "Pagos pendientes de ejecutar", count: facturasPendientes, severity: "default" });
    return list;
  }, [facturasVencidas, nominaSinCerrar, comisionFueraRango, facturasPendientes]);

  // Chart data
  const chartMonths = chartRange === "3M" ? 3 : chartRange === "6M" ? 6 : 12;
  const chartData = useMemo(() => {
    return Array.from({ length: chartMonths }).map((_, i) => {
      const m = subMonths(now, chartMonths - 1 - i);
      const ms = startOfMonth(m);
      const me = endOfMonth(m);
      const ing = invoices.filter(inv => inv.status === "pagada" && inRange(inv.created_at, ms, me)).reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
      const cos = payroll.filter(p => inRange(p.created_at, ms, me)).reduce((s, p) => s + (Number(p.net_total) || 0), 0) +
        commissions.filter(c => c.status === "pagado" && inRange(c.created_at, ms, me)).reduce((s, c) => s + (Number(c.final_amount) || 0), 0);
      return { name: format(m, "MMM yy", { locale: es }), Ingresos: ing, Costos: cos };
    });
  }, [invoices, payroll, commissions, chartMonths]);

  const hasFilters = costCenter || area || tipo !== "ambos";

  const actions = [
    { label: "Nómina por cerrar", count: nominaSinCerrar, path: "/finanzas/nomina" },
    { label: "Comisiones por aprobar", count: comisionesPorAprobar, path: "/finanzas/horas-variables" },
    { label: "Invoices por enviar", count: invoicesPorEnviar, path: "/finanzas/facturacion/invoices" },
    { label: "Archivos bancarios por generar", count: 0, path: "/finanzas/nomina" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard Financiero</h1>
        <p className="text-sm text-muted-foreground">Vista ejecutiva y operativa consolidada</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filtros globales */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Centro de Costo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="operaciones">Operaciones</SelectItem>
              <SelectItem value="ventas">Ventas</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={area || undefined} onValueChange={v => setArea(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="chatters">Chatters</SelectItem>
              <SelectItem value="closers">Closers</SelectItem>
              <SelectItem value="tech">Tech</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">Ambos</SelectItem>
              <SelectItem value="ingresos">Ingresos</SelectItem>
              <SelectItem value="egresos">Egresos</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setCostCenter(""); setArea(""); setTipo("ambos"); }}>
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          )}
        </div>

        {/* 8 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Ingresos del Mes" value={fmt(curIngresos)} icon={TrendingUp} subtitle={`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}% vs mes anterior`} color="accent" />
              <DashboardMetricCard label="Costos del Mes" value={fmt(curCostos)} icon={TrendingDown} subtitle={`${pctChange(curCostos, prevCostos) >= 0 ? "+" : ""}${pctChange(curCostos, prevCostos).toFixed(1)}% vs anterior`} color="destructive" />
              <DashboardMetricCard label="Margen Operativo" value={fmt(curMargen)} icon={BarChart3} subtitle={`${curMargenPct.toFixed(1)}% margen`} color={curMargen >= 0 ? "accent" : "destructive"} />
              <DashboardMetricCard label="Nómina Proyectada" value={fmt(nominaProyectada)} icon={Users} subtitle="Borrador + calculado" color="warning" />
              <DashboardMetricCard label="Comisiones Acumuladas" value={fmt(curComisiones)} icon={DollarSign} subtitle={`${commissions.filter(c => inRange(c.created_at, currentMonthStart, currentMonthEnd)).length} registros`} color="primary" />
              <DashboardMetricCard label="Facturas Pendientes" value={String(facturasPendientes)} icon={FileText} subtitle="Enviadas" color="warning" />
              <DashboardMetricCard label="Facturas Vencidas" value={String(facturasVencidas)} icon={AlertTriangle} subtitle="Requieren atención" color="destructive" />
              <DashboardMetricCard label="Variación vs Anterior" value={`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`} icon={TrendingUp} subtitle="Ingresos mes a mes" color={variacion >= 0 ? "accent" : "destructive"} />
            </>
          )}
        </div>

        {/* Headcount y Costos de Personal */}
        <HRPersonnelCards />

        {/* Flujo de Dinero */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />Flujo de Dinero
              </CardTitle>
              <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5">
                {(["3M", "6M", "12M"] as const).map(r => (
                  <Button key={r} variant={chartRange === r ? "secondary" : "ghost"} size="sm" className="h-6 text-xs px-2" onClick={() => setChartRange(r)}>{r}</Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                  <Legend />
                  <Bar dataKey="Ingresos" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Costos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas Operativas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />Alertas Operativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin alertas activas ✓</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-sm">{a.label}</span>
                      <Badge variant={a.severity === "destructive" ? "destructive" : a.severity === "warning" ? "secondary" : "outline"}>{a.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Próximas Acciones */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />Próximas Acciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <button key={i} onClick={() => navigate(a.path)} className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-left">
                    <span className="text-sm">{a.label}</span>
                    <Badge variant={a.count > 0 ? "default" : "outline"}>{a.count}</Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
