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
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";

const TABS = ["Ingresos vs Costos", "Costos por CC", "Costos por Departamento", "Productividad por Empleado", "Márgenes Operativos"] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ControlFinancieroPage() {
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
    const cc = p.cost_center || "Sin CC";
    acc[cc] = (acc[cc] || 0) + (Number(p.net_total) || 0);
    return acc;
  }, {} as Record<string, number>);

  const ccEntries = Object.entries(ccGroups).filter(([cc]) => !search || cc.toLowerCase().includes(search.toLowerCase()));

  // Productividad
  const empProductivity = employees.map(e => {
    const empDetails = payrollDetails.filter(d => d.employee_id === e.id);
    const totalCost = empDetails.reduce((s, d) => s + (Number(d.net_total) || 0), 0) || Number(e.base_salary) || 0;
    const totalHours = empDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
    return { name: `${e.first_name} ${e.last_name}`, salary: Number(e.base_salary) || 0, cost: totalCost, hours: totalHours, ratio: totalHours > 0 ? totalCost / totalHours : 0 };
  }).filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()));

  // Costos por Departamento
  const deptGroups = employees.reduce((acc, e) => {
    const deptName = (e as any).departments?.name || "Sin Departamento";
    if (!acc[deptName]) acc[deptName] = { count: 0, totalSalary: 0 };
    acc[deptName].count++;
    acc[deptName].totalSalary += Number(e.base_salary) || 0;
    return acc;
  }, {} as Record<string, { count: number; totalSalary: number }>);

  const totalSalaries = Object.values(deptGroups).reduce((s, d) => s + d.totalSalary, 0);
  const deptEntries = Object.entries(deptGroups).filter(([d]) => !search || d.toLowerCase().includes(search.toLowerCase()));

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
                  <TableHead className="text-xs font-medium text-muted-foreground">Centro de Costo</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ccEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin datos.</TableCell></TableRow>
                  ) : ccEntries.map(([cc, total]) => (
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ccEntries.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-8">Sin datos.</div>
            ) : ccEntries.map(([cc, total]) => (
              <div key={cc} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{cc}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{egresos > 0 ? ((total / egresos) * 100).toFixed(1) : 0}% del total</p>
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
                  <TableHead className="text-xs font-medium text-muted-foreground">Departamento</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground"># Empleados</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Costo Salarial</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deptEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin datos.</TableCell></TableRow>
                  ) : deptEntries.map(([dept, data]) => (
                    <TableRow key={dept} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{dept}</TableCell>
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
              <div className="col-span-full text-center text-muted-foreground py-8">Sin datos.</div>
            ) : deptEntries.map(([dept, data]) => (
              <div key={dept} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{dept}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(data.totalSalary)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.count} empleados · {totalSalaries > 0 ? ((data.totalSalary / totalSalaries) * 100).toFixed(1) : 0}%</p>
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {empProductivity.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-8">Sin empleados activos.</div>
            ) : empProductivity.map((e, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{e.name}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(e.salary)}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{e.hours}h extra</span>
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
        );

      default: // Ingresos vs Costos
        return (
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
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Control Financiero</h1>
        <p className="text-sm text-muted-foreground">Vista analítica consolidada</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Global KPIs — clickeables, abren modal */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />) : (
            <>
              <KpiCard label="Ingresos Totales" value={fmt(ingresos)} icon={TrendingUp} color="bg-emerald-500" subtitle="Invoices pagados" onClick={() => setKpiPopup("ingresos")} />
              <KpiCard label="Egresos Totales" value={fmt(egresos)} icon={TrendingDown} color="bg-rose-500" subtitle="Nómina + comisiones" onClick={() => setKpiPopup("egresos")} />
              <KpiCard label="Balance" value={fmt(balance)} icon={DollarSign} color={balance < 0 ? "bg-rose-500" : "bg-emerald-500"} subtitle={balance >= 0 ? "Positivo" : "Negativo"} onClick={() => setKpiPopup("balance")} />
              <KpiCard label="Margen" value={`${margenPct}%`} icon={BarChart3} color="bg-amber-500" subtitle="Sobre ingresos" onClick={() => setKpiPopup("margen")} />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => { setActiveTab(t); setSearch(""); }}>{t}</Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          {showSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          )}
        </div>

        {renderTab()}
      </div>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "ingresos": return `Ingresos Totales — ${fmt(ingresos)}`;
            case "egresos": return `Egresos Totales — ${fmt(egresos)}`;
            case "balance": return `Balance — ${fmt(balance)}`;
            case "margen": return `Margen — ${margenPct}%`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "ingresos": return "Invoices con status 'pagada'";
            case "egresos": return "Nómina (net_total) + comisiones pagadas";
            case "balance": return `Ingresos − Egresos = ${fmt(balance)}`;
            case "margen": return "Balance / Ingresos · 100";
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (kpiPopup === "ingresos") {
            const paid = invoices.filter(i => i.status === "pagada");
            return paid.map((i): KpiRow => ({
              primary: (i as any).recipient_name || `Invoice ${(i as any).invoice_number ?? i.id.slice(0, 8)}`,
              secondary: i.created_at ? new Date(i.created_at).toLocaleDateString("es") : "—",
              right: fmt(Number(i.amount) || 0),
              rightTone: "success",
            }));
          }
          if (kpiPopup === "egresos") {
            const payRows: KpiRow[] = payroll.map(p => ({
              primary: `Nómina · ${(p as any).period_name ?? "Sin nombre"}`,
              secondary: `${p.status} · ${(p as any).cost_center ?? "Sin CC"}`,
              right: fmt(Number(p.net_total) || 0),
              rightTone: "destructive",
            }));
            const commPaid = commissions.filter(c => c.status === "pagado");
            const commRows: KpiRow[] = commPaid.map(c => ({
              primary: `Comisión · ${(c as any).employee_name ?? "—"}`,
              secondary: `${(c as any).area ?? "Sin área"}`,
              right: fmt(Number(c.final_amount) || 0),
              rightTone: "destructive",
            }));
            return [...payRows, ...commRows];
          }
          if (kpiPopup === "balance" || kpiPopup === "margen") {
            return [
              { primary: "Ingresos", right: fmt(ingresos), rightTone: "success" },
              { primary: "Egresos", right: fmt(egresos), rightTone: "destructive" },
              { primary: "Balance", right: fmt(balance), rightTone: balance >= 0 ? "success" : "destructive" },
              { primary: "Margen %", right: `${margenPct}%`, rightTone: Number(margenPct) >= 0 ? "success" : "destructive" },
            ];
          }
          return [];
        })()}
      />
    </div>
  );
}
