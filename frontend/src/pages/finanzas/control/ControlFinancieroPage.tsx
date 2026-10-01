import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Users, Search, X, LayoutGrid, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { crudoEnEspanol, estadoNomina } from "../estados";

const TABS = ["Ingresos vs Costos", "Costos por CC", "Costos por Departamento", "Productividad por Empleado", "Márgenes Operativos"] as const;
type Tab = typeof TABS[number];
// El valor de la pestaña es interno (elige qué se dibuja); esto es lo que se lee.
const TAB_LABEL: Record<Tab, TranslationKey> = {
  "Ingresos vs Costos": "finanzas.control.tab.revenueVsCosts",
  "Costos por CC": "finanzas.control.tab.byCC",
  "Costos por Departamento": "finanzas.control.tab.byDept",
  "Productividad por Empleado": "finanzas.control.tab.productivity",
  "Márgenes Operativos": "finanzas.control.tab.margins",
};

function fmtUsd(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ControlFinancieroPage() {
  const f = useFormato();
  const { t, language } = useLanguage();
  const fmt = (n: number) => fmtUsd(n, f.intl("es-CO"));
  const [activeTab, setActiveTab] = useState<Tab>("Ingresos vs Costos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  type KpiKey = "ingresos" | "egresos" | "balance" | "margen";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

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

  const { data: employees = [] } = useQuery({
    queryKey: ["control-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, base_salary, status, department_id, departments(id, name)").eq("status", "activo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payrollDetails = [] } = useQuery({
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
    // "" = sin centro de costo; la etiqueta se pone al dibujar.
    const cc = p.cost_center || "";
    acc[cc] = (acc[cc] || 0) + (Number(p.net_total) || 0);
    return acc;
  }, {} as Record<string, number>);

  const nombreCC = (cc: string) => cc || t("finanzas.common.noCC");
  const nombreDepto = (d: string) => d || t("finanzas.common.noDepartment");
  const ccEntries = Object.entries(ccGroups).filter(([cc]) => !search || nombreCC(cc).toLowerCase().includes(search.toLowerCase()));

  // Productividad
  const empProductivity = employees.map(e => {
    const empDetails = payrollDetails.filter(d => d.employee_id === e.id);
    const totalCost = empDetails.reduce((s, d) => s + (Number(d.net_total) || 0), 0) || Number(e.base_salary) || 0;
    const totalHours = empDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
    return { name: `${e.first_name} ${e.last_name}`, salary: Number(e.base_salary) || 0, cost: totalCost, hours: totalHours, ratio: totalHours > 0 ? totalCost / totalHours : 0 };
  }).filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()));

  // Costos por Departamento
  const deptGroups = employees.reduce((acc, e) => {
    // "" = sin departamento; la etiqueta se pone al dibujar.
    const deptName = (e as any).departments?.name || "";
    if (!acc[deptName]) acc[deptName] = { count: 0, totalSalary: 0 };
    acc[deptName].count++;
    acc[deptName].totalSalary += Number(e.base_salary) || 0;
    return acc;
  }, {} as Record<string, { count: number; totalSalary: number }>);

  const totalSalaries = Object.values(deptGroups).reduce((s, d) => s + d.totalSalary, 0);
  const deptEntries = Object.entries(deptGroups).filter(([d]) => !search || nombreDepto(d).toLowerCase().includes(search.toLowerCase()));

  const showSearch = activeTab === "Costos por CC" || activeTab === "Productividad por Empleado" || activeTab === "Costos por Departamento";
  const showViewToggle = showSearch;

  const renderTab = () => {
    switch (activeTab) {
      case "Costos por CC":
        return viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.costCenter")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.pctOfTotal")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ccEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">{t("finanzas.common.noDataDot")}</TableCell></TableRow>
                  ) : ccEntries.map(([cc, total]) => (
                    <TableRow key={cc} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{nombreCC(cc)}</TableCell>
                      <TableCell className="text-sm">{fmt(total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{egresos > 0 ? ((total / egresos) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ccEntries.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-8">{t("finanzas.common.noDataDot")}</div>
            ) : ccEntries.map(([cc, total]) => (
              <div key={cc} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{nombreCC(cc)}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("finanzas.control.pctOfTotal", { pct: egresos > 0 ? ((total / egresos) * 100).toFixed(1) : 0 })}</p>
              </div>
            ))}
          </div>
        );

      case "Costos por Departamento":
        return viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.department")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employeesHash")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.salaryCost")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.pctOfTotal")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deptEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("finanzas.common.noDataDot")}</TableCell></TableRow>
                  ) : deptEntries.map(([dept, data]) => (
                    <TableRow key={dept} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{nombreDepto(dept)}</TableCell>
                      <TableCell className="text-sm">{data.count}</TableCell>
                      <TableCell className="text-sm">{fmt(data.totalSalary)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{totalSalaries > 0 ? ((data.totalSalary / totalSalaries) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {deptEntries.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-8">{t("finanzas.common.noDataDot")}</div>
            ) : deptEntries.map(([dept, data]) => (
              <div key={dept} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{nombreDepto(dept)}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(data.totalSalary)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("finanzas.common.employeesCount", { n: data.count })} · {totalSalaries > 0 ? ((data.totalSalary / totalSalaries) * 100).toFixed(1) : 0}%</p>
              </div>
            ))}
          </div>
        );

      case "Productividad por Empleado":
        return viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.salary")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.overtime")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.totalCost")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Ratio $/h</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {empProductivity.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("finanzas.control.noActiveEmployees")}</TableCell></TableRow>
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {empProductivity.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-8">{t("finanzas.control.noActiveEmployees")}</div>
            ) : empProductivity.map((e, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{e.name}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(e.salary)}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{t("finanzas.control.hoursExtra", { n: e.hours })}</span>
                  <span>{e.ratio > 0 ? fmt(e.ratio) + "/h" : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case "Márgenes Operativos":
        return (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-card">
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.concept")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.amount")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.pctOfRevenue")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow className="hover:bg-muted/30">
                  <TableCell className="text-sm font-medium">{t("finanzas.common.payroll")}</TableCell>
                  <TableCell className="text-sm">{fmt(payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ingresos > 0 ? ((payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0) / ingresos) * 100).toFixed(1) : 0}%</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/30">
                  <TableCell className="text-sm font-medium">{t("finanzas.common.commissions")}</TableCell>
                  <TableCell className="text-sm">{fmt(commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ingresos > 0 ? ((commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0) / ingresos) * 100).toFixed(1) : 0}%</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/30 font-semibold">
                  <TableCell className="text-sm">{t("finanzas.control.netMargin")}</TableCell>
                  <TableCell className="text-sm">{fmt(balance)}</TableCell>
                  <TableCell className="text-sm">{margenPct}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        );

      default: // Ingresos vs Costos
        return (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-card">
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.concept")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.control.currentMonth")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">{t("finanzas.common.payroll")}</TableCell><TableCell className="text-sm">{fmt(payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0))}</TableCell><TableCell><Badge variant="secondary">{t("finanzas.control.current")}</Badge></TableCell></TableRow>
                <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">{t("finanzas.control.billingPaid")}</TableCell><TableCell className="text-sm">{fmt(ingresos)}</TableCell><TableCell><Badge variant="secondary">{t("finanzas.control.current")}</Badge></TableCell></TableRow>
                <TableRow className="hover:bg-muted/30"><TableCell className="text-sm font-medium">{t("finanzas.control.commissionsPaid")}</TableCell><TableCell className="text-sm">{fmt(commissions.filter(c => c.status === "pagado").reduce((s, c) => s + (Number(c.final_amount) || 0), 0))}</TableCell><TableCell><Badge variant="secondary">{t("finanzas.control.current")}</Badge></TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader title={t("finanzas.control.title")} subtitle={t("finanzas.control.subtitle")} />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Global KPIs — clickeables, abren modal */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label={t("finanzas.control.kpi.revenue")} value={fmt(ingresos)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success" hint={t("finanzas.control.kpi.revenueHint")} onClick={() => setKpiPopup("ingresos")} />
              <StatChip label={t("finanzas.control.kpi.expenses")} value={fmt(egresos)} icon={<TrendingDown className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("finanzas.control.kpi.expensesHint")} onClick={() => setKpiPopup("egresos")} />
              <StatChip label="Balance" value={fmt(balance)} icon={<DollarSign className="h-3.5 w-3.5" />} color={balance < 0 ? "bg-destructive" : "bg-success"} hint={balance >= 0 ? t("finanzas.control.kpi.positive") : t("finanzas.control.kpi.negative")} onClick={() => setKpiPopup("balance")} />
              <StatChip label={t("finanzas.common.margin")} value={`${margenPct}%`} icon={<BarChart3 className="h-3.5 w-3.5" />} color="bg-warning" hint={t("finanzas.control.kpi.marginHint")} onClick={() => setKpiPopup("margen")} />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
          {TABS.map(pestana => (
            <Button key={pestana} variant={activeTab === pestana ? "secondary" : "ghost"} size="sm" onClick={() => { setActiveTab(pestana); setSearch(""); }}>{t(TAB_LABEL[pestana])}</Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }} />
          {showSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("finanzas.common.searchEllipsis")} className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          {showViewToggle && (
            <div className="inline-flex items-center rounded-md border border-border">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          )}
          {search && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
            </Button>
          )}
        </div>

        {renderTab()}
      </div>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("finanzas.kpi.empty")}
        title={(() => {
          switch (kpiPopup) {
            case "ingresos": return t("finanzas.control.popup.revenue", { amount: fmt(ingresos) });
            case "egresos": return t("finanzas.control.popup.expenses", { amount: fmt(egresos) });
            case "balance": return `Balance — ${fmt(balance)}`;
            case "margen": return t("finanzas.control.popup.margin", { pct: margenPct });
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "ingresos": return t("finanzas.control.popup.revenueSub");
            case "egresos": return t("finanzas.control.popup.expensesSub");
            case "balance": return t("finanzas.control.popup.balanceSub", { amount: fmt(balance) });
            case "margen": return t("finanzas.control.popup.marginSub");
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (kpiPopup === "ingresos") {
            const paid = invoices.filter(i => i.status === "pagada");
            return paid.map((i): KpiRow => ({
              primary: (i as any).recipient_name || `Invoice ${(i as any).invoice_number ?? i.id.slice(0, 8)}`,
              secondary: i.created_at ? new Date(i.created_at).toLocaleDateString(f.idioma === "en" ? "en-US" : "es") : "—",
              right: fmt(Number(i.amount) || 0),
              rightTone: "success",
            }));
          }
          if (kpiPopup === "egresos") {
            const payRows: KpiRow[] = payroll.map(p => ({
              primary: t("finanzas.dash.row.payroll", { name: (p as any).period_name ?? t("finanzas.common.noName") }),
              secondary: `${crudoEnEspanol(language, estadoNomina, t, p.status)} · ${(p as any).cost_center ?? t("finanzas.common.noCC")}`,
              right: fmt(Number(p.net_total) || 0),
              rightTone: "destructive",
            }));
            const commPaid = commissions.filter(c => c.status === "pagado");
            const commRows: KpiRow[] = commPaid.map(c => ({
              primary: t("finanzas.dash.row.commission", { name: (c as any).employee_name ?? "—" }),
              secondary: `${(c as any).area ?? t("finanzas.common.noArea")}`,
              right: fmt(Number(c.final_amount) || 0),
              rightTone: "destructive",
            }));
            return [...payRows, ...commRows];
          }
          if (kpiPopup === "balance" || kpiPopup === "margen") {
            return [
              { primary: t("finanzas.common.revenue"), right: fmt(ingresos), rightTone: "success" },
              { primary: t("finanzas.common.expenses"), right: fmt(egresos), rightTone: "destructive" },
              { primary: "Balance", right: fmt(balance), rightTone: balance >= 0 ? "success" : "destructive" },
              { primary: t("finanzas.common.marginPct"), right: `${margenPct}%`, rightTone: Number(margenPct) >= 0 ? "success" : "destructive" },
            ];
          }
          return [];
        })()}
      />
    </div>
  );
}
