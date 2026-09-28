import { useState, useMemo, useCallback } from "react";
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
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { Formato } from "@/lib/formato";
import { estadoComision, estadoNomina, metodoDePago } from "./estados";

function fmtMonto(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
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
  const f = useFormato();
  const { t } = useLanguage();
  const fmt = useCallback((n: number) => fmtMonto(n, f), [f]);
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
        // "" = sin departamento; la etiqueta se pone al dibujar, en el idioma de la pantalla.
        const d = e.department_id ?? "";
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
    if (facturasVencidas > 0) list.push({ label: t("finanzas.dash.alert.overdue"), count: facturasVencidas, severity: "destructive" });
    if (nominaSinCerrar > 0) list.push({ label: t("finanzas.dash.alert.payrollOpen"), count: nominaSinCerrar, severity: "warning" });
    if (comisionFueraRango > 0) list.push({ label: t("finanzas.dash.alert.commissionRange"), count: comisionFueraRango, severity: "warning" });
    if (facturasPendientes > 0) list.push({ label: t("finanzas.dash.alert.paymentsPending"), count: facturasPendientes, severity: "default" });
    return list;
  }, [facturasVencidas, nominaSinCerrar, comisionFueraRango, facturasPendientes, t]);

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
      return { name: format(m, "MMM yy", { locale: f.fechas }), ingresos: ing, costos: cos };
    });
  }, [invoices, payroll, commissions, chartMonths, f]);

  const hasFilters = costCenter || area || tipo !== "ambos";

  // Resolver datos del popup según el KPI
  const popup = useMemo(() => {
    if (!kpiPopup) return null;
    let title = "";
    let subtitle = "";
    let rows: KpiRow[] = [];
    const sinNombre = t("finanzas.common.noName");
    const sinCC = t("finanzas.common.noCC");
    const sinArea = t("finanzas.common.noArea");
    const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

    switch (kpiPopup) {
      case "ingresos":
        title = t("finanzas.dash.popup.revenue", { amount: fmt(curIngresos) });
        subtitle = t("finanzas.dash.popup.revenueSub", { n: curInvoicesPaid.length, month: format(now, "MMMM yyyy", { locale: f.fechas }) });
        rows = curInvoicesPaid.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.payment_method ? `${metodoDePago(t, i.payment_method)} · ${format(new Date(i.created_at), "dd MMM", { locale: f.fechas })}` : format(new Date(i.created_at), "dd MMM", { locale: f.fechas }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "success",
        }));
        break;
      case "costos":
        title = t("finanzas.dash.popup.costs", { amount: fmt(curCostos) });
        subtitle = t("finanzas.dash.popup.costsSub", { payroll: fmt(curNomina), commissions: fmt(curCostos - curNomina) });
        rows = [
          ...curPayroll.map(p => ({
            primary: t("finanzas.dash.row.payroll", { name: p.period_name ?? sinNombre }),
            secondary: `${estadoNomina(t, p.status)} · ${p.cost_center ?? sinCC}`,
            right: fmt(Number(p.net_total) || 0),
            rightTone: "destructive" as const,
          })),
          ...curCommissionsPaid.map(c => ({
            primary: t("finanzas.dash.row.commission", { name: c.employee_name ?? sinNombre }),
            secondary: `${c.area ?? sinArea} · ${c.cost_center ?? sinCC}`,
            right: fmt(Number(c.final_amount) || 0),
            rightTone: "destructive" as const,
          })),
        ];
        break;
      case "margen":
        title = t("finanzas.dash.popup.margin", { amount: fmt(curMargen), pct: curMargenPct.toFixed(1) });
        subtitle = t("finanzas.dash.popup.marginSub", { revenue: fmt(curIngresos), costs: fmt(curCostos) });
        rows = [
          { primary: t("finanzas.common.revenue"), right: fmt(curIngresos), rightTone: "success" },
          { primary: t("finanzas.common.costs"), right: fmt(curCostos), rightTone: "destructive" },
          { primary: t("finanzas.common.margin"), right: fmt(curMargen), rightTone: curMargen >= 0 ? "success" : "destructive" },
          { primary: t("finanzas.common.marginPct"), right: `${curMargenPct.toFixed(1)}%`, rightTone: curMargenPct >= 0 ? "success" : "destructive" },
        ];
        break;
      case "nominaProy":
        title = t("finanzas.dash.popup.projectedPayroll", { amount: fmt(nominaProyectada) });
        subtitle = t("finanzas.dash.popup.projectedPayrollSub", { n: nominaProyectadaList.length });
        rows = nominaProyectadaList.map(p => ({
          primary: p.period_name ?? sinNombre,
          secondary: `${estadoNomina(t, p.status)} · ${p.cost_center ?? sinCC}`,
          right: fmt(Number(p.net_total) || 0),
          rightTone: "warning",
        }));
        break;
      case "comisiones":
        title = t("finanzas.dash.popup.commissions", { amount: fmt(curComisiones) });
        subtitle = t("finanzas.dash.popup.commissionsSub", { n: curCommissions.length });
        rows = curCommissions.map(c => ({
          primary: c.employee_name ?? sinNombre,
          secondary: `${c.area ?? sinArea} · ${estadoComision(t, c.status)}`,
          right: fmt(Number(c.estimated_amount) || 0),
        }));
        break;
      case "facturasPend":
        title = t("finanzas.dash.popup.pendingInvoices", { n: facturasPendientes });
        subtitle = t("finanzas.dash.popup.pendingInvoicesSub");
        rows = facturasPendientesList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.due_date ? t("finanzas.dash.row.due", { date: format(new Date(i.due_date), "dd MMM yyyy", { locale: f.fechas }) }) : format(new Date(i.created_at), "dd MMM", { locale: f.fechas }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "facturasVenc":
        title = t("finanzas.dash.popup.overdueInvoices", { n: facturasVencidas });
        subtitle = t("finanzas.dash.popup.overdueInvoicesSub");
        rows = facturasVencidasList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: i.due_date ? t("finanzas.dash.row.overdueSince", { date: format(new Date(i.due_date), "dd MMM yyyy", { locale: f.fechas }) }) : format(new Date(i.created_at), "dd MMM", { locale: f.fechas }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "destructive",
        }));
        break;
      case "variacion":
        title = t("finanzas.dash.popup.change", { pct: pct(variacion) });
        subtitle = t("finanzas.dash.popup.changeSub", { current: fmt(curIngresos), previous: fmt(prevIngresos) });
        rows = [
          { primary: format(now, "MMMM yyyy", { locale: f.fechas }), right: fmt(curIngresos), rightTone: "success" },
          { primary: format(subMonths(now, 1), "MMMM yyyy", { locale: f.fechas }), right: fmt(prevIngresos) },
          { primary: t("finanzas.dash.row.difference"), right: fmt(curIngresos - prevIngresos), rightTone: curIngresos - prevIngresos >= 0 ? "success" : "destructive" },
        ];
        break;
      case "headcount":
        title = t("finanzas.dash.popup.activeEmployees", { n: hrData?.headcount ?? 0 });
        subtitle = t("finanzas.dash.popup.activeEmployeesSub");
        rows = (hrData?.empleados ?? []).map(e => ({
          primary: e.full_name ?? sinNombre,
          secondary: e.position ?? t("finanzas.dash.row.noPosition"),
          right: e.base_salary ? fmt(Number(e.base_salary)) : "—",
        }));
        break;
      case "costoEmp":
        title = t("finanzas.dash.popup.avgCost", { amount: fmt(hrData?.costPerEmp ?? 0) });
        subtitle = t("finanzas.dash.popup.avgCostSub", { n: hrData?.headcount ?? 0 });
        rows = [
          { primary: "Headcount", right: String(hrData?.headcount ?? 0) },
          { primary: t("finanzas.dash.row.avgMonthlyCost"), right: fmt(hrData?.costPerEmp ?? 0), rightTone: "default" },
          { primary: t("finanzas.dash.row.annualizedCost"), right: fmt((hrData?.costPerEmp ?? 0) * 12) },
        ];
        break;
      case "deducciones":
        title = t("finanzas.dash.popup.deductions", { amount: fmt(hrData?.dedTotal ?? 0) });
        subtitle = t("finanzas.dash.popup.deductionsSub", { n: hrData?.deducciones.length ?? 0 });
        rows = (hrData?.deducciones ?? []).map(d => ({
          primary: d.reason ?? t("finanzas.dash.row.noConcept"),
          secondary: d.month_year ?? "—",
          right: fmt(Number(d.amount) || 0),
          rightTone: "destructive",
        }));
        break;
      case "departamentos":
        title = t("finanzas.dash.popup.departments", { n: hrData?.deptCount ?? 0 });
        subtitle = t("finanzas.dash.popup.departmentsSub");
        rows = (hrData?.departamentos ?? []).map(d => ({
          primary: d.name || t("finanzas.common.noDepartment"),
          right: t(d.count === 1 ? "finanzas.dash.row.empOne" : "finanzas.dash.row.empOther", { n: d.count }),
        }));
        break;
      case "alertas":
        title = t("finanzas.dash.popup.alerts", { n: alerts.length });
        subtitle = t("finanzas.dash.popup.alertsSub");
        rows = alerts.map(a => ({
          primary: a.label,
          right: String(a.count),
          rightTone: a.severity,
        }));
        break;
      case "accion-nomina":
        title = t("finanzas.dash.popup.payrollToClose", { n: nominaSinCerrar });
        subtitle = t("finanzas.dash.popup.payrollToCloseSub");
        rows = nominaSinCerrarList.map(p => ({
          primary: p.period_name ?? sinNombre,
          secondary: `${estadoNomina(t, p.status)} · ${p.cost_center ?? sinCC}`,
          right: fmt(Number(p.net_total) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-comisiones":
        title = t("finanzas.dash.popup.commissionsToApprove", { n: comisionesPorAprobar });
        subtitle = t("finanzas.dash.popup.commissionsToApproveSub");
        rows = comisionesPorAprobarList.map(c => ({
          primary: c.employee_name ?? sinNombre,
          secondary: `${c.area ?? sinArea}`,
          right: fmt(Number(c.estimated_amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-invoices":
        title = t("finanzas.dash.popup.invoicesToSend", { n: invoicesPorEnviar });
        subtitle = t("finanzas.dash.popup.invoicesToSendSub");
        rows = invoicesPorEnviarList.map(i => ({
          primary: i.recipient_name || `Invoice ${i.invoice_number ?? i.id.slice(0, 8)}`,
          secondary: format(new Date(i.created_at), "dd MMM yyyy", { locale: f.fechas }),
          right: fmt(Number(i.amount) || 0),
          rightTone: "warning",
        }));
        break;
      case "accion-archivos":
        title = t("finanzas.dash.popup.bankFiles");
        subtitle = t("finanzas.dash.popup.bankFilesSub");
        rows = [];
        break;
    }

    return { title, subtitle, rows };
  }, [kpiPopup, curInvoicesPaid, curIngresos, curPayroll, curCommissionsPaid, curNomina, curCostos, curMargen, curMargenPct, nominaProyectadaList, nominaProyectada, curCommissions, curComisiones, facturasPendientesList, facturasPendientes, facturasVencidasList, facturasVencidas, variacion, prevIngresos, hrData, alerts, nominaSinCerrarList, nominaSinCerrar, comisionesPorAprobarList, comisionesPorAprobar, invoicesPorEnviarList, invoicesPorEnviar, now, f, fmt, t]);

  const vsAnterior = (n: number) => t("finanzas.dash.vsPrevious", { pct: `${n >= 0 ? "+" : ""}${n.toFixed(1)}` });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader title={t("finanzas.dash.title")} subtitle={t("finanzas.dash.subtitle")} />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filtros globales */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }} />
          <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t("finanzas.common.costCenter")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              <SelectItem value="operaciones">{t("finanzas.cc.operations")}</SelectItem>
              <SelectItem value="ventas">{t("finanzas.cc.sales")}</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={area || undefined} onValueChange={v => setArea(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder={t("common.area")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.allF")}</SelectItem>
              <SelectItem value="chatters">Chatters</SelectItem>
              <SelectItem value="closers">Closers</SelectItem>
              <SelectItem value="tech">Tech</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">{t("finanzas.dash.filter.both")}</SelectItem>
              <SelectItem value="ingresos">{t("finanzas.common.revenue")}</SelectItem>
              <SelectItem value="egresos">{t("finanzas.common.expenses")}</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setCostCenter(""); setArea(""); setTipo("ambos"); }}>
              <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
            </Button>
          )}
        </div>

        {/* 8 KPI Cards — todas con el patrón estándar y onClick → modal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label={t("finanzas.dash.kpi.revenue")} value={fmt(curIngresos)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success" hint={vsAnterior(variacion)} onClick={() => setKpiPopup("ingresos")} />
              <StatChip label={t("finanzas.dash.kpi.costs")} value={fmt(curCostos)} icon={<TrendingDown className="h-3.5 w-3.5" />} color="bg-destructive" hint={vsAnterior(pctChange(curCostos, prevCostos))} onClick={() => setKpiPopup("costos")} />
              <StatChip label={t("finanzas.dash.kpi.margin")} value={fmt(curMargen)} icon={<BarChart3 className="h-3.5 w-3.5" />} color={curMargen >= 0 ? "bg-success" : "bg-destructive"} hint={t("finanzas.dash.kpi.marginHint", { pct: curMargenPct.toFixed(1) })} onClick={() => setKpiPopup("margen")} />
              <StatChip label={t("finanzas.dash.kpi.projectedPayroll")} value={fmt(nominaProyectada)} icon={<Users className="h-3.5 w-3.5" />} color="bg-warning" hint={t("finanzas.dash.kpi.projectedPayrollHint")} onClick={() => setKpiPopup("nominaProy")} />
              <StatChip label={t("finanzas.dash.kpi.commissions")} value={fmt(curComisiones)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.common.records", { n: curCommissions.length })} onClick={() => setKpiPopup("comisiones")} />
              <StatChip label={t("finanzas.dash.kpi.pendingInvoices")} value={String(facturasPendientes)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-warning" hint={t("finanzas.dash.kpi.pendingInvoicesHint")} onClick={() => setKpiPopup("facturasPend")} />
              <StatChip label={t("finanzas.dash.kpi.overdueInvoices")} value={String(facturasVencidas)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("finanzas.dash.kpi.overdueInvoicesHint")} onClick={() => setKpiPopup("facturasVenc")} />
              <StatChip label={t("finanzas.dash.kpi.change")} value={`${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`} icon={<TrendingUp className="h-3.5 w-3.5" />} color={variacion >= 0 ? "bg-success" : "bg-destructive"} hint={t("finanzas.dash.kpi.changeHint")} onClick={() => setKpiPopup("variacion")} />
            </>
          )}
        </div>

        {/* Headcount y Costos de Personal — 4 cards estándar */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t("finanzas.dash.headcountTitle")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatChip label={t("finanzas.dash.kpi.activeEmployees")} value={String(hrData?.headcount ?? 0)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint="Headcount" onClick={() => setKpiPopup("headcount")} />
            <StatChip label={t("finanzas.dash.kpi.avgCost")} value={fmt(hrData?.costPerEmp ?? 0)} icon={<Briefcase className="h-3.5 w-3.5" />} color="bg-accent" hint={t("finanzas.dash.kpi.avgCostHint")} onClick={() => setKpiPopup("costoEmp")} />
            <StatChip label={t("finanzas.dash.kpi.deductions")} value={fmt(hrData?.dedTotal ?? 0)} icon={<ArrowDown className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("finanzas.dash.kpi.deductionsHint")} onClick={() => setKpiPopup("deducciones")} />
            <StatChip label={t("finanzas.dash.kpi.departments")} value={String(hrData?.deptCount ?? 0)} icon={<Building2 className="h-3.5 w-3.5" />} color="bg-success" hint={t("finanzas.dash.kpi.departmentsHint")} onClick={() => setKpiPopup("departamentos")} />
          </div>
        </div>

        {/* Flujo de Dinero — chart se queda como está, no es un KPI clickeable */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Wallet className="h-4 w-4 text-muted-foreground" />{t("finanzas.dash.cashFlow")}
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
                <Bar dataKey="ingresos" name={t("finanzas.common.revenue")} fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costos" name={t("finanzas.common.costs")} fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas Operativas — card resumen clickeable */}
          <StatChip
            label={t("finanzas.dash.kpi.alerts")}
            value={String(alerts.length)}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            color={alerts.length > 0 ? "bg-warning" : "bg-muted-foreground"}
            hint={alerts.length === 0 ? t("finanzas.dash.kpi.alertsNone") : t("finanzas.dash.kpi.alertsClick")}
            onClick={() => setKpiPopup("alertas")}
            className="lg:col-span-1"
          />

          {/* Próximas Acciones — 4 cards en mini grid */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              {t("finanzas.dash.nextActions")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatChip label={t("finanzas.dash.action.payroll")} value={String(nominaSinCerrar)} icon={<Users className="h-3.5 w-3.5" />} color="bg-warning" onClick={() => setKpiPopup("accion-nomina")} />
              <StatChip label={t("finanzas.dash.action.commissions")} value={String(comisionesPorAprobar)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("accion-comisiones")} />
              <StatChip label={t("finanzas.dash.action.invoices")} value={String(invoicesPorEnviar)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-accent" onClick={() => setKpiPopup("accion-invoices")} />
              <StatChip label={t("finanzas.dash.action.bankFiles")} value="0" icon={<FileText className="h-3.5 w-3.5" />} color="bg-muted-foreground" hint={t("finanzas.dash.action.bankFilesHint")} onClick={() => setKpiPopup("accion-archivos")} />
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
        emptyText={t("finanzas.kpi.empty")}
      />
    </div>
  );
}
