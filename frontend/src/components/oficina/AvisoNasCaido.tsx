import { CloudOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useNasSalud } from "@/hooks/useNasSalud";

// Aviso de NAS caído (Alvaro, 05/11): PERMANENTE mientras el NAS esté caído.
// No se puede cerrar (quitamos la X). Lo ven dueño + admins + todos los que
// tienen Drive full (la RLS de drive_nas_salud lo fuerza vía drive_tiene_full).
// Se quita SOLO cuando el NAS vuelve (caido = false).

function hora(desde: string | null): string {
  if (!desde) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(desde));
  } catch {
    return "";
  }
}

export function AvisoNasCaido() {
  const { t } = useLanguage();
  const { caido, desde, pendientes } = useNasSalud();

  if (!caido) return null;

  return (
    <>
      {/* Franja permanente en el header (sin cerrar). */}
      <div role="status" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive animate-pulse">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{t("drive.nas.caidoFranja", { n: pendientes })}</span>
      </div>

      {/* Pop-up fijo abajo a la derecha — SIN botón de cerrar. Se va solo cuando
          el NAS vuelve a estar arriba (desde la base). */}
      <div role="alertdialog" aria-live="assertive" className="vidrio vidrio-glow fixed bottom-4 right-4 z-[60] w-[min(92vw,22rem)] rounded-2xl border border-destructive/50 p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
            <CloudOff className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("drive.nas.caidoTitulo")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("drive.nas.caidoCuerpo", { n: pendientes })}</p>
            {desde && <p className="mt-2 text-[11px] text-muted-foreground/80">{t("drive.nas.desde", { t: hora(desde) })}</p>}
            <p className="mt-2 text-[11px] font-semibold text-destructive">{t("drive.nas.permanente")}</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default AvisoNasCaido;
