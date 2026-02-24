import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, AlertTriangle, Ban, Plus, Search, X, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RTooltip } from "recharts";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format } from "date-fns";

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const COLLECTION_TABS = ["Dashboard de Cobros", "Gestión de Creadoras", "Registro de Cobros"] as const;
type CollectionTab = typeof COLLECTION_TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pagada: "hsl(145, 63%, 32%)",
  enviada: "hsl(40, 96%, 40%)",
  vencida: "hsl(0, 84%, 60%)",
  sin_cobro: "hsl(240, 4%, 46%)",
};

export default function CollectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CollectionTab>("Dashboard de Cobros");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Register form
  const [regCreator, setRegCreator] = useState("");
  const [regAmount, setRegAmount] = useState("");
  const [regMethod, setRegMethod] = useState("transferencia");
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
      const { error } = await supabase.from("invoices").insert({
        creator_id: regCreator,
        amount: Number(regAmount),
        fee_amount: 0,
        net_amount: Number(regAmount),
        status: "pagada",
        payment_method: regMethod,
        invoice_number: invNum,
        due_date: new Date().toISOString().split("T")[0],
        notes: regNotes || null,
        created_by: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections-invoices"] });
      toast({ title: "Cobro registrado exitosamente" });
      setShowRegisterModal(false);
      setRegCreator(""); setRegAmount(""); setRegNotes("");
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

  const pieData = [
    { name: "Cobrado", value: totalCobrado, color: STATUS_COLORS.pagada },
    { name: "Pendiente", value: totalPendiente, color: STATUS_COLORS.enviada },
    { name: "Vencido", value: totalVencido, color: STATUS_COLORS.vencida },
    { name: "Sin Cobro", value: sinCobro.length, color: STATUS_COLORS.sin_cobro },
  ].filter(d => d.value > 0);

  // Gestión de Creadoras: group invoices by creator
  const creatorGroups = invoices.reduce((acc, inv) => {
    const cid = inv.creator_id || "sin_asignar";
    if (!acc[cid]) acc[cid] = { invoices: [], name: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "Sin asignar" };
    acc[cid].invoices.push(inv);
    return acc;
  }, {} as Record<string, { invoices: any[]; name: string }>);

  const creatorRows = Object.entries(creatorGroups).map(([cid, data]) => {
    const total = data.invoices.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
    const paid = data.invoices.filter((i: any) => i.status === "pagada");
    const lastPaid = paid.length > 0 ? paid.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] : null;
    const hasPending = data.invoices.some((i: any) => i.status === "enviada");
    const hasOverdue = data.invoices.some((i: any) => i.status === "vencida");
    const status = hasOverdue ? "vencida" : hasPending ? "pendiente" : paid.length > 0 ? "pagada" : "sin_cobro";
    return { id: cid, name: data.name, total, count: data.invoices.length, status, lastPaidDate: lastPaid?.created_at || null };
  }).filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const recentPaid = cobrados.slice(0, 50);
  const hasFilters = search || dateFrom || dateTo;

  const renderTab = () => {
    switch (tab) {
      case "Dashboard de Cobros":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <DashboardMetricCard label="Total Cobrado" value={fmt(totalCobrado)} icon={DollarSign} subtitle={`${cobrados.length} invoices`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" valueColor="text-accent" />
                  <DashboardMetricCard label="Pendiente de Cobro" value={fmt(totalPendiente)} icon={Clock} subtitle={`${pendientes.length} invoices`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor="text-warning" />
                  <DashboardMetricCard label="Vencido" value={fmt(totalVencido)} icon={AlertTriangle} subtitle={`${vencidos.length} invoices`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" valueColor="text-destructive" />
                  <DashboardMetricCard label="Sin Cobro" value={String(sinCobro.length)} icon={Ban} subtitle="Sin asignar o $0" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted/30 hover:border-muted-foreground/40" />
                </>
              )}
            </div>
            {!isLoading && pieData.length > 0 && (
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">Distribución por Estado</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {pieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );

      case "Gestión de Creadoras":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar creadora..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={() => exportTableToExcel(creatorRows.map(r => ({ Creadora: r.name, Total: r.total, Invoices: r.count, Estado: r.status, UltimoPago: r.lastPaidDate || "—" })), "gestion-creadoras")}>
                <Download className="h-4 w-4 mr-1" />Exportar
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Creadora</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto Total</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Invoices</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado de Cobro</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Último Pago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    )) : creatorRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Sin datos de creadoras.</TableCell></TableRow>
                    ) : creatorRows.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm">{fmt(r.total)}</TableCell>
                        <TableCell className="text-sm">{r.count}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "pagada" ? "default" : r.status === "pendiente" ? "secondary" : r.status === "vencida" ? "destructive" : "outline"}>
                            {r.status === "pagada" ? "Pagada" : r.status === "pendiente" ? "Pendiente" : r.status === "vencida" ? "Vencida" : "Sin Cobro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.lastPaidDate ? format(new Date(r.lastPaidDate), "dd/MM/yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        );

      case "Registro de Cobros":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{recentPaid.length} cobros recientes</p>
              <Button size="sm" onClick={() => setShowRegisterModal(true)}><Plus className="h-4 w-4 mr-1" />Registrar Cobro</Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-22rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Método</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    )) : recentPaid.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Sin cobros registrados.</TableCell></TableRow>
                    ) : recentPaid.map(inv => (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0)}</TableCell>
                        <TableCell className="text-sm">{inv.payment_method || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created_at), "dd/MM/yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Collections</h1>
            <p className="text-sm text-muted-foreground">Gestión de cobros e ingresos · {invoices.length} registros</p>
          </div>
          <Button size="sm" onClick={() => { setTab("Registro de Cobros"); setShowRegisterModal(true); }}>
            <Plus className="h-4 w-4 mr-1" />Registrar Cobro
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {COLLECTION_TABS.map(t => (
            <Button key={t} variant={tab === t ? "secondary" : "ghost"} size="sm" onClick={() => setTab(t)}>{t}</Button>
          ))}
        </div>
        {renderTab()}
      </div>

      {/* Register Payment Modal */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Cobro</DialogTitle></DialogHeader>
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
              <Label>Monto</Label>
              <Input type="number" placeholder="0.00" value={regAmount} onChange={e => setRegAmount(e.target.value)} />
            </div>
            <div>
              <Label>Método de Pago</Label>
              <Select value={regMethod} onValueChange={setRegMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea placeholder="Notas opcionales..." value={regNotes} onChange={e => setRegNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterModal(false)}>Cancelar</Button>
            <Button onClick={() => registerPayment.mutate()} disabled={!regCreator || !regAmount || registerPayment.isPending}>
              <Plus className="h-4 w-4 mr-1" />Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
