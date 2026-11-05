import { useState } from "react";
import { CloudOff, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useNasSalud } from "@/hooks/useNasSalud";

// Aviso de NAS caído para admins/dueño (Alvaro, 05/11): una franja en el header
// y un pop-up abajo a la derecha. Lo alimenta useNasSalud (que se autogatea por
// RLS: para quien no es admin/dueño nunca hay fila y esto no pinta nada). El
// pop-up se puede cerrar y reaparece en cada caída nueva (cambia `desde`); la
// franja queda mientras el NAS siga caído. El correo y este aviso avisan por
// distintos lados la MISMA situación.

const LS = "maven.nas-aviso-cerrado";

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
  const [cerrado, setCerrado] = useState<string | null>(() => {
    try { return localStorage.getItem(LS); } catch { return null; }
  });

  if (!caido) return null;

  const clave = desde ?? "sin-fecha";
  const popupVisible = cerrado !== clave;
  const cerrar = () => {
    try { localStorage.setItem(LS, clave); } catch { /* modo privado: queda en memoria */ }
    setCerrado(clave);
  };

  return (
    <>
      <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{t("drive.nas.caidoFranja", { n: pendientes })}</span>
      </div>

      {popupVisible && (
        <div role="alertdialog" aria-live="assertive" className="vidrio vidrio-glow fixed bottom-4 right-4 z-[60] w-[min(92vw,22rem)] rounded-2xl border border-amber-500/40 p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <CloudOff className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t("drive.nas.caidoTitulo")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("drive.nas.caidoCuerpo", { n: pendientes })}</p>
              {desde && <p className="mt-2 text-[11px] text-muted-foreground/80">{t("drive.nas.desde", { t: hora(desde) })}</p>}
            </div>
            <button type="button" onClick={cerrar} aria-label={t("drive.nas.cerrar")} className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <button type="button" onClick={cerrar} className="mt-3 w-full rounded-xl bg-amber-500/90 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500">
            {t("drive.nas.cerrar")}
          </button>
        </div>
      )}
    </>
  );
}

export default AvisoNasCaido;
