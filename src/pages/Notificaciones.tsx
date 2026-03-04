import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { resolveDeepLink, MODULE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from "@/lib/notificationHelpers";
import NotificationItem from "@/components/notifications/NotificationItem";
import type { Notification } from "@/hooks/useNotifications";
import { CheckCheck, Archive, Bell } from "lucide-react";

const Notificaciones = () => {
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { notifications, isLoading, markAsRead, markAllAsRead, archiveNotification, archiveAll } =
    useNotifications({ moduleFilter, priorityFilter, statusFilter });

  const { canAccess } = usePermissions();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleClick = (n: Notification) => {
    if (n.status === "new" || (!n.status && !n.is_read)) {
      markAsRead.mutate(n.id);
    }
    if (n.required_permission_module && !canAccess(n.required_permission_module, n.required_permission_submodule ?? undefined)) {
      toast({ title: "Sin acceso", description: "No tienes permiso para ver este recurso.", variant: "destructive" });
      return;
    }
    const url = resolveDeepLink(n.reference_type, n.reference_id, n.deep_link_url);
    navigate(url);
  };

  const clearFilters = () => {
    setModuleFilter(null);
    setPriorityFilter(null);
    setStatusFilter(null);
  };

  const hasFilters = moduleFilter || priorityFilter || statusFilter;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Notificaciones</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => markAllAsRead.mutate()}>
                  <CheckCheck className="h-3 w-3" /> Marcar todas leídas
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => archiveAll.mutate()}>
                  <Archive className="h-3 w-3" /> Archivar todas
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={moduleFilter ?? ""} onValueChange={(v) => setModuleFilter(v || null)}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter ?? ""} onValueChange={(v) => setPriorityFilter(v || null)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter ?? ""} onValueChange={(v) => setStatusFilter(v || null)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>

            {/* List */}
            <div className="border rounded-lg bg-card divide-y">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Cargando...</div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No hay notificaciones{hasFilters ? " con estos filtros" : ""}.
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClickNotification={handleClick}
                    onArchive={(id) => archiveNotification.mutate(id)}
                    showArchive
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Notificaciones;
