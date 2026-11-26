import { useState } from "react";
import { CloudOff, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useNasSalud } from "@/hooks/useNasSalud";

// Aviso de NAS caído (Alvaro, 05/11): PERMANENTE mientras el NAS esté caído.
// No se puede cerrar (quitamos la X). Lo ven dueño + admins + todos los que
// tienen Drive full (la RLS de drive_nas_salud lo fuerza vía drive_tiene_full).
// Se quita SOLO cuando el NAS vuelve (caido = false).
//
// 26/11/2026 (Alvaro): el cuadro de abajo SÍ se cierra con la X. Cada persona
// cierra el suyo y no vuelve mientras dure ESA caída (se recuerda por su «desde»);
// si el NAS vuelve y se cae otra vez, sale de nuevo. La franja roja de arriba se
// queda siempre mientras esté caído, para que nadie olvide que el Drive no anda.
const CLAVE_CERRADO = "maven.nas.avisoCerrado";

function leerCerrado(): string | null {
  try { return window.localStorage.getItem(CLAVE_CERRADO); } catch { return null; }
}

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
  const [cerrado, setCerrado] = useState<string | null>(leerCerrado);
  const estaCaida = desde ?? "sin-fecha";

  if (!caido) return null;
  const cuadroCerrado = cerrado === estaCaida;
  const cerrar = () => {
    try { window.localStorage.setItem(CLAVE_CERRADO, estaCaida); } catch { /* sin almacenamiento: se cierra igual en esta pantalla */ }
    setCerrado(estaCaida);
  };

  return (
    <>
      {/* Franja permanente en el header (sin cerrar). */}
      <div role="status" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive animate-pulse">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{t("drive.nas.caidoFranja", { n: pendientes })}</span>
      </div>

      {/* Pop-up fijo abajo a la derecha, con su X (26/11/2026). */}
      {!cuadroCerrado && <div role="alertdialog" aria-live="assertive" className="vidrio vidrio-glow fixed bottom-4 right-4 z-[60] w-[min(92vw,22rem)] rounded-2xl border border-destructive/50 p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
            <CloudOff className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("drive.nas.caidoTitulo")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("drive.nas.caidoCuerpo", { n: pendientes })}</p>
            {desde && <p className="mt-2 text-[11px] text-muted-foreground/80">{t("drive.nas.desde", { t: hora(desde) })}</p>}
          </div>
          <button
            type="button"
            onClick={cerrar}
            title={t("drive.nas.cerrar")}
            aria-label={t("drive.nas.cerrar")}
            data-cerrar-aviso-nas
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>}
    </>
  );
}

export default AvisoNasCaido;
