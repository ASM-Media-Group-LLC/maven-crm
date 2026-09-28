import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, AlertTriangle, Ban, Plus, Search, X, Download,
  Users, CheckCircle, LayoutGrid, List, TrendingUp, BarChart3,
  ChevronsUpDown, Check, MoreHorizontal, Eye, Pencil, Printer, Trash2, FileDown, Paperclip, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { estadoFactura, metodoDePago } from "../estados";

function fmtMonto(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const TABS = ["Dashboard", "Cobros"] as const;
type Tab = typeof TABS[number];
// El valor de la pestaña es interno; esto es lo que se lee en el botón.
const TAB_LABEL: Record<Tab, TranslationKey> = { Dashboard: "finanzas.coll.tab.dashboard", Cobros: "finanzas.coll.tab.payments" };

const STATUS_COLORS: Record<string, string> = {
  pagada: "hsl(var(--accent))",
  enviada: "hsl(var(--warning))",
  vencida: "hsl(var(--destructive))",
  sin_cobro: "hsl(var(--muted-foreground))",
};

export default function CollectionsPage() {
  const f = useFormato();
  const { t } = useLanguage();
  const fmt = (n: number) => fmtMonto(n, f.intl("es-CO"));
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
  const [regFile, setRegFile] = useState<File | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View/Edit modals
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [editInvoice, setEditInvoice] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  type KpiKey = "total" | "pagadas" | "pendientes" | "vencidas" | "sinCobro";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["collections-invoices"],
    queryFn: async () => {
      // PII: vista enmascarada bajo alias `creators` (phone real solo admin).
      const { data, error } = await supabase.from("invoices").select("*, creators:v_creators(id, name, artistic_name, phone, creator_business(billing_address))").order("created_at", { ascending: false });
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

  const uploadEvidence = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `collections/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("custom-request-attachments").upload(path, file);
    if (error) { console.error("Upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("custom-request-attachments").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const registerPayment = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      let evidenceUrl: string | null = null;
      if (regFile) evidenceUrl = await uploadEvidence(regFile);
      const invNum = `COB-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from("invoices").insert({
        creator_id: regCreator,
        amount: Number(regAmount),
        fee_amount: 0,
        net_amount: Number(regAmount),
        status: "enviada",
        payment_method: "cobro",
        invoice_number: invNum,
        due_date: new Date().toISOString().split("T")[0],
        created_by: user.user?.id,
        notes: regNotes || null,
        evidence_url: evidenceUrl,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections-invoices"] });
      toast({ title: t("finanzas.coll.toast.recorded") });
      setShowRegisterModal(false);
      setRegCreator(""); setRegAmount(""); setRegNotes(""); setRegFile(null);
    },
    onError: () => toast({ title: t("finanzas.coll.toast.recordError"), variant: "destructive" }),
  });

  const updateInvoice = useMutation({
    mutationFn: async () => {
      if (!editInvoice) return;
      let evidenceUrl = (editInvoice as any).evidence_url;
      if (editFile) evidenceUrl = await uploadEvidence(editFile);
      const { error } = await supabase.from("invoices").update({
        amount: Number(editAmount),
        net_amount: Number(editAmount),
        status: editStatus,
        notes: editNotes || null,
        evidence_url: evidenceUrl,
      } as any).eq("id", editInvoice.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections-invoices"] });
      toast({ title: t("finanzas.coll.toast.updated") });
      setEditInvoice(null); setEditFile(null);
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections-invoices"] });
      toast({ title: t("finanzas.coll.toast.deleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const handlePrint = (inv: any) => {
    const creatorName = inv.creators?.artistic_name || inv.creators?.name || "—";
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) return;
    // Idioma fijo a propósito: el cobro impreso es un documento para la creadora, no
    // texto de pantalla, y sale en español aunque la app esté en inglés (igual que la
    // factura y la nota de pago).
    const filas: Array<[string, string]> = [
      ["Creadora", creatorName],
      ["Monto", fmtMonto(Number(inv.amount) || 0, "es-CO")],
      ["Estado", inv.status],
      ["Fecha", format(new Date(inv.created_at), "dd/MM/yyyy")],
      ["Notas", inv.notes || "—"],
    ];
    const titulo = `Cobro #${inv.invoice_number}`;
    const tabla = filas.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("");
    w.document.write(`<html><head><title>${titulo}</title><style>body{font-family:sans-serif;padding:2rem}table{width:100%;border-collapse:collapse;margin-top:1rem}td,th{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body><h2>${titulo}</h2><table>${tabla}</table></body></html>`);
    w.document.close();
    w.print();
  };

  const handleExportRow = (inv: any) => {
    exportTableToExcel([{
      Numero: inv.invoice_number,
      Creador: inv.creators?.artistic_name || inv.creators?.name || "",
      Monto: inv.amount,
      Estado: inv.status,
      Fecha: format(new Date(inv.created_at), "dd/MM/yyyy"),
      Notas: inv.notes || "",
    }], `cobro-${inv.invoice_number}`);
  };

  const selectedCreator = creators.find(c => c.id === regCreator);

  const cobrados = invoices.filter(i => i.status === "pagada");
  const pendientes = invoices.filter(i => i.status === "enviada");
  const vencidos = invoices.filter(i => i.status === "vencida");
  const sinCobro = invoices.filter(i => !i.creator_id || Number(i.amount) === 0);

  const totalCobrado = cobrados.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalPendiente = pendientes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalVencido = vencidos.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const quincenales = invoices.filter(i => i.payment_method === "quincenal");
  const mensuales = invoices.filter(i => i.payment_method !== "quincenal");
  const montoQuincenal = quincenales.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const montoMensual = mensuales.reduce((s, i) => s + (Number(i.amount) || 0), 0);

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

  const pieStatusData = [
    { name: t("finanzas.coll.paidPl"), value: cobrados.length, color: STATUS_COLORS.pagada },
    { name: t("common.pendingPl"), value: pendientes.length, color: STATUS_COLORS.enviada },
    { name: t("finanzas.coll.overduePl"), value: vencidos.length, color: STATUS_COLORS.vencida },
    { name: t("finanzas.coll.noCharge"), value: sinCobro.length, color: STATUS_COLORS.sin_cobro },
  ].filter(d => d.value > 0);

  const pieMoneyData = [
    { name: t("finanzas.coll.paidM"), value: totalCobrado, color: STATUS_COLORS.pagada },
    { name: t("common.pending"), value: totalPendiente, color: STATUS_COLORS.enviada },
    { name: t("finanzas.coll.overdueM"), value: totalVencido, color: STATUS_COLORS.vencida },
  ].filter(d => d.value > 0);

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(now, 5 - i);
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const mInvoices = invoices.filter(inv => { const d = new Date(inv.created_at); return d >= mStart && d <= mEnd; });
    return {
      month: format(month, "MMM", { locale: f.fechas }),
      pagadas: mInvoices.filter(i => i.status === "pagada").reduce((s, i) => s + (Number(i.amount) || 0), 0),
      pendientes: mInvoices.filter(i => i.status === "enviada").reduce((s, i) => s + (Number(i.amount) || 0), 0),
      vencidas: mInvoices.filter(i => i.status === "vencida").reduce((s, i) => s + (Number(i.amount) || 0), 0),
    };
  });

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

  const openEdit = (inv: any) => {
    setEditInvoice(inv);
    setEditAmount(String(inv.amount || ""));
    setEditStatus(inv.status);
    setEditNotes(inv.notes || "");
    setEditFile(null);
  };

  // Etiqueta del estado en la tabla de cobros: acá "enviada" se lee como pendiente.
  const estadoCobro = (status: string) =>
    status === "pagada" ? t("finanzas.status.invoice.paid") :
    status === "enviada" ? t("common.pending") :
    status === "vencida" ? t("finanzas.status.invoice.overdue") :
    estadoFactura(t, status);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title="Collections"
          subtitle={t("finanzas.coll.subtitle", { n: invoices.length })}
          actions={
            <Button size="sm" onClick={() => setShowRegisterModal(true)}>
              <Plus className="h-4 w-4 mr-1" />{t("finanzas.coll.record")}
            </Button>
          }
        />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs estilo estándar — cada uno abre modal con detalle */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label="Total" value={String(invoices.length)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.coll.kpi.gross", { amount: fmt(totalCobrado + totalPendiente + totalVencido) })} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("finanzas.coll.paidPl")} value={String(cobrados.length)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={fmt(totalCobrado)} onClick={() => setKpiPopup("pagadas")} />
              <StatChip label={t("common.pendingPl")} value={String(pendientes.length)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={fmt(totalPendiente)} onClick={() => setKpiPopup("pendientes")} />
              <StatChip label={t("finanzas.coll.overduePl")} value={String(vencidos.length)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-destructive" hint={fmt(totalVencido)} onClick={() => setKpiPopup("vencidas")} />
              <StatChip label={t("finanzas.coll.noCharge")} value={String(sinCobro.length)} icon={<Ban className="h-3.5 w-3.5" />} color="bg-muted-foreground" hint="$0" onClick={() => setKpiPopup("sinCobro")} />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map(pestana => (
            <Button key={pestana} variant={tab === pestana ? "secondary" : "ghost"} size="sm" onClick={() => setTab(pestana)}>{t(TAB_LABEL[pestana])}</Button>
          ))}
        </div>

        {tab === "Dashboard" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/15">{t("finanzas.coll.biweekly")}</Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{quincenales.length} <span className="text-sm font-normal text-muted-foreground">{t("finanzas.common.creatorsF")}</span></p>
                <p className="text-sm text-muted-foreground mt-1">{t("finanzas.coll.biweeklyHint", { amount: fmt(montoQuincenal) })}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">{t("finanzas.coll.monthly")}</Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">{mensuales.length} <span className="text-sm font-normal text-muted-foreground">{t("finanzas.common.creatorsF")}</span></p>
                <p className="text-sm text-muted-foreground mt-1">{t("finanzas.coll.monthlyHint", { amount: fmt(montoMensual) })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatChip label={t("finanzas.coll.kpi.lastMonthSales")} value={fmt(ventasUltimoMes)} icon={<TrendingUp className="h-3.5 w-3.5" />} hint="Total invoices" color="bg-success" />
              <StatChip label={t("finanzas.coll.kpi.avg6")} value={fmt(promedio6)} icon={<BarChart3 className="h-3.5 w-3.5" />} hint={t("finanzas.coll.kpi.avg6Hint")} color="bg-primary" />
              <StatChip label={t("finanzas.coll.kpi.partnerFee")} value={fmt(comisionSocios)} icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("finanzas.coll.kpi.partnerFeeHint")} color="bg-warning" />
              <StatChip label={t("finanzas.coll.kpi.netBilling")} value={fmt(facturacionNeta)} icon={<DollarSign className="h-3.5 w-3.5" />} hint={t("finanzas.coll.kpi.netBillingHint")} color="bg-accent" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">{t("finanzas.coll.chart.status")}</h3>
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
                ) : <p className="text-sm text-muted-foreground text-center py-12">{t("common.noData")}</p>}
              </div>
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">{t("finanzas.coll.chart.money")}</h3>
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
                ) : <p className="text-sm text-muted-foreground text-center py-12">{t("common.noData")}</p>}
              </div>
              <div className="rounded-lg border border-border p-4 bg-card">
                <h3 className="text-sm font-medium text-foreground mb-4">{t("finanzas.coll.chart.monthly")}</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }} />
                    <Bar dataKey="pagadas" name={t("finanzas.coll.paidPl")} stackId="a" fill={STATUS_COLORS.pagada} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pendientes" name={t("common.pendingPl")} stackId="a" fill={STATUS_COLORS.enviada} />
                    <Bar dataKey="vencidas" name={t("finanzas.coll.overduePl")} stackId="a" fill={STATUS_COLORS.vencida} radius={[4, 4, 0, 0]} />
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
                <Input placeholder={t("finanzas.coll.searchPlaceholder")} className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter || undefined} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  <SelectItem value="pagada">{t("finanzas.status.invoice.paid")}</SelectItem>
                  <SelectItem value="pendiente">{t("common.pending")}</SelectItem>
                  <SelectItem value="vencida">{t("finanzas.status.invoice.overdue")}</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }} />
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")} aria-label={t("finanzas.common.viewList")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")} aria-label={t("finanzas.common.viewGrid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filteredCobros.map(inv => ({ Numero: inv.invoice_number, Creador: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "", Monto: inv.amount, Estado: inv.status, Fecha: format(new Date(inv.created_at), "dd/MM/yyyy") })), "cobros")}>
                <Download className="h-4 w-4 mr-1" />{t("finanzas.common.export")}
              </Button>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
                </Button>
              )}
            </div>

            {viewMode === "list" ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 bg-card border-b">
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("common.number")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.creatorF")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("common.type")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.amount")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.coll.evidence")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">{t("common.date")}</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                      )) : filteredCobros.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">{t("finanzas.coll.empty")}</TableCell></TableRow>
                      ) : filteredCobros.map(inv => (
                        <TableRow key={inv.id} className="hover:bg-muted/30">
                          <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                          <TableCell className="text-sm">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</TableCell>
                          <TableCell className="text-sm">{metodoDePago(t, inv.payment_method)}</TableCell>
                          <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0)}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "pagada" ? "default" : inv.status === "enviada" ? "secondary" : inv.status === "vencida" ? "destructive" : "outline"}>
                              {estadoCobro(inv.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {(inv as any).evidence_url ? (
                              <a href={(inv as any).evidence_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Paperclip className="h-3.5 w-3.5" />{t("common.view")}
                              </a>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t("common.actions")}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewInvoice(inv)}>
                                  <Eye className="h-4 w-4 mr-2" />{t("common.viewDetail")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(inv)}>
                                  <Pencil className="h-4 w-4 mr-2" />{t("common.edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrint(inv)}>
                                  <Printer className="h-4 w-4 mr-2" />{t("finanzas.common.print")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportRow(inv)}>
                                  <FileDown className="h-4 w-4 mr-2" />{t("finanzas.common.export")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteId(inv.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />{t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />) : filteredCobros.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-12">{t("finanzas.coll.empty")}</div>
                ) : filteredCobros.map(inv => (
                  <div key={inv.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-muted-foreground">#{inv.invoice_number}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant={inv.status === "pagada" ? "default" : inv.status === "enviada" ? "secondary" : inv.status === "vencida" ? "destructive" : "outline"} className="text-[10px]">
                          {estadoCobro(inv.status)}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={t("common.actions")}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewInvoice(inv)}><Eye className="h-4 w-4 mr-2" />{t("common.view")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(inv)}><Pencil className="h-4 w-4 mr-2" />{t("common.edit")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint(inv)}><Printer className="h-4 w-4 mr-2" />{t("finanzas.common.print")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExportRow(inv)}><FileDown className="h-4 w-4 mr-2" />{t("finanzas.common.export")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteId(inv.id)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 mr-2" />{t("common.delete")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <p className="text-sm font-medium truncate">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{fmt(Number(inv.amount) || 0)}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{metodoDePago(t, inv.payment_method)}</span>
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
          <DialogHeader><DialogTitle>{t("finanzas.coll.new.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("finanzas.common.creatorF")}</Label>
              <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={creatorOpen} className="w-full justify-between font-normal">
                    {selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : t("finanzas.coll.new.selectCreator")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start" side="bottom">
                  <Command>
                    <CommandInput placeholder={t("finanzas.coll.new.searchCreator")} />
                    <CommandList>
                      <CommandEmpty>{t("finanzas.coll.new.creatorNotFound")}</CommandEmpty>
                      <CommandGroup className="max-h-60 overflow-y-auto">
                        {creators.map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.artistic_name || c.name}
                            onSelect={() => { setRegCreator(c.id); setCreatorOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", regCreator === c.id ? "opacity-100" : "opacity-0")} />
                            {c.artistic_name || c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>{t("finanzas.common.amountUsd")}</Label>
              <Input type="number" placeholder="0.00" value={regAmount} onChange={e => setRegAmount(e.target.value)} />
            </div>
            <div>
              <Label>{t("finanzas.coll.new.detail")}</Label>
              <Textarea placeholder={t("finanzas.coll.new.detailPlaceholder")} value={regNotes} onChange={e => setRegNotes(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>{t("finanzas.coll.new.evidence")}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => setRegFile(e.target.files?.[0] || null)}
              />
              <div className="flex items-center gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-1" />{t("finanzas.coll.attach")}
                </Button>
                {regFile && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{regFile.name}</span>}
                {regFile && <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setRegFile(null)} aria-label={t("finanzas.coll.removeFile")}><X className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterModal(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => registerPayment.mutate()} disabled={!regCreator || !regAmount || registerPayment.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Modal */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("finanzas.coll.view.title")}</DialogTitle></DialogHeader>
          {viewInvoice && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground">{t("common.number")}</span><p className="font-mono">#{viewInvoice.invoice_number}</p></div>
                <div><span className="text-xs text-muted-foreground">{t("common.status")}</span><p><Badge variant={viewInvoice.status === "pagada" ? "default" : viewInvoice.status === "enviada" ? "secondary" : "destructive"}>{estadoFactura(t, viewInvoice.status)}</Badge></p></div>
                <div><span className="text-xs text-muted-foreground">{t("finanzas.common.creatorF")}</span><p>{viewInvoice.creators?.artistic_name || viewInvoice.creators?.name || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">{t("finanzas.common.amount")}</span><p className="font-medium">{fmt(Number(viewInvoice.amount) || 0)}</p></div>
                <div><span className="text-xs text-muted-foreground">{t("common.method")}</span><p>{metodoDePago(t, viewInvoice.payment_method)}</p></div>
                <div><span className="text-xs text-muted-foreground">{t("common.date")}</span><p>{format(new Date(viewInvoice.created_at), "dd/MM/yyyy HH:mm")}</p></div>
              </div>
              {viewInvoice.notes && (
                <div><span className="text-xs text-muted-foreground">{t("finanzas.common.notes")}</span><p className="text-sm mt-1">{viewInvoice.notes}</p></div>
              )}
              {viewInvoice.evidence_url && (
                <div>
                  <span className="text-xs text-muted-foreground">{t("finanzas.coll.evidence")}</span>
                  <a href={viewInvoice.evidence_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline mt-1">
                    <ExternalLink className="h-3.5 w-3.5" />{t("finanzas.coll.view.attachment")}
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editInvoice} onOpenChange={() => setEditInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("finanzas.coll.edit.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("finanzas.common.amountUsd")}</Label>
              <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
            </div>
            <div>
              <Label>{t("common.status")}</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enviada">{t("common.pending")}</SelectItem>
                  <SelectItem value="pagada">{t("finanzas.status.invoice.paid")}</SelectItem>
                  <SelectItem value="vencida">{t("finanzas.status.invoice.overdue")}</SelectItem>
                  <SelectItem value="cancelada">{t("finanzas.status.invoice.canceled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("finanzas.common.notes")}</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>{t("finanzas.coll.evidence")}</Label>
              <input ref={editFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setEditFile(e.target.files?.[0] || null)} />
              <div className="flex items-center gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => editFileRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-1" />{(editInvoice as any)?.evidence_url ? t("finanzas.coll.replace") : t("finanzas.coll.attach")}
                </Button>
                {editFile && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{editFile.name}</span>}
                {(editInvoice as any)?.evidence_url && !editFile && (
                  <a href={(editInvoice as any).evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{t("finanzas.coll.viewCurrent")}</a>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInvoice(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => updateInvoice.mutate()} disabled={updateInvoice.isPending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finanzas.coll.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("finanzas.coll.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteId && deleteInvoice.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("finanzas.kpi.empty")}
        title={(() => {
          switch (kpiPopup) {
            case "total": return t("finanzas.coll.popup.all", { n: invoices.length });
            case "pagadas": return t("finanzas.coll.popup.paid", { n: cobrados.length, amount: fmt(totalCobrado) });
            case "pendientes": return t("finanzas.coll.popup.pending", { n: pendientes.length, amount: fmt(totalPendiente) });
            case "vencidas": return t("finanzas.coll.popup.overdue", { n: vencidos.length, amount: fmt(totalVencido) });
            case "sinCobro": return t("finanzas.coll.popup.noCharge", { n: sinCobro.length });
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "total": return t("finanzas.coll.popup.allSub");
            case "pagadas": return t("finanzas.coll.popup.paidSub");
            case "pendientes": return t("finanzas.coll.popup.pendingSub");
            case "vencidas": return t("finanzas.coll.popup.overdueSub");
            case "sinCobro": return t("finanzas.coll.popup.noChargeSub");
            default: return undefined;
          }
        })()}
        rows={(() => {
          let list: typeof invoices = [];
          switch (kpiPopup) {
            case "total": list = invoices; break;
            case "pagadas": list = cobrados; break;
            case "pendientes": list = pendientes; break;
            case "vencidas": list = vencidos; break;
            case "sinCobro": list = sinCobro; break;
            default: list = [];
          }
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "pagada" ? "success" :
            status === "vencida" ? "destructive" :
            status === "enviada" ? "warning" : "default";
          return list.map((i) => ({
            primary: (i as any).creators?.artistic_name || (i as any).creators?.name || (i as any).recipient_name || `Invoice ${(i as any).invoice_number ?? i.id.slice(0, 8)}`,
            secondary: `${estadoFactura(t, i.status)} · ${i.created_at ? format(new Date(i.created_at), "dd MMM yyyy", { locale: f.fechas }) : "—"}`,
            right: fmt(Number(i.amount) || 0),
            rightTone: tone(i.status as string),
          }));
        })()}
      />
    </div>
  );
}
