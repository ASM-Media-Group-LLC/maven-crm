import { useState } from "react";
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
import { BOTON_TOPBAR } from "@/components/dashboard/topbarStyles";
import type { Notification } from "@/hooks/useNotifications";

/** `verTodas`: a dónde lleva «Ver todas» (la página completa del equipo). En el
 *  portal de creadoras no hay esa página: null lo esconde. */
export default function NotificationBell({ verTodas = "/notificaciones" }: { verTodas?: string | null } = {}) {
  const navigate = useNavigate();
  // El popover va CONTROLADO para poder cerrarlo al navegar. Radix no lo cierra
  // por su cuenta cuando el clic ocurre DENTRO del panel, así que al ir a
  // /notificaciones el panel quedaba abierto tapando la página y había que dar
  // otro clic afuera. Igual que la nube de Messenger (MessagesBell).
  const [abierta, setAbierta] = useState(false);
  const { t } = useLanguage();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  const { notifications, markAsRead, markAllAsRead, archiveNotification } = useNotifications();

  // Los mensajes del Messenger YA NO alumbran acá: tienen su propia campana (la
  // nube, a la izquierda). Eran el 95% de todo lo que llegaba —17.901 de 18.877
  // en 30 días— y tapaban las notificaciones de verdad: vencimientos de
  // closers, evaluaciones, asignaciones. En /notificaciones se siguen viendo,
  // esa página es el archivo completo.
  // Las MENCIONES (`chat_mention`, las distingue el trigger) SÍ entran: que te
  // nombren con @ no es un mensaje cualquiera, y Jhon probó mencionarse desde la
  // cuenta test y no le llegó nada a ningún lado (16/09).
  const esMensaje = (n: Notification) =>
    n.module_origin === "messenger" && n.type === "chat_message";

  // En la campana del topbar solo mostramos las NO LEÍDAS. Las leídas
  // siguen accesibles en /notificaciones (la página completa). Sin este
  // filtro, las leídas se quedaban en la lista y daban la sensación de
  // que la campana no se "limpiaba" al verlas.
  const unread = notifications.filter(
    (n) => !esMensaje(n) && (n.status === "new" || (!n.status && !n.is_read)),
  );
  const unreadCount = unread.length;

  const handleClick = (n: Notification) => {
    if (n.status === "new" || (!n.status && !n.is_read)) {
      markAsRead.mutate(n.id);
    }
    if (n.required_permission_module && !canAccess(n.required_permission_module, n.required_permission_submodule ?? undefined)) {
      toast({ title: t("common.noAccess"), description: t("common.noPermission"), variant: "destructive" });
      return;
    }
    const url = resolveDeepLink(n.reference_type, n.reference_id, n.deep_link_url);
    setAbierta(false);
    navigate(url);
  };

  return (
    <Popover open={abierta} onOpenChange={setAbierta}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={BOTON_TOPBAR} title={t("topbar.notifications")}>
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
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
              {t("shared.notif.markAll")}
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
        {verTodas && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => { setAbierta(false); navigate(verTodas); }}
            >
              {t("shared.notif.seeAll")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
