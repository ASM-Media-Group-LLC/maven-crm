import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, AlertTriangle, Ban, Plus, Search, X, Download,
  Users, CheckCircle, LayoutGrid, List, TrendingUp, BarChart3,
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
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const TABS = ["Dashboard", "Cobros"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pagada: "hsl(var(--accent))",
  enviada: "hsl(var(--warning))",
  vencida: "hsl(var(--destructive))",
  sin_cobro: "hsl(var(--muted-foreground))",
};

export default function CollectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Register form
  const [regCreator, setRegCreator] = useState("");
  const [regAmount, setRegAmount] = useState("");
  const [regNotes, setRegNotes] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["collections-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*, creators(name, artistic_name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: creators = [] } = useQuery({
    queryKey: ["collections-creators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const registerPayment = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const invNum = `COB-${Date.now().toString(36).toUpperCase()}`;
      const statusMap: Record<string, string> = { pagada: "pagada", pendiente: "enviada", vencida: "vencida", sin_cobro: "borrador" };
      const { error } = await supabase.from("invoices").insert({
        creator_id: regCreator,
        amount: Number(regAmount),
        fee_amount: 0,
        net_amount: Number(regAmount),
        status: statusMap[regStatus] || "enviada",
        payment_method: regType,
        invoice_number: invNum,
        due_date: new Date().toISOString().split("T")[0],
        created_by: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections-invoices"] });
      toast({ title: "Cobro registrado exitosamente" });
      setShowRegisterModal(false);
      setRegCreator(""); setRegAmount(""); setRegType("quincenal"); setRegStatus("pendiente");
    },
    onError: () => toast({ title: "Error al registrar cobro", variant: "destructive" }),
  });

  const cobrados = invoices.filter(i => i.status === "pagada");
  const pendientes = invoices.filter(i => i.status === "enviada");
  const vencidos = invoices.filter(i => i.status === "vencida");
  const sinCobro = invoices.filter(i => !i.creator_id || Number(i.amount) === 0);

  const totalCobrado = cobrados.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalPendiente = pendientes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalVencido = vencidos.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // Frequency cards data
  const quincenales = invoices.filter(i => i.payment_method === "quincenal");
  const mensuales = invoices.filter(i => i.payment_method !== "quincenal");
  const montoQuincenal = quincenales.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const montoMensual = mensuales.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // Financial KPIs
  const now = new Date();
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const lastMonthInvoices = invoices.filter(i => { const d = new Date(i.created_at); return d >= lastMonthStart && d <= lastMonthEnd; });
  const ventasUltimoMes = lastMonthInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const sixMonthsAgo = subMonths(now, 6);
  const last6Invoices = invoices.filter(i => new Date(i.created_at) >= sixMonthsAgo);
  const promedio6 = last6Invoices.length > 0 ? last6Invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0) / 6 : 0;

  const comisionSocios = invoices.reduce((s, i) => s + (Number(i.fee_amount) || 0), 0);
  const facturacionNeta = invoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);

  // Charts data
  const pieStatusData = [
    { name: "Pagadas", value: cobrados.length, color: STATUS_COLORS.pagada },
    { name: "Pendientes", value: pendientes.length, color: STATUS_COLORS.enviada },
    { name: "Vencidas", value: vencidos.length, color: STATUS_COLORS.vencida },
    { name: "Sin Cobro", value: sinCobro.length, color: STATUS_COLORS.sin_cobro },
  ].filter(d => d.value > 0);

  const pieMoneyData = [
    { name: "Pagado", value: totalCobrado, color: STATUS_COLORS.pagada },
    { name: "Pendiente", value: totalPendiente, color: STATUS_COLORS.enviada },
    { name: "Vencido", value: totalVencido, color: STATUS_COLORS.vencida },
  ].filter(d => d.value > 0);

  // Monthly bar chart (6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i);
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const mInvoices = invoices.filter(inv => { const d = new Date(inv.created_at); return d >= mStart && d <= mEnd; });
    return {
      month: format(month, "MMM", { locale: es }),
      Pagadas: mInvoices.filter(i => i.status === "pagada").reduce((s, i) => s + (Number(i.amount) || 0), 0),
      Pendientes: mInvoices.filter(i => i.status === "enviada").reduce((s, i) => s + (Number(i.amount) || 0), 0),
      Vencidas: mInvoices.filter(i => i.status === "vencida").reduce((s, i) => s + (Number(i.amount) || 0), 0),
    };
  });

  // Cobros tab filtering
  const hasFilters = search || statusFilter || dateFrom || dateTo;
  const filteredCobros = invoices.filter(inv => {
    const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "";
    const matchSearch = !search || creatorName.toLowerCase().includes(search.toLowerCase()) || inv.invoice_number.includes(search);
    const statusMap: Record<string, string> = { pagada: "pagada", pendiente: "enviada", vencida: "vencida" };
    const matchStatus = !statusFilter || inv.status === (statusMap[statusFilter] || statusFilter);
    const d = new Date(inv.created_at);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Collections</h1>
            <p className="text-sm text-muted-foreground">Gestión de cobros e ingresos · {invoices.length} registros</p>
          </div>
          <Button size="sm" onClick={() => setShowRegisterModal(true)}>
            <Plus className="h-4 w-4 mr-1" />Registrar Cobro
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs globales - status cards (5 cols) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total" value={String(invoices.length)} icon={Users} subtitle={`Bruto: ${fmt(totalCobrado + totalPendiente + totalVencido)}`} color="primary" />
              <DashboardMetricCard label="Pagadas" value={String(cobrados.length)} icon={CheckCircle} subtitle={fmt(totalCobrado)} color="accent" />
              <DashboardMetricCard label="Pendientes" value={String(pendientes.length)} icon={Clock} subtitle={fmt(totalPendiente)} color="warning" />
              <DashboardMetricCard label="Vencidas" value={String(vencidos.length)} icon={AlertTriangle} subtitle={fmt(totalVencido)} color="destructive" />
              <DashboardMetricCard label="Sin Cobro" value={String(sinCobro.length)} icon={Ban} subtitle="$0" color="muted" />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {TABS.map(t => (
            <Button key={t} variant={tab === t ? "secondary" : "ghost"} size="sm" onClick={() => setTab(t)}>{t}</Button>
          ))}
        </div>

        {tab === "Dashboard" ? (
          <div className="space-y-6">
            {/* Frequency cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/15">QUINCENAL</Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{quincenales.length} <span className="text-sm font-normal text-muted-foreground">creadoras</span></p>
                <p className="text-sm text-muted-foreground mt-1">{fmt(montoQuincenal)} · Cobro cada 15 días</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">MENSUAL</Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{mensuales.length} <span className="text-sm font-normal text-muted-foreground">creadoras</span></p>
                <p className="text-sm text-muted-foreground mt-1">{fmt(montoMensual)} · Cobro cada mes</p>
              </div>
            </div>

            {/* Financial KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardMetricCard label="Ventas Último Mes" value={fmt(ventasUltimoMes)} icon={TrendingUp} subtitle="Total invoices" color="accent" />
              <DashboardMetricCard label="Promedio 6 Meses" value={fmt(promedio6)} icon={BarChart3} subtitle="Promedio histórico" color="primary" />
              <DashboardMetricCard label="Comisión Socios" value={fmt(comisionSocios)} icon={DollarSign} subtitle="Fees acumulados" color="warning" />
              <DashboardMetricCard label="Facturación Neta" value={fmt(facturacionNeta)} icon={DollarSign} subtitle="Neto real" color="accent" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">Estado de Cobros</h3>
                {pieStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {pieStatusData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                      <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-12">Sin datos</p>}
              </div>
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">Dinero por Estado</h3>
                {pieMoneyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieMoneyData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {pieMoneyData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                      </Pie>
                      <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-12">Sin datos</p>}
              </div>
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">Cobros Mensuales (6 meses)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                    <Bar dataKey="Pagadas" stackId="a" fill={STATUS_COLORS.pagada} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Pendientes" stackId="a" fill={STATUS_COLORS.enviada} />
                    <Bar dataKey="Vencidas" stackId="a" fill={STATUS_COLORS.vencida} radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar creadora o número..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter || undefined} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filteredCobros.map(inv => ({ Numero: inv.invoice_number, Creador: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "", Monto: inv.amount, Estado: inv.status, Fecha: format(new Date(inv.created_at), "dd/MM/yyyy") })), "cobros")}>
                <Download className="h-4 w-4 mr-1" />Exportar
              </Button>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>

            {viewMode === "list" ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 bg-card border-b">
                        <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Creadora</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                      )) : filteredCobros.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Sin cobros encontrados.</TableCell></TableRow>
                      ) : filteredCobros.map(inv => (
                        <TableRow key={inv.id} className="hover:bg-muted/30">
                          <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                          <TableCell className="text-sm">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</TableCell>
                          <TableCell className="text-sm">{inv.payment_method || "—"}</TableCell>
                          <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "pagada" ? "default" : inv.status === "enviada" ? "secondary" : inv.status === "vencida" ? "destructive" : "outline"}>
                              {inv.status === "pagada" ? "Pagada" : inv.status === "enviada" ? "Pendiente" : inv.status === "vencida" ? "Vencida" : inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created_at), "dd/MM/yyyy")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />) : filteredCobros.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-12">Sin cobros encontrados.</div>
                ) : filteredCobros.map(inv => (
                  <div key={inv.id} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-muted-foreground">#{inv.invoice_number}</span>
                      <Badge variant={inv.status === "pagada" ? "default" : inv.status === "enviada" ? "secondary" : inv.status === "vencida" ? "destructive" : "outline"} className="text-[10px]">
                        {inv.status === "pagada" ? "Pagada" : inv.status === "enviada" ? "Pendiente" : inv.status === "vencida" ? "Vencida" : inv.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{fmt(Number(inv.amount) || 0)}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{inv.payment_method || "—"}</span>
                      <span>{format(new Date(inv.created_at), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Register Payment Modal */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Nuevo Cobro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Creadora</Label>
              <Select value={regCreator || undefined} onValueChange={setRegCreator}>
                <SelectTrigger><SelectValue placeholder="Seleccionar creadora" /></SelectTrigger>
                <SelectContent>
                  {creators.map(c => <SelectItem key={c.id} value={c.id}>{c.artistic_name || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de cobro</Label>
              <Select value={regType} onValueChange={setRegType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto ($)</Label>
              <Input type="number" placeholder="0.00" value={regAmount} onChange={e => setRegAmount(e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={regStatus} onValueChange={setRegStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pagada">Pagada</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="sin_cobro">Sin Cobro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterModal(false)}>Cancelar</Button>
            <Button onClick={() => registerPayment.mutate()} disabled={!regCreator || !regAmount || registerPayment.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
