import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { resolveDeepLink } from "@/lib/notificationHelpers";
import { useLanguage } from "@/hooks/useLanguage";
import NotificationItem from "./NotificationItem";
import type { Notification } from "@/hooks/useNotifications";

export default function NotificationBell() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  const { notifications, unreadCount, markAsRead, markAllAsRead, archiveNotification } = useNotifications();

  // En la campana del topbar solo mostramos las NO LEÍDAS. Las leídas
  // siguen accesibles en /notificaciones (la página completa). Sin este
  // filtro, las leídas se quedaban en la lista y daban la sensación de
  // que la campana no se "limpiaba" al verlas.
  const unread = notifications.filter(
    (n) => n.status === "new" || (!n.status && !n.is_read),
  );

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <p className="text-sm font-medium">{t("topbar.notifications")}</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => markAllAsRead.mutate()}
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </Button>
          )}
        </div>
        {/* ScrollArea con altura FIJA (no max-h) — radix necesita altura
            definida para que su viewport interno active el scrollbar.
            Antes tenía max-h-72 y por eso no había scroll. */}
        <ScrollArea className="h-[360px]">
          {unread.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">{t("topbar.noNotifications")}</p>
          ) : (
            <div className="divide-y">
              {unread.slice(0, 50).map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClickNotification={handleClick}
                  onArchive={(id) => archiveNotification.mutate(id)}
                  showArchive
                />
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => navigate("/notificaciones")}
          >
            Ver todas las notificaciones
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
