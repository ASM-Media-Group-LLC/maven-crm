import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Eye } from "lucide-react";
import type { Notification } from "@/hooks/useNotifications";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { useCaso, useFotosCaso } from "@/hooks/useCasosArgos";
import { tonoAviso, tonoVeredicto } from "@/lib/casosArgos";

// La tarjeta de la campana para los avisos de la revisión de RR. HH. (Alvaro,
// 19/11/2026: «bien bonito, con buen diseño»). Una franja de color según lo que
// pasó (rojo falta, verde limpio, ámbar justificado o pendiente), la foto del
// caso cuando la hay y un botón para abrirlo. Las acciones de archivar/borrar
// llegan desde NotificationItem para que se comporte igual que las demás.

export function esAvisoDeCaso(n: Pick<Notification, "reference_type" | "type">): boolean {
  return n.reference_type === "argos_caso" || n.type.startsWith("argos_caso") || n.type === "argos_reporte_rrhh"
    || n.type.startsWith("argos_grave") || n.type === "argos_resumen_dia" || n.type === "argos_tendencia_semana";
}

export function AvisoCasoArgos({ n, onClick, acciones }: { n: Notification; onClick: () => void; acciones?: ReactNode }) {
  const { t } = useLanguage();
  const f = useFormato();
  const tono = tonoAviso(n.type);
  const colores = tono === "info"
    ? { franja: "bg-primary/60", boton: "text-primary" }
    : tono === "atencion"
      ? { franja: "bg-warning", boton: "text-warning" }
      : { franja: tonoVeredicto(tono).punto, boton: tonoVeredicto(tono).texto };
  // La foto solo en los avisos de UN caso (no en el reporte ni en el de pendientes).
  const esGrave = n.type.startsWith("argos_grave");
  const caso = useCaso(n.reference_id && n.type.startsWith("argos_caso") && !esGrave ? n.reference_id : null);
  const foto = caso.data?.foto_path ?? null;
  const fotos = useFotosCaso(foto ? [foto] : []);
  const url = foto ? fotos.data?.[foto] : undefined;
  const sinLeer = n.status === "new" || (!n.status && !n.is_read);
  const boton = n.type === "argos_grave" ? t("shared.notif.caso.verEnVivo")
    : n.type === "argos_grave_persona" ? t("shared.notif.caso.volver")
    : n.type === "argos_reporte_rrhh" || n.type === "argos_resumen_dia" || n.type === "argos_tendencia_semana" ? t("shared.notif.caso.verReporte")
    : n.type === "argos_casos_del_dia" || n.type === "argos_casos_atraso" ? t("shared.notif.caso.revisar")
      : t("shared.notif.caso.verCaso");

  return (
    <div
      className={`group relative flex items-stretch gap-3 overflow-hidden p-3 pl-4 text-left transition-colors hover:bg-muted/50 cursor-pointer ${sinLeer ? "bg-primary/5" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
    >
      <span aria-hidden className={`absolute inset-y-2 left-1.5 w-1 rounded-full ${colores.franja}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-tight ${sinLeer ? "font-semibold" : ""}`}>{n.title}</p>
        {n.message && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{n.message}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground"><Eye className="h-2.5 w-2.5" />Argos</span>
          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: f.fechas })}</span>
          <span className={`ml-auto inline-flex items-center text-[11px] font-semibold ${colores.boton}`}>{boton}<ChevronRight className="h-3 w-3" /></span>
        </div>
      </div>
      {url && <img src={url} alt="" loading="lazy" className="h-14 w-20 shrink-0 self-center rounded-control border border-border/50 object-cover" />}
      {acciones && <div className="flex shrink-0 items-start gap-1">{acciones}</div>}
    </div>
  );
}
