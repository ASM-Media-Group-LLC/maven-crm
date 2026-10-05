import { formatDistanceToNow } from "date-fns";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Notification } from "@/hooks/useNotifications";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { getModuleIcon, getTypeIcon, getPriorityDotClass } from "@/lib/notificationHelpers";

// El chip del módulo de origen muestra `module_origin`, que es el valor guardado
// en la base. En español se deja tal cual (como siempre); en inglés, los que
// tienen nombre en español se dicen con el diccionario. Los que ya son un
// nombre propio (messenger, closers, leadgen, tickets, admin) quedan igual.
const MODULO_EN_INGLES: Record<string, TranslationKey> = {
  creadores: "shared.notif.module.creadores",
  "chatter-evaluator": "shared.notif.module.chatterEvaluator",
  finanzas: "shared.notif.module.finanzas",
  tareas: "shared.notif.module.tareas",
  eventos: "shared.notif.module.eventos",
  correo: "shared.notif.module.correo",
  "comunicación": "shared.notif.module.comunicacion",
  comunicacion: "shared.notif.module.comunicacion",
  hr: "shared.notif.module.hr",
  rrhh: "shared.notif.module.hr",
};

interface Props {
  notification: Notification;
  onClickNotification: (n: Notification) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchive?: boolean;
}

export default function NotificationItem({ notification: n, onClickNotification, onArchive, onDelete, showArchive }: Props) {
  const f = useFormato();
  const { t, language } = useLanguage();
  const ModuleIcon = n.module_origin ? getModuleIcon(n.module_origin) : getTypeIcon(n.type);
  const isUnread = n.status === "new" || (!n.status && !n.is_read);
  const dotClass = getPriorityDotClass(n.priority);
  const claveModulo = n.module_origin ? MODULO_EN_INGLES[n.module_origin.toLowerCase()] : undefined;
  // Con etiqueta del diccionario ya viene en sentence case («Chatter evaluator»):
  // `capitalize` la pasaría a «Chatter Evaluator». Solo el valor crudo de la base
  // (español, o uno sin traducción como «messenger») se sigue capitalizando.
  const usaDiccionario = language === "en" && !!claveModulo;
  const nombreModulo = usaDiccionario && claveModulo ? t(claveModulo) : n.module_origin;

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
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: f.fechas })}
          </p>
          {n.module_origin && (
            <span className={`text-[10px] px-1.5 py-0 rounded bg-muted text-muted-foreground${usaDiccionario ? "" : " capitalize"}`}>
              {nombreModulo}
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
                aria-label={t("shared.notif.archive")}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(n.id);
                }}
              >
                <Archive className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("shared.notif.archive")}</TooltipContent>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                aria-label={t("common.delete")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(n.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("common.delete")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
