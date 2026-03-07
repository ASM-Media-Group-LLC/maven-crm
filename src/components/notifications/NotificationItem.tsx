import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Notification } from "@/hooks/useNotifications";
import { getModuleIcon, getTypeIcon, getPriorityDotClass } from "@/lib/notificationHelpers";

interface Props {
  notification: Notification;
  onClickNotification: (n: Notification) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchive?: boolean;
}

export default function NotificationItem({ notification: n, onClickNotification, onArchive, onDelete, showArchive }: Props) {
  const ModuleIcon = n.module_origin ? getModuleIcon(n.module_origin) : getTypeIcon(n.type);
  const isUnread = n.status === "new" || (!n.status && !n.is_read);
  const dotClass = getPriorityDotClass(n.priority);

  return (
    <div
      className={`group flex items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer ${isUnread ? "bg-primary/5" : ""}`}
      onClick={() => onClickNotification(n)}
      role="button"
      tabIndex={0}
    >
      {/* Priority dot */}
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${isUnread ? dotClass : "bg-transparent"}`} />

      {/* Module icon */}
      <ModuleIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${isUnread ? "font-semibold" : ""}`}>{n.title}</p>
        {n.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
          </p>
          {n.module_origin && (
            <span className="text-[10px] px-1.5 py-0 rounded bg-muted text-muted-foreground capitalize">
              {n.module_origin}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {showArchive && onArchive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(n.id);
                }}
              >
                <Archive className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archivar</TooltipContent>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(n.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Eliminar</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
