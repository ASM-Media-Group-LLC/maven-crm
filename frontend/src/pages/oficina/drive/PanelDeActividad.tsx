import { useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, AlertTriangle, FolderInput, FolderPlus, Link2, Loader2, Pencil, RotateCcw, Trash2, Upload, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useActividadDrive, type AccionDrive, type EventoActividad } from "@/hooks/useActividadDrive";
import type { TranslationKey } from "@/lib/i18n";

// La pestaña ACTIVIDAD del panel del Drive (Alvaro, 04/11), como en Google:
// "Fulano subió 23 elementos · Hoy 1:41 p. m." con la lista de lo que tocó.
// Agrupa eventos seguidos del mismo actor + misma acción dentro de ~2 min (así
// una subida de 23 archivos es UNA línea, no 23). Agrupado por día (Hoy/Ayer).

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const ICONO: Record<AccionDrive, LucideIcon> = {
  subio: Upload, creo_carpeta: FolderPlus, renombro: Pencil, movio: FolderInput,
  a_papelera: Trash2, restauro: RotateCcw, borro: Trash2,
};
const VERBO: Record<AccionDrive, TranslationKey> = {
  subio: "drive.actividad.subio", creo_carpeta: "drive.actividad.creoCarpeta",
  renombro: "drive.actividad.renombro", movio: "drive.actividad.movio",
  a_papelera: "drive.actividad.aPapelera", restauro: "drive.actividad.restauro",
  borro: "drive.actividad.borro",
};

interface Grupo {
  actorId: string | null;
  actorNombre: string;
  actorAvatarUrl: string | null;
  actorAvatarSeed: string | null;
  accion: AccionDrive;
  items: string[];
  createdAt: string;
  bkt: number;
  viaLink: boolean;
  quien: string | null;
}

// Agrupa eventos seguidos del mismo actor y acción en la misma ventana de 2 min.
// Los de link (actor null) se separan por `quien`: dos invitados distintos no se
// juntan en una línea.
export function agrupar(eventos: EventoActividad[]): Grupo[] {
  const bkt = (iso: string) => Math.floor(Date.parse(iso) / 120000);
  const grupos: Grupo[] = [];
  for (const e of eventos) {
    const ult = grupos[grupos.length - 1];
    if (
      ult && ult.actorId === e.actorId && ult.accion === e.accion && ult.bkt === bkt(e.createdAt) &&
      ult.viaLink === e.viaLink && ult.quien === e.quien
    ) {
      if (e.nombre) ult.items.push(e.nombre);
    } else {
      grupos.push({
        actorId: e.actorId, actorNombre: e.actorNombre, actorAvatarUrl: e.actorAvatarUrl,
        actorAvatarSeed: e.actorAvatarSeed, accion: e.accion, items: e.nombre ? [e.nombre] : [],
        createdAt: e.createdAt, bkt: bkt(e.createdAt), viaLink: e.viaLink, quien: e.quien,
      });
    }
  }
  return grupos;
}

function cosaDe(accion: AccionDrive, n: number, t: Tr): string {
  if (accion === "creo_carpeta") return t(n === 1 ? "drive.actividad.carpeta" : "drive.actividad.carpetas");
  return t(n === 1 ? "drive.actividad.elemento" : "drive.actividad.elementos");
}

function etiquetaDia(iso: string, t: Tr): string {
  const d = new Date(iso);
  if (isToday(d)) return t("drive.actividad.hoy");
  if (isYesterday(d)) return t("drive.actividad.ayer");
  return format(d, "d 'de' MMMM", { locale: es });
}

const TOPE_ITEMS = 6;

export default function PanelDeActividad({ itemId, activo }: { itemId: string | null; activo: boolean }) {
  const { t } = useLanguage();
  const { eventos, cargando, error, refrescar } = useActividadDrive(itemId, activo);
  const grupos = useMemo(() => agrupar(eventos), [eventos]);

  if (cargando && eventos.length === 0) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive/70" />
        <p className="text-sm text-muted-foreground">{t("drive.actividad.error")}</p>
        <button type="button" onClick={() => void refrescar()} className="text-sm text-primary hover:underline">{t("drive.actividad.reintentar")}</button>
      </div>
    );
  }
  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{t("drive.actividad.vacio")}</p>
      </div>
    );
  }

  // Cabeceras por día (Hoy / Ayer / fecha), lo más reciente primero.
  let diaActual = "";
  return (
    <div className="flex flex-col gap-1">
      {grupos.map((g, i) => {
        const dia = etiquetaDia(g.createdAt, t);
        const nuevoDia = dia !== diaActual;
        diaActual = dia;
        const n = g.items.length || 1;
        const frase = t(VERBO[g.accion], { n, cosa: cosaDe(g.accion, n, t) });
        const Icono = ICONO[g.accion];
        const extra = g.items.length - TOPE_ITEMS;
        // Nombre a mostrar: del link usa `quien` (o "Invitado"); si no, el perfil.
        const nombreMostrado = g.viaLink
          ? (g.quien || t("drive.actividad.invitado"))
          : (g.actorNombre || t("hr.noName"));
        return (
          <div key={i}>
            {nuevoDia && (
              <p className="mb-1.5 mt-3 border-b border-border/50 pb-1 text-xs font-semibold capitalize text-muted-foreground first:mt-0">{dia}</p>
            )}
            <div className="flex gap-3 rounded-xl px-1 py-2">
              <UserAvatar name={nombreMostrado} src={g.actorAvatarUrl} seed={g.actorAvatarSeed} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{nombreMostrado}</span>{" "}
                  <span className="text-muted-foreground">{frase}</span>
                  {g.viaLink && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px align-middle text-[10px] font-medium text-primary">
                      <Link2 className="h-2.5 w-2.5" />{t("drive.actividad.porLink")}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Icono className="h-3 w-3 shrink-0" />
                  <time dateTime={g.createdAt}>{format(new Date(g.createdAt), "h:mm a", { locale: es })}</time>
                </p>
                {g.items.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {g.items.slice(0, TOPE_ITEMS).map((nombre, j) => (
                      <span key={j} className="truncate rounded-lg border border-border/40 bg-card/30 px-2 py-1 text-xs">{nombre}</span>
                    ))}
                    {extra > 0 && <span className="px-1 text-[11px] text-muted-foreground">{t("drive.actividad.yTantos", { n: extra })}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
