import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Copy, Archive, Eye, Megaphone, MoreHorizontal, FileText, CheckCircle, Clock, Edit3, Eye as EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useAnnouncementsAdmin,
  useUpdateAnnouncement,
  useDuplicateAnnouncement,
  useArchiveAnnouncement,
  type AnnouncementRow,
} from "./announcements/useAnnouncementsAdmin";
import AnnouncementFilters from "./announcements/AnnouncementFilters";
import CreateAnnouncementModal from "./announcements/CreateAnnouncementModal";
import EditAnnouncementModal from "./announcements/EditAnnouncementModal";
import DeleteAnnouncementDialog from "./announcements/DeleteAnnouncementDialog";
import AnnouncementDetailModal from "./announcements/AnnouncementDetailModal";

const TYPE_LABELS: Record<string, string> = {
  general: "General", policy: "Política", celebration: "Celebración",
  holiday: "Feriado", urgent: "Urgente", reminder: "Recordatorio", update: "Actualización",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-destructive/10 text-destructive",
};

const PRIORITY_LABELS: Record<string, string> = { low: "Baja", normal: "Normal", high: "Alta" };

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Programado", className: "bg-warning/10 text-warning" },
  active: { label: "Activo", className: "bg-success/10 text-success" },
  expired: { label: "Expirado", className: "bg-muted text-muted-foreground" },
  archived: { label: "Archivado", className: "bg-muted text-muted-foreground" },
};

const STATUS_TABS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "scheduled", label: "Programados" },
  { value: "draft", label: "Borradores" },
  { value: "expired", label: "Expirados" },
  { value: "archived", label: "Archivados" },
];

const HRAnnouncements = () => {
  const { data: announcements = [], isLoading } = useAnnouncementsAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const duplicateAnn = useDuplicateAnnouncement();
  const archiveAnn = useArchiveAnnouncement();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnouncementRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<AnnouncementRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState("all");
  type KpiKey = "total" | "active" | "scheduled" | "draft" | "views";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Deep-link: open announcement detail from ?id= param
  useEffect(() => {
    const id = searchParams.get("id");
    if (id && announcements.length > 0 && !detailTarget) {
      const target = announcements.find((a) => a.id === id);
      if (target) {
        setDetailTarget(target);
        searchParams.delete("id");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, announcements, detailTarget, setSearchParams]);

  const filtered = useMemo(() => {
    let result = announcements;
    if (statusTab !== "all") result = result.filter((a) => a.status === statusTab);
    if (filterType !== "all") result = result.filter((a) => a.announcement_type === filterType);
    if (filterPriority !== "all") result = result.filter((a) => a.priority === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q));
    }
    return result;
  }, [announcements, statusTab, filterType, filterPriority, search]);

  const stats = useMemo(() => {
    const active = announcements.filter((a) => a.status === "active").length;
    const scheduled = announcements.filter((a) => a.status === "scheduled").length;
    const draft = announcements.filter((a) => a.status === "draft").length;
    const totalViews = announcements.reduce((s, a) => s + (a.view_count ?? 0), 0);
    return { total: announcements.length, active, scheduled, draft, totalViews };
  }, [announcements]);

  const audienceLabel = (a: AnnouncementRow) => {
    if (a.visibility === "global") return "Global";
    const targets = a.audience ?? [];
    if (targets.length === 0) return "Global";
    if (targets.length === 1) return targets[0].target_label;
    return `${targets.length} destinos`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Comunicación Interna</h1>
            <p className="text-sm text-muted-foreground">Gestión avanzada de anuncios, avisos y comunicados</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo Anuncio
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs estilo estándar — clickeables (excepto Visualizaciones que es métrica agregada) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Total" value={stats.total} icon={FileText} color="bg-blue-500" onClick={() => setKpiPopup("total")} />
          <KpiCard label="Activos" value={stats.active} icon={CheckCircle} color="bg-emerald-500" onClick={() => setKpiPopup("active")} />
          <KpiCard label="Programados" value={stats.scheduled} icon={Clock} color="bg-amber-500" onClick={() => setKpiPopup("scheduled")} />
          <KpiCard label="Borradores" value={stats.draft} icon={Edit3} color="bg-slate-500" onClick={() => setKpiPopup("draft")} />
          <KpiCard label="Visualizaciones" value={stats.totalViews} icon={EyeIcon} color="bg-violet-500" />
        </div>

        {/* Tabs */}
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Filters */}
        <AnnouncementFilters
          search={search}
          onSearchChange={setSearch}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterPriority={filterPriority}
          onFilterPriorityChange={setFilterPriority}
        />

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Audiencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Publicación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Sin anuncios
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => {
                  const sc = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.draft;
                  return (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailTarget(a)}>
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
                        <Badge className={PRIORITY_COLORS[a.priority]}>{PRIORITY_LABELS[a.priority]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{audienceLabel(a)}</TableCell>
                      <TableCell>
                        <Badge className={sc.className}>{sc.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          {a.view_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(a.starts_at), "d MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailTarget(a)}>
                                <Eye className="mr-2 h-4 w-4" /> Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditTarget(a)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateAnn.mutate(a)}>
                                <Copy className="mr-2 h-4 w-4" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => archiveAnn.mutate(a.id)}>
                                <Archive className="mr-2 h-4 w-4" /> Archivar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(a.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
      <AnnouncementDetailModal open={!!detailTarget} onOpenChange={(v) => !v && setDetailTarget(null)} announcement={detailTarget} />
      <DeleteAnnouncementDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} announcementId={deleteId} />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Anuncios — ${stats.total}`;
            case "active": return `Activos — ${stats.active}`;
            case "scheduled": return `Programados — ${stats.scheduled}`;
            case "draft": return `Borradores — ${stats.draft}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = announcements;
          if (kpiPopup === "active") list = announcements.filter((a) => a.status === "active");
          else if (kpiPopup === "scheduled") list = announcements.filter((a) => a.status === "scheduled");
          else if (kpiPopup === "draft") list = announcements.filter((a) => a.status === "draft");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "active" ? "success" : status === "scheduled" ? "warning" : "default";
          return list.slice(0, 100).map((a): KpiRow => ({
            primary: a.title ?? "Sin título",
            secondary: audienceLabel(a),
            right: a.status ?? "—",
            rightTone: tone(a.status ?? ""),
          }));
        })()}
      />
    </div>
  );
};

export default HRAnnouncements;
