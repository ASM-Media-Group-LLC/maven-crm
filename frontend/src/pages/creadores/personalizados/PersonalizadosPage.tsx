import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Trash2, FileText, Clock, Loader, CheckCircle2, AlertTriangle, MessageSquare, XCircle, ImageIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import KpiCard from "@/components/dashboard/KpiCard";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useCustomRequests, type CustomContentRequest } from "./useCustomRequests";
import NewRequestModal from "./NewRequestModal";
import ViewRequestModal from "./ViewRequestModal";
import CreadoresHeader from "../CreadoresHeader";
import TrackingDrawer from "./TrackingDrawer";

const TYPE_COLORS: Record<string, string> = {
  foto: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  video: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  audio: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  texto: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  otro: "bg-muted text-muted-foreground",
};

const getAlertIcon = (r: CustomContentRequest) => {
  if (r.status === "completado") return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (!r.due_date) return <span className="text-muted-foreground">—</span>;
  const overdue = new Date(r.due_date) < new Date();
  if (overdue) return <XCircle className="h-4 w-4 text-red-400" />;
  return <Clock className="h-4 w-4 text-yellow-400" />;
};


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
  const [drawerRequest, setDrawerRequest] = useState<CustomContentRequest | null>(null);

  const handleRowClick = (r: CustomContentRequest) => {
    const isOverdue = r.status !== "completado" && !!r.due_date && new Date(r.due_date) < new Date();
    if (isOverdue) {
      setDrawerRequest(r);
    } else {
      setViewRequest(r);
    }
  };

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
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <CreadoresHeader
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Solicitud
            </Button>
          }
        />

        <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiCard label="Total Solicitudes" value={String(total)} icon={FileText} color="bg-blue-500" subtitle="Todas las solicitudes" onClick={() => setStatusFilter("all")} />
              <KpiCard label="Pendientes" value={String(pendientes)} icon={Clock} color="bg-amber-500" subtitle="Por gestionar" onClick={() => setStatusFilter("pendiente")} />
              <KpiCard label="En Progreso" value={String(enProgreso)} icon={Loader} color="bg-violet-500" subtitle="En proceso" onClick={() => setStatusFilter("en_progreso")} />
              <KpiCard label="Completadas" value={String(completadas)} icon={CheckCircle2} color="bg-emerald-500" subtitle="Finalizadas" onClick={() => setStatusFilter("completada")} />
              <KpiCard label="Alertas Críticas" value={String(alertas)} icon={AlertTriangle} color="bg-rose-500" subtitle={alertas > 0 ? "Solicitudes vencidas" : "Sin alertas"} />
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

            <div className="rounded-lg border bg-card overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">Creadora</TableHead>
                    <TableHead className="text-xs">Tipo de Contenido</TableHead>
                    <TableHead className="text-xs">Fecha Límite</TableHead>
                    <TableHead className="text-xs">Chatter/Usuario</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Notas</TableHead>
                    <TableHead className="text-xs text-center">Alerta de Envío</TableHead>
                    <TableHead className="text-xs text-right sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay solicitudes</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => handleRowClick(r)}>
                        <TableCell className="font-medium">{r.creators?.artistic_name || r.creators?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${TYPE_COLORS[r.content_type] || TYPE_COLORS.otro}`}>{r.content_type}</Badge>
                        </TableCell>
                        <TableCell>{r.due_date ? format(new Date(r.due_date), "dd MMM yyyy", { locale: es }) : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.profiles?.full_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>{STATUS_LABELS[r.status] || r.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 bg-card border p-4 space-y-3" side="left" onClick={(e) => e.stopPropagation()}>
                              <p className="text-sm font-semibold">{r.title}</p>
                              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                              {r.notes && (
                                <div className="border-t pt-2">
                                  <p className="text-xs font-medium mb-1">Notas / Detalles de pago</p>
                                  <p className="text-xs text-muted-foreground">{r.notes}</p>
                                </div>
                              )}
                              <div className="border-t pt-2">
                                <p className="text-xs font-medium mb-1">Fotos de referencia</p>
                                <div className="flex items-center justify-center h-16 rounded-md border border-dashed">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="text-center">{getAlertIcon(r)}</TableCell>
                        <TableCell className="text-right sticky right-0 bg-card">
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
        </div>
      </main>

      <NewRequestModal open={newOpen} onOpenChange={setNewOpen} />
      <ViewRequestModal request={viewRequest} open={!!viewRequest} onOpenChange={(open) => !open && setViewRequest(null)} />
      <TrackingDrawer request={drawerRequest} open={!!drawerRequest} onOpenChange={(open) => !open && setDrawerRequest(null)} />
    </>
  );
};

export default PersonalizadosPage;
