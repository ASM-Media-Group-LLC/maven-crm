import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogOut, Search, Filter, ExternalLink } from "lucide-react";
import { useAllOffboardings } from "../useOffboarding";

const STATUS_LABELS: Record<string, { label: string; variant: string }> = {
  en_proceso: { label: "En Proceso", variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { label: "Pend. Aprobación", variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { label: "Pend. Cierre", variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { label: "Finalizado", variant: "bg-muted text-muted-foreground border-border" },
};

const CATEGORIAS = [
  { value: "voluntaria", label: "Voluntaria" },
  { value: "involuntaria", label: "Involuntaria" },
  { value: "mutuo_acuerdo", label: "Mutuo Acuerdo" },
  { value: "incumplimiento", label: "Incumplimiento" },
  { value: "otro", label: "Otro" },
];

const OffboardingListPage = () => {
  const navigate = useNavigate();
  const { data: offboardings, isLoading } = useAllOffboardings();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filtered = (offboardings ?? []).filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (categoryFilter !== "all" && o.categoria !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        o.creator_name?.toLowerCase().includes(q) ||
        o.artistic_name?.toLowerCase().includes(q) ||
        o.instagram_handle?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const stats = {
    total: offboardings?.length ?? 0,
    enProceso: offboardings?.filter((o) => o.status === "en_proceso").length ?? 0,
    pendientes: offboardings?.filter((o) => o.status === "pendiente_aprobacion" || o.status === "pendiente_cierre").length ?? 0,
    finalizados: offboardings?.filter((o) => o.status === "finalizado").length ?? 0,
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <LogOut className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Offboarding</h1>
                <p className="text-sm text-muted-foreground">Gestión centralizada de procesos de salida</p>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                { label: "En Proceso", value: stats.enProceso, color: "text-primary" },
                { label: "Pendientes", value: stats.pendientes, color: "text-warning" },
                { label: "Finalizados", value: stats.finalizados, color: "text-muted-foreground" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o Instagram..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Cargando...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No se encontraron offboardings</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Fecha Salida</TableHead>
                        <TableHead>Aprobaciones</TableHead>
                        <TableHead>Checklist</TableHead>
                        <TableHead className="text-right">Revenue Perdido</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => {
                        const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.en_proceso;
                        const checkDone = [o.check_pagos, o.check_material, o.check_campanas, o.check_accesos, o.check_documentacion].filter(Boolean).length;
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/creadores/offboarding/${o.id}`)}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{o.creator_name ?? "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {o.artistic_name ?? o.instagram_handle ?? ""}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${st.variant}`}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {CATEGORIAS.find((c) => c.value === o.categoria)?.label ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">{o.exit_date ?? "—"}</TableCell>
                            <TableCell className="text-sm">{o.approval_count ?? 0}/2</TableCell>
                            <TableCell className="text-sm">{checkDone}/5</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {o.estimated_lost_revenue != null
                                ? `$${Number(o.estimated_lost_revenue).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/creadores/${o.creator_id}`);
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default OffboardingListPage;
