import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Trash2, FileText, Clock, Loader, CheckCircle2, AlertTriangle } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useCustomRequests, type CustomContentRequest } from "./useCustomRequests";
import NewRequestModal from "./NewRequestModal";
import ViewRequestModal from "./ViewRequestModal";


const STATUS_COLORS: Record<string, string> = {
  pendiente: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  en_progreso: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completado: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelado: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En Progreso",
  completado: "Completado",
  cancelado: "Cancelado",
};

const PRIORITY_COLORS: Record<string, string> = {
  baja: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/20 text-blue-400",
  alta: "bg-orange-500/20 text-orange-400",
  urgente: "bg-red-500/20 text-red-400",
};

const PersonalizadosPage = () => {
  const { requests, isLoading, deleteRequest } = useCustomRequests();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<CustomContentRequest | null>(null);

  const filtered = requests.filter((r) => {
    const matchSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.creators?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.creators?.artistic_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchType = typeFilter === "all" || r.content_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const total = requests.length;
  const pendientes = requests.filter((r) => r.status === "pendiente").length;
  const enProgreso = requests.filter((r) => r.status === "en_progreso").length;
  const completadas = requests.filter((r) => r.status === "completado").length;
  const alertas = requests.filter(
    (r) => r.status === "pendiente" && r.due_date && new Date(r.due_date) < new Date()
  ).length;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto px-6 py-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">Contenido Personalizado</h1>
                <p className="text-sm text-muted-foreground">Solicitudes de contenido personalizado para creadoras</p>
              </div>
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Solicitud
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <DashboardMetricCard label="Total Solicitudes" value={String(total)} icon={FileText} subtitle="Todas las solicitudes" color="primary" />
              <DashboardMetricCard label="Pendientes" value={String(pendientes)} icon={Clock} subtitle="Por gestionar" color="warning" />
              <DashboardMetricCard label="En Progreso" value={String(enProgreso)} icon={Loader} subtitle="En proceso" color="accent" />
              <DashboardMetricCard label="Completadas" value={String(completadas)} icon={CheckCircle2} subtitle="Finalizadas" color="success" />
              <DashboardMetricCard label="Alertas Críticas" value={String(alertas)} icon={AlertTriangle} subtitle={alertas > 0 ? "Solicitudes vencidas" : "Sin alertas"} color="destructive" />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por título o creadora..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_progreso">En Progreso</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="foto">Foto</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="audio">Audio</SelectItem>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Creadora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Fecha Límite</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay solicitudes</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewRequest(r)}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell>{r.creators?.artistic_name || r.creators?.name || "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{r.content_type}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>{STATUS_LABELS[r.status] || r.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PRIORITY_COLORS[r.priority] || ""}>{r.priority}</Badge>
                        </TableCell>
                        <TableCell>{r.due_date ? format(new Date(r.due_date), "dd MMM yyyy", { locale: es }) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewRequest(r); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteRequest.mutate(r.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </main>
        </div>
      </div>

      <NewRequestModal open={newOpen} onOpenChange={setNewOpen} />
      <ViewRequestModal request={viewRequest} open={!!viewRequest} onOpenChange={(open) => !open && setViewRequest(null)} />
    </SidebarProvider>
  );
};

export default PersonalizadosPage;
