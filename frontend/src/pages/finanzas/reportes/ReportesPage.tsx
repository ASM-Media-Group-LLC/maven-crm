import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Trash2, Plus, Search, X, LayoutGrid, List, Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import KpiCard from "@/components/dashboard/KpiCard";
import { generateReport, exportTableToExcel } from "./generateReport";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";

const REPORT_TABS = ["Estado de Cuenta CC", "Ventas por Creador", "Por Método de Pago", "Comparativos Mensuales", "Reportes Generales"] as const;
type ReportTab = typeof REPORT_TABS[number];

const REPORT_TYPES: Record<string, string> = {
  nomina: "Nómina",
  facturacion: "Facturación",
  comisiones: "Comisiones",
  consolidado: "Consolidado",
  ventas_creador: "Ventas por Creador",
  comparativos: "Comparativos Mensuales",
  metodo_pago: "Por Método de Pago",
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function DepartmentCostSection() {
  const { data: employees = [] } = useQuery({
    queryKey: ["reportes-dept-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("base_salary, status, departments(name)").eq("status", "activo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const deptGroups = employees.reduce((acc, e: any) => {
    const dept = e.departments?.name || "Sin Departamento";
    if (!acc[dept]) acc[dept] = { count: 0, total: 0 };
    acc[dept].count++;
    acc[dept].total += Number(e.base_salary) || 0;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  const entries = Object.entries(deptGroups).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = entries.reduce((s, [, d]) => s + d.total, 0);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Costo Salarial por Departamento</h3>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-card">
            <TableHead className="text-xs font-medium text-muted-foreground">Departamento</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground"># Empleados</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Costo Salarial</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {entries.map(([dept, data]) => (
              <TableRow key={dept} className="hover:bg-muted/30">
                <TableCell className="text-sm font-medium">{dept}</TableCell>
                <TableCell className="text-sm">{data.count}</TableCell>
                <TableCell className="text-sm">{fmt(data.total)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{grandTotal > 0 ? ((data.total / grandTotal) * 100).toFixed(1) : 0}%</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell className="text-sm">Total</TableCell>
              <TableCell className="text-sm">{entries.reduce((s, [, d]) => s + d.count, 0)}</TableCell>
              <TableCell className="text-sm">{fmt(grandTotal)}</TableCell>
              <TableCell className="text-sm">100%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ReportesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportTab, setReportTab] = useState<ReportTab>("Estado de Cuenta CC");
  const [showGenModal, setShowGenModal] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["financial-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["reportes-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*, creators(id, name, artistic_name, phone, creator_business(billing_address))").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payroll = [] } = useQuery({
    queryKey: ["reportes-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("net_total, gross_total, status, cost_center, period_name, created_at").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Generate modal state
  const [genType, setGenType] = useState("comisiones");
  const [genFormat, setGenFormat] = useState<"csv" | "excel">("excel");
  const [genArea, setGenArea] = useState("");
  const [genDateFrom, setGenDateFrom] = useState<Date | undefined>();
  const [genDateTo, setGenDateTo] = useState<Date | undefined>();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      toast({ title: "Reporte eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      let reportData: any[] = [];
      if (genType === "comisiones") {
        const { data } = await supabase.from("commissions").select("period, base_amount, percentage, estimated_amount, final_amount, status, area, cost_center");
        reportData = data || [];
      } else if (genType === "facturacion") {
        const { data } = await supabase.from("invoices").select("invoice_number, amount, fee_amount, net_amount, status, payment_method, due_date");
        reportData = data || [];
      } else if (genType === "nomina") {
        const { data } = await supabase.from("payroll_periods").select("period_name, total_employees, gross_total, net_total, status, cost_center");
        reportData = data || [];
      } else {
        const { data: inv } = await supabase.from("invoices").select("invoice_number, amount, status");
        const { data: pay } = await supabase.from("payroll_periods").select("period_name, net_total, status");
        reportData = [...(inv || []).map(i => ({ ...i, tipo: "Invoice" })), ...(pay || []).map(p => ({ ...p, tipo: "Nómina" }))];
      }
      generateReport(reportData, genType, genFormat);
      const { data: user } = await supabase.auth.getUser();
      await supabase.from("financial_reports").insert({
        report_type: genType, format: genFormat, area: genArea || null,
        period_from: genDateFrom ? format(genDateFrom, "yyyy-MM-dd") : null,
        period_to: genDateTo ? format(genDateTo, "yyyy-MM-dd") : null,
        created_by: user.user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      toast({ title: "Reporte generado y descargado" });
      setShowGenModal(false);
    },
    onError: () => toast({ title: "Error al generar reporte", variant: "destructive" }),
  });

  const hasFilters = search || typeFilter || dateFrom || dateTo;

  // Ventas por Creador
  const creatorSales = Object.values(invoices.reduce((acc, inv) => {
    const cid = inv.creator_id || "sin_asignar";
    const name = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "Sin asignar";
    if (!acc[cid]) acc[cid] = { name, totalFacturado: 0, totalCobrado: 0, pendiente: 0 };
    acc[cid].totalFacturado += Number(inv.amount) || 0;
    if (inv.status === "pagada") acc[cid].totalCobrado += Number(inv.amount) || 0;
    if (inv.status === "enviada" || inv.status === "vencida") acc[cid].pendiente += Number(inv.amount) || 0;
    return acc;
  }, {} as Record<string, { name: string; totalFacturado: number; totalCobrado: number; pendiente: number }>))
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const grandTotal = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // Por Método de Pago
  const methodGroups = invoices.reduce((acc, inv) => {
    const m = inv.payment_method || "Sin método";
    if (!acc[m]) acc[m] = { count: 0, total: 0 };
    acc[m].count++;
    acc[m].total += Number(inv.amount) || 0;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  const methodEntries = Object.entries(methodGroups).filter(([m]) => !search || m.toLowerCase().includes(search.toLowerCase()));

  // Comparativos Mensuales
  const now = new Date();
  const monthlyComparison = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i);
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const mInv = invoices.filter(inv => { const d = new Date(inv.created_at); return d >= mStart && d <= mEnd && inv.status === "pagada"; });
    const mPay = payroll.filter(p => { const d = new Date(p.created_at); return d >= mStart && d <= mEnd; });
    const ing = mInv.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const egr = mPay.reduce((s, p) => s + (Number(p.net_total) || 0), 0);
    return { mes: format(month, "MMM yyyy", { locale: es }), ingresos: ing, egresos: egr, margen: ing - egr };
  });

  // Add % change
  const monthlyWithChange = monthlyComparison.map((m, i) => ({
    ...m,
    cambio: i === 0 ? 0 : monthlyComparison[i - 1].ingresos > 0
      ? (((m.ingresos - monthlyComparison[i - 1].ingresos) / monthlyComparison[i - 1].ingresos) * 100)
      : 0,
  }));

  const renderTabContent = () => {
    switch (reportTab) {
      case "Ventas por Creador":
        return viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-24rem)]">
              <Table>
                <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Total Facturado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Total Cobrado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Pendiente</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {creatorSales.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Sin datos.</TableCell></TableRow>
                  ) : creatorSales.map((r, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{fmt(r.totalFacturado)}</TableCell>
                      <TableCell className="text-sm text-accent">{fmt(r.totalCobrado)}</TableCell>
                      <TableCell className="text-sm text-warning">{fmt(r.pendiente)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{grandTotal > 0 ? ((r.totalFacturado / grandTotal) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {creatorSales.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12">Sin datos.</div>
            ) : creatorSales.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xl font-bold text-foreground mt-2">{fmt(r.totalFacturado)}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className="text-accent">Cobrado: {fmt(r.totalCobrado)}</span>
                  <span>{grandTotal > 0 ? ((r.totalFacturado / grandTotal) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            ))}
          </div>
        );

      case "Por Método de Pago":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {methodEntries.map(([method, data]) => (
                <KpiCard key={method} label={method} value={fmt(data.total)} icon={FileText} color="bg-blue-500" subtitle={`${data.count} invoices`} />
              ))}
            </div>
            {viewMode === "list" ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Método</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Invoices</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">% del Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {methodEntries.map(([method, data]) => (
                      <TableRow key={method} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">{method}</TableCell>
                        <TableCell className="text-sm">{data.count}</TableCell>
                        <TableCell className="text-sm">{fmt(data.total)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{grandTotal > 0 ? ((data.total / grandTotal) * 100).toFixed(1) : 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {methodEntries.map(([method, data]) => (
                  <div key={method} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
                    <p className="text-sm font-medium">{method}</p>
                    <p className="text-xl font-bold text-foreground mt-2">{fmt(data.total)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{data.count} invoices · {grandTotal > 0 ? ((data.total / grandTotal) * 100).toFixed(1) : 0}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "Comparativos Mensuales":
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 bg-card">
              <h3 className="text-sm font-medium text-foreground mb-4">Comparativo Mensual (6 meses)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyWithChange}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                  <Bar dataKey="ingresos" fill="hsl(var(--accent))" name="Ingresos" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="egresos" fill="hsl(var(--destructive))" name="Egresos" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader><TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="text-xs font-medium text-muted-foreground">Mes</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Ingresos</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Egresos</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Margen</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">% Cambio</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {monthlyWithChange.map((m, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium capitalize">{m.mes}</TableCell>
                      <TableCell className="text-sm text-accent">{fmt(m.ingresos)}</TableCell>
                      <TableCell className="text-sm text-destructive">{fmt(m.egresos)}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(m.margen)}</TableCell>
                      <TableCell className="text-sm">
                        {i === 0 ? "—" : (
                          <span className={m.cambio >= 0 ? "text-accent" : "text-destructive"}>
                            {m.cambio >= 0 ? "+" : ""}{m.cambio.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );

      case "Estado de Cuenta CC": {
        const filtered = reports.filter(r => {
          const matchSearch = !search || (REPORT_TYPES[r.report_type] || r.report_type).toLowerCase().includes(search.toLowerCase());
          const d = new Date(r.created_at);
          const matchFrom = !dateFrom || d >= dateFrom;
          const matchTo = !dateTo || d <= dateTo;
          return matchSearch && matchFrom && matchTo && r.area;
        });
        return (
          <div className="space-y-6">
            {renderReportsTable(filtered)}
            <DepartmentCostSection />
          </div>
        );
      }

      default: {
        const filtered = reports.filter(r => {
          const matchSearch = !search || (REPORT_TYPES[r.report_type] || r.report_type).toLowerCase().includes(search.toLowerCase());
          const matchType = !typeFilter || r.report_type === typeFilter;
          const d = new Date(r.created_at);
          const matchFrom = !dateFrom || d >= dateFrom;
          const matchTo = !dateTo || d <= dateTo;
          return matchSearch && matchType && matchFrom && matchTo;
        });
        return renderReportsTable(filtered);
      }
    }
  };

  const renderReportsTable = (filtered: any[]): React.ReactNode => viewMode === "list" ? (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-24rem)]">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b">
              <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Área / CC</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Formato</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">{reports.length === 0 ? "No hay reportes. Genera el primero." : "Sin resultados."}</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id} className="group hover:bg-muted/30 transition-colors">
                <TableCell><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{REPORT_TYPES[r.report_type] || r.report_type}</span></div></TableCell>
                <TableCell className="text-sm">{r.period_from && r.period_to ? `${r.period_from} — ${r.period_to}` : "—"}</TableCell>
                <TableCell className="text-sm">{r.area || "—"}</TableCell>
                <TableCell><Badge variant="outline">{(r.format || "csv").toUpperCase()}</Badge></TableCell>
                <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                  <div className="flex items-center gap-1">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Descargar</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(r)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filtered.length === 0 ? (
        <div className="col-span-full text-center text-muted-foreground py-12">Sin reportes.</div>
      ) : filtered.map(r => (
        <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-[10px]">{(r.format || "csv").toUpperCase()}</Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteItem(r)}><Trash2 className="h-3 w-3" /></Button>
          </div>
          <p className="text-sm font-medium">{REPORT_TYPES[r.report_type] || r.report_type}</p>
          <p className="text-xs text-muted-foreground mt-1">{r.area || "Sin área"}</p>
          <p className="text-xs text-muted-foreground mt-1">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/60 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
            <p className="text-sm text-muted-foreground">Generación y descarga de reportes financieros · {reports.length} generados</p>
          </div>
          <Button size="sm" onClick={() => setShowGenModal(true)}><Plus className="h-4 w-4 mr-1" />Generar Reporte</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {REPORT_TABS.map(t => (
            <Button key={t} variant={reportTab === t ? "secondary" : "ghost"} size="sm" onClick={() => { setReportTab(t); setSearch(""); }}>{t}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {reportTab === "Reportes Generales" && (
            <Select value={typeFilter || undefined} onValueChange={v => setTypeFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {Object.entries(REPORT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setTypeFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          )}
        </div>

        {renderTabContent()}
      </div>

      {/* Generate Report Modal */}
      <Dialog open={showGenModal} onOpenChange={setShowGenModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generar Reporte</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Reporte</Label>
              <Select value={genType} onValueChange={setGenType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periodo</Label>
              <DateRangePicker from={genDateFrom} to={genDateTo} onApply={(f, t) => { setGenDateFrom(f); setGenDateTo(t); }} />
            </div>
            <div>
              <Label>Área / CC</Label>
              <Select value={genArea || undefined} onValueChange={v => setGenArea(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="chatters">Chatters</SelectItem>
                  <SelectItem value="closers">Closers</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={genFormat} onValueChange={v => setGenFormat(v as "csv" | "excel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenModal(false)}>Cancelar</Button>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <Download className="h-4 w-4 mr-1" />Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
