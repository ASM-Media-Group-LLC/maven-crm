import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, FileText, Users, TrendingUp, TrendingDown, AlertTriangle,
  ListChecks, BarChart3, X, Wallet, Building2, ArrowDown, Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
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

// Todas las posibles vistas del dialog detalle. Cada uno tiene su propio
// título + lista (alimentada por los datos ya cargados, sin queries extra).
type KpiKey =
  | "ingresos"
  | "costos"
  | "margen"
  | "nominaProy"
  | "comisiones"
  | "facturasPend"
  | "facturasVenc"
  | "variacion"
  | "headcount"
  | "costoEmp"
  | "deducciones"
  | "departamentos"
  | "alertas"
  | "accion-nomina"
  | "accion-comisiones"
  | "accion-invoices"
  | "accion-archivos";

export default function FinanzasDashboard() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));
  const [costCenter, setCostCenter] = useState("");
  const [area, setArea] = useState("");
  const [tipo, setTipo] = useState("ambos");
  const [chartRange, setChartRange] = useState<"3M" | "6M" | "12M">("6M");
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const { data: payroll = [], isLoading: lp } = useQuery({
    queryKey: ["fin-dash-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("id, period_name, status, gross_total, net_total, cost_center, created_at").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading: li } = useQuery({
    queryKey: ["fin-dash-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id, invoice_number, status, amount, fee_amount, net_amount, created_at, payment_method, due_date, recipient_name").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: lc } = useQuery({
    queryKey: ["fin-dash-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("id, status, estimated_amount, final_amount, area, cost_center, created_at, employee_name").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: hrData } = useQuery({
    queryKey: ["fin-hr-personnel"],
    queryFn: async () => {
      const { data: emps, error: e1 } = await supabase.from("employees").select("id, full_name, status, department_id, base_salary, position");
      if (e1) throw e1;
      const activos = (emps ?? []).filter(e => e.status === "activo");
      const depts = new Map<string, number>();
      activos.forEach(e => {
        const d = e.department_id ?? "Sin departamento";
        depts.set(d, (depts.get(d) ?? 0) + 1);
      });

      const now = new Date();
      const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const { data: deductions, error: e2 } = await supabase.from("employee_deductions").select("id, employee_id, amount, reason, month_year").ilike("month_year", `%${monthYear}%`);
      if (e2) throw e2;
      const dedTotal = (deductions ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0);

      const { data: payrollMonth, error: e3 } = await supabase.from("payroll_periods").select("net_total").ilike("period_name", `%${monthYear}%`);
      if (e3) throw e3;
      const netTotal = (payrollMonth ?? []).reduce((s, p) => s + (Number(p.net_total) || 0), 0);
      const costPerEmp = activos.length > 0 ? netTotal / activos.length : 0;

      return {
        headcount: activos.length,
        costPerEmp,
        dedTotal,
        deptCount: depts.size,
        empleados: activos,
        deducciones: deductions ?? [],
        departamentos: Array.from(depts.entries()).map(([name, count]) => ({ name, count })),
      };
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
  const curPayroll = payroll.filter(p => inRange(p.created_at, currentMonthStart, currentMonthEnd));
  const curNomina = curPayroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const curCommissions = commissions.filter(c => inRange(c.created_at, currentMonthStart, currentMonthEnd));
  const curComisiones = curCommissions.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0);
  const curCommissionsPaid = commissions.filter(c => c.status === "pagado" && inRange(c.created_at, currentMonthStart, currentMonthEnd));
  const curCostos = curNomina + curCommissionsPaid.reduce((s, c) => s + (Number(c.final_amount) || 0), 0);
  const curMargen = curIngresos - curCostos;
  const curMargenPct = curIngresos > 0 ? (curMargen / curIngresos) * 100 : 0;

  // Previous month
  const prevIngresos = invoices.filter(i => i.status === "pagada" && inRange(i.created_at, prevMonthStart, prevMonthEnd)).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const prevCostos = payroll.filter(p => inRange(p.created_at, prevMonthStart, prevMonthEnd)).reduce((s, p) => s + (Number(p.net_total) || 0), 0);

  const nominaProyectadaList = payroll.filter(p => (p.status === "borrador" || p.status === "calculado") && inRange(p.created_at, currentMonthStart, currentMonthEnd));
  const nominaProyectada = nominaProyectadaList.reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const facturasPendientesList = invoices.filter(i => i.status === "enviada");
  const facturasVencidasList = invoices.filter(i => i.status === "vencida");
  const facturasPendientes = facturasPendientesList.length;
  const facturasVencidas = facturasVencidasList.length;
  const variacion = pctChange(curIngresos, prevIngresos);

  // Alerts
  const nominaSinCerrarList = payroll.filter(p => p.status === "borrador" || p.status === "calculado");
  const comisionesPorAprobarList = commissions.filter(c => c.status === "proyectado");
  const invoicesPorEnviarList = invoices.filter(i => i.status === "borrador");
  const nominaSinCerrar = nominaSinCerrarList.length;
  const comisionFueraRango = commissions.filter(c => (Number(c.estimated_amount) || 0) > 50000).length;
  const comisionesPorAprobar = comisionesPorAprobarList.length;
  const invoicesPorEnviar = invoicesPorEnviarList.length;

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

  // Resolver datos del popup según el KPI
  const popup = useMemo(() => {
    if (!kpiPopup) return null;
    let title = "";
    let subtitle = "";
    let rows: KpiRow[] = [];

    switch (kpiPopup) {
      case "ingresos":
        title = `Ingresos del Mes — ${fmt(curIngresos)}`;
        subtitle = `${curInvoicesPaid.length} facturas pagadas en ${format(now, "MMMM yyyy", { locale: es })}`;
        rows = curInvoicesPaid.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.payment_method ? `${i.payment_method} · ${format(new Date(i.created_at), "dd MMM", { locale: es })}` : format(new Date(i.created_at), "dd MMM", { locale: es }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "success",
        }));
        break;
      case "costos":
        title = `Costos del Mes — ${fmt(curCostos)}`;
        subtitle = `Nómina (${fmt(curNomina)}) + Comisiones pagadas (${fmt(curCostos - curNomina)})`;
        rows = [
          ...curPayroll.map(p => ({
            primary: `Nómina · ${p.period_name ?? "Sin nombre"}`,
            secondary: `${p.status} · ${p.cost_center ?? "Sin CC"}`,
            right: fmt(Number(p.net_total) || 0),
            rightTone: "destructive" as const,
          })),
          ...curCommissionsPaid.map(c => ({
            primary: `Comisión · ${c.employee_name ?? "Sin nombre"}`,
            secondary: `${c.area ?? "Sin área"} · ${c.cost_center ?? "Sin CC"}`,
            right: fmt(Number(c.final_amount) || 0),
            rightTone: "destructive" as const,
          })),
        ];
        break;
      case "margen":
        title = `Margen Operativo — ${fmt(curMargen)} (${curMargenPct.toFixed(1)}%)`;
        subtitle = `Ingresos ${fmt(curIngresos)} − Costos ${fmt(curCostos)}`;
        rows = [
          { primary: "Ingresos", right: fmt(curIngresos), rightTone: "success" },
          { primary: "Costos", right: fmt(curCostos), rightTone: "destructive" },
          { primary: "Margen", right: fmt(curMargen), rightTone: curMargen >= 0 ? "success" : "destructive" },
          { primary: "Margen %", right: `${curMargenPct.toFixed(1)}%`, rightTone: curMargenPct >= 0 ? "success" : "destructive" },
        ];
        break;
      case "nominaProy":
        title = `Nómina Proyectada — ${fmt(nominaProyectada)}`;
        subtitle = `${nominaProyectadaList.length} batches en borrador o calculado`;
        rows = nominaProyectadaList.map(p => ({
          primary: p.period_name ?? "Sin nombre",
          secondary: `${p.status} · ${p.cost_center ?? "Sin CC"}`,
          right: fmt(Number(p.net_total) || 0),
          rightTone: "warning",
        }));
        break;
      case "comisiones":
        title = `Comisiones Acumuladas — ${fmt(curComisiones)}`;
        subtitle = `${curCommissions.length} registros este mes`;
        rows = curCommissions.map(c => ({
          primary: c.employee_name ?? "Sin nombre",
          secondary: `${c.area ?? "Sin área"} · ${c.status}`,
          right: fmt(Number(c.estimated_amount) || 0),
        }));
        break;
      case "facturasPend":
        title = `Facturas Pendientes — ${facturasPendientes}`;
        subtitle = "Estatus 'enviada', esperando pago";
        rows = facturasPendientesList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.due_date ? `Vence ${format(new Date(i.due_date), "dd MMM yyyy", { locale: es })}` : format(new Date(i.created_at), "dd MMM", { locale: es }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "facturasVenc":
        title = `Facturas Vencidas — ${facturasVencidas}`;
        subtitle = "Requieren atención inmediata";
        rows = facturasVencidasList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.due_date ? `Vencida ${format(new Date(i.due_date), "dd MMM yyyy", { locale: es })}` : format(new Date(i.created_at), "dd MMM", { locale: es }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "destructive",
        }));
        break;
      case "variacion":
        title = `Variación vs Mes Anterior — ${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`;
        subtitle = `Mes actual ${fmt(curIngresos)} vs Mes anterior ${fmt(prevIngresos)}`;
        rows = [
          { primary: format(now, "MMMM yyyy", { locale: es }), right: fmt(curIngresos), rightTone: "success" },
          { primary: format(subMonths(now, 1), "MMMM yyyy", { locale: es }), right: fmt(prevIngresos) },
          { primary: "Diferencia", right: fmt(curIngresos - prevIngresos), rightTone: curIngresos - prevIngresos >= 0 ? "success" : "destructive" },
        ];
        break;
      case "headcount":
        title = `Empleados Activos — ${hrData?.headcount ?? 0}`;
        subtitle = "Headcount con status 'activo'";
        rows = (hrData?.empleados ?? []).map(e => ({
          primary: e.full_name ?? "Sin nombre",
          secondary: e.position ?? "Sin posición",
          right: e.base_salary ? fmt(Number(e.base_salary)) : "—",
        }));
        break;
      case "costoEmp":
        title = `Costo Promedio por Empleado — ${fmt(hrData?.costPerEmp ?? 0)}`;
        subtitle = `Nómina mensual / ${hrData?.headcount ?? 0} empleados activos`;
        rows = [
          { primary: "Headcount", right: String(hrData?.headcount ?? 0) },
          { primary: "Costo promedio mensual", right: fmt(hrData?.costPerEmp ?? 0), rightTone: "default" },
          { primary: "Costo anualizado estimado", right: fmt((hrData?.costPerEmp ?? 0) * 12) },
        ];
        break;
      case "deducciones":
        title = `Deducciones del Mes — ${fmt(hrData?.dedTotal ?? 0)}`;
        subtitle = `${hrData?.deducciones.length ?? 0} deducciones registradas`;
        rows = (hrData?.deducciones ?? []).map(d => ({
          primary: d.reason ?? "Sin concepto",
          secondary: d.month_year ?? "—",
          right: fmt(Number(d.amount) || 0),
          rightTone: "destructive",
        }));
        break;
      case "departamentos":
        title = `Departamentos — ${hrData?.deptCount ?? 0}`;
        subtitle = "Departamentos con empleados activos";
        rows = (hrData?.departamentos ?? []).map(d => ({
          primary: d.name,
          right: `${d.count} emp${d.count === 1 ? "" : "s"}`,
        }));
        break;
      case "alertas":
        title = `Alertas Operativas — ${alerts.length}`;
        subtitle = "Issues activos que requieren atención";
        rows = alerts.map(a => ({
          primary: a.label,
          right: String(a.count),
          rightTone: a.severity,
        }));
        break;
      case "accion-nomina":
        title = `Nómina por Cerrar — ${nominaSinCerrar}`;
        subtitle = "Batches en borrador o calculado";
        rows = nominaSinCerrarList.map(p => ({
          primary: p.period_name ?? "Sin nombre",
          secondary: `${p.status} · ${p.cost_center ?? "Sin CC"}`,
          right: fmt(Number(p.net_total) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-comisiones":
        title = `Comisiones por Aprobar — ${comisionesPorAprobar}`;
        subtitle = "Status 'proyectado'";
        rows = comisionesPorAprobarList.map(c => ({
          primary: c.employee_name ?? "Sin nombre",
          secondary: `${c.area ?? "Sin área"}`,
          right: fmt(Number(c.estimated_amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-invoices":
        title = `Invoices por Enviar — ${invoicesPorEnviar}`;
        subtitle = "Status 'borrador'";
        rows = invoicesPorEnviarList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: format(new Date(i.created_at), "dd MMM yyyy", { locale: es }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-archivos":
        title = "Archivos Bancarios por Generar";
        subtitle = "No hay archivos pendientes";
        rows = [];
        break;
    }

    return { title, subtitle, rows };
  }, [kpiPopup, curInvoicesPaid, curIngresos, curPayroll, curCommissionsPaid, curNomina, curCostos, curMargen, curMargenPct, nominaProyectadaList, nominaProyectada, curCommissions, curComisiones, facturasPendientesList, facturasPendientes, facturasVencidasList, facturasVencidas, variacion, prevIngresos, hrData, alerts, nominaSinCerrarList, nominaSinCerrar, comisionesPorAprobarList, comisionesPorAprobar, invoicesPorEnviarList, invoicesPorEnviar, now]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader title="Dashboard Financiero" subtitle="Vista ejecutiva y operativa consolidada" />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filtros globales */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Centro de Costo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="operaciones">Operaciones</SelectItem>
              <SelectItem value="ventas">Ventas</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={area || undefined} onValueChange={v => setArea(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="chatters">Chatters</SelectItem>
              <SelectItem value="closers">Closers</SelectItem>
              <SelectItem value="tech">Tech</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
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

        {/* 8 KPI Cards — todas con el patrón estándar y onClick → modal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label="Ingresos del Mes" value={fmt(curIngresos)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success" hint={`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}% vs anterior`} onClick={() => setKpiPopup("ingresos")} />
              <StatChip label="Costos del Mes" value={fmt(curCostos)} icon={<TrendingDown className="h-3.5 w-3.5" />} color="bg-destructive" hint={`${pctChange(curCostos, prevCostos) >= 0 ? "+" : ""}${pctChange(curCostos, prevCostos).toFixed(1)}% vs anterior`} onClick={() => setKpiPopup("costos")} />
              <StatChip label="Margen Operativo" value={fmt(curMargen)} icon={<BarChart3 className="h-3.5 w-3.5" />} color={curMargen >= 0 ? "bg-success" : "bg-destructive"} hint={`${curMargenPct.toFixed(1)}% margen`} onClick={() => setKpiPopup("margen")} />
              <StatChip label="Nómina Proyectada" value={fmt(nominaProyectada)} icon={<Users className="h-3.5 w-3.5" />} color="bg-warning" hint="Borrador + calculado" onClick={() => setKpiPopup("nominaProy")} />
              <StatChip label="Comisiones Acumuladas" value={fmt(curComisiones)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" hint={`${curCommissions.length} registros`} onClick={() => setKpiPopup("comisiones")} />
              <StatChip label="Facturas Pendientes" value={String(facturasPendientes)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-warning" hint="Enviadas" onClick={() => setKpiPopup("facturasPend")} />
              <StatChip label="Facturas Vencidas" value={String(facturasVencidas)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-destructive" hint="Requieren atención" onClick={() => setKpiPopup("facturasVenc")} />
              <StatChip label="Variación vs Anterior" value={`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} color={variacion >= 0 ? "bg-success" : "bg-destructive"} hint="Ingresos mes a mes" onClick={() => setKpiPopup("variacion")} />
            </>
          )}
        </div>

        {/* Headcount y Costos de Personal — 4 cards estándar */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            Headcount y Costos de Personal
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatChip label="Empleados Activos" value={String(hrData?.headcount ?? 0)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint="Headcount" onClick={() => setKpiPopup("headcount")} />
            <StatChip label="Costo Prom/Emp" value={fmt(hrData?.costPerEmp ?? 0)} icon={<Briefcase className="h-3.5 w-3.5" />} color="bg-accent" hint="Nómina / headcount" onClick={() => setKpiPopup("costoEmp")} />
            <StatChip label="Deducciones Mes" value={fmt(hrData?.dedTotal ?? 0)} icon={<ArrowDown className="h-3.5 w-3.5" />} color="bg-destructive" hint="Acumuladas" onClick={() => setKpiPopup("deducciones")} />
            <StatChip label="Departamentos" value={String(hrData?.deptCount ?? 0)} icon={<Building2 className="h-3.5 w-3.5" />} color="bg-success" hint="Con empleados activos" onClick={() => setKpiPopup("departamentos")} />
          </div>
        </div>

        {/* Flujo de Dinero — chart se queda como está, no es un KPI clickeable */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Wallet className="h-4 w-4 text-muted-foreground" />Flujo de Dinero
            </h2>
            <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5">
              {(["3M", "6M", "12M"] as const).map(r => (
                <Button key={r} variant={chartRange === r ? "secondary" : "ghost"} size="sm" className="h-6 text-xs px-2" onClick={() => setChartRange(r)}>{r}</Button>
              ))}
            </div>
          </div>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas Operativas — card resumen clickeable */}
          <StatChip
            label="Alertas Operativas"
            value={String(alerts.length)}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            color={alerts.length > 0 ? "bg-warning" : "bg-muted-foreground"}
            hint={alerts.length === 0 ? "Sin alertas activas" : "Click para ver detalle"}
            onClick={() => setKpiPopup("alertas")}
            className="lg:col-span-1"
          />

          {/* Próximas Acciones — 4 cards en mini grid */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              Próximas Acciones
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatChip label="Nómina por cerrar" value={String(nominaSinCerrar)} icon={<Users className="h-3.5 w-3.5" />} color="bg-warning" onClick={() => setKpiPopup("accion-nomina")} />
              <StatChip label="Comisiones por aprobar" value={String(comisionesPorAprobar)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("accion-comisiones")} />
              <StatChip label="Invoices por enviar" value={String(invoicesPorEnviar)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-accent" onClick={() => setKpiPopup("accion-invoices")} />
              <StatChip label="Archivos bancarios" value="0" icon={<FileText className="h-3.5 w-3.5" />} color="bg-muted-foreground" hint="Por generar" onClick={() => setKpiPopup("accion-archivos")} />
            </div>
          </div>
        </div>
      </div>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={popup?.title ?? ""}
        subtitle={popup?.subtitle}
        rows={popup?.rows ?? []}
      />
    </div>
  );
}
