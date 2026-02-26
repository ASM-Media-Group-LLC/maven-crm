import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Power, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAnnouncementsAdmin, useUpdateAnnouncement, type AnnouncementRow } from "./announcements/useAnnouncementsAdmin";
import CreateAnnouncementModal from "./announcements/CreateAnnouncementModal";
import EditAnnouncementModal from "./announcements/EditAnnouncementModal";
import DeleteAnnouncementDialog from "./announcements/DeleteAnnouncementDialog";

const TYPE_LABELS: Record<string, string> = {
  general: "General",
  policy: "Política",
  celebration: "Celebración",
  holiday: "Feriado",
};

const PRIORITY_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary",
  normal: "default",
  high: "destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
};

const HRAnnouncements = () => {
  const { data: announcements = [], isLoading } = useAnnouncementsAdmin();
  const toggleActive = useUpdateAnnouncement();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnouncementRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const filtered = useMemo(() => {
    let result = announcements;
    if (filterType !== "all") result = result.filter((a) => a.announcement_type === filterType);
    if (filterPriority !== "all") result = result.filter((a) => a.priority === filterPriority);
    return result;
  }, [announcements, filterType, filterPriority]);

  const stats = useMemo(() => {
    const active = announcements.filter((a) => a.is_active).length;
    const high = announcements.filter((a) => a.priority === "high" && a.is_active).length;
    const expired = announcements.filter((a) => a.expires_at && new Date(a.expires_at) < new Date()).length;
    return { active, high, expired, total: announcements.length };
  }, [announcements]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Anuncios Internos</h1>
            <p className="text-sm text-muted-foreground">Gestión de comunicados y avisos para el equipo</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo Anuncio
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Activos", value: stats.active, color: "text-success" },
            { label: "Alta Prioridad", value: stats.high, color: "text-destructive" },
            { label: "Expirados", value: stats.expired, color: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Prioridad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Expiración</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin anuncios</TableCell></TableRow>
              ) : (
                filtered.map((a) => {
                  const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{a.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[a.announcement_type] ?? a.announcement_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANTS[a.priority] ?? "default"}>
                          {PRIORITY_LABELS[a.priority] ?? a.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(a.starts_at), "d MMM yyyy HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.expires_at
                          ? format(new Date(a.expires_at), "d MMM yyyy HH:mm", { locale: es })
                          : "Sin expiración"}
                      </TableCell>
                      <TableCell>
                        {isExpired ? (
                          <Badge variant="secondary">Expirado</Badge>
                        ) : a.is_active ? (
                          <Badge className="bg-success/10 text-success hover:bg-success/20">Activo</Badge>
                        ) : (
                          <Badge variant="secondary">Inactivo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => toggleActive.mutate({ id: a.id, is_active: !a.is_active })}
                            title={a.is_active ? "Desactivar" : "Activar"}
                          >
                            <Power className={`h-4 w-4 ${a.is_active ? "text-success" : "text-muted-foreground"}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(a.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </main>

      <CreateAnnouncementModal open={createOpen} onOpenChange={setCreateOpen} />
      <EditAnnouncementModal open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)} announcement={editTarget} />
      <DeleteAnnouncementDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} announcementId={deleteId} />
    </div>
  );
};

export default HRAnnouncements;
