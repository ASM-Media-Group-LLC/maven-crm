import { Link } from "react-router-dom";
import { CalendarCheck2, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAsistencia, useMisPermisosAusencias, veAOtros } from "@/hooks/useAusencias";
import { hoyBogota, resumirDia } from "@/lib/ausencias";

// EN EL INICIO (Alvaro, 20/11/2026): «Hoy: N presentes · N tarde · N faltaron ·
// N ausencias», que abre Asistencia → Hoy. Solo para quien su puesto (o un
// permiso especial) le deja ver a otras personas. Si algo falla, no se dibuja:
// el Inicio no se rompe por esta tarjeta (y Asistencia dice el error completo).

export function TarjetaHoyInicio() {
  const { t } = useLanguage();
  const permisos = useMisPermisosAusencias();
  const ve = veAOtros(permisos.data);
  const hoy = hoyBogota();
  const q = useAsistencia(hoy, hoy, null, ve);
  if (!ve || !q.data || q.data.length <= 1) return null;
  const r = resumirDia(q.data);
  return (
    <div className="shrink-0 px-4 pt-3 sm:px-6">
      <Link to="/asistencia?tab=hoy" className="vidrio flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-foreground/[0.03]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarCheck2 className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">{t("aus.inicio.titulo")}</span>
          <span className="block truncate font-medium tabular-nums text-foreground">{t("aus.asis.resumen", { p: r.presentes, t: r.tarde, f: r.faltaron, a: r.fuera })}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">{t("aus.inicio.ver")}<ChevronRight className="h-3.5 w-3.5" /></span>
      </Link>
    </div>
  );
}
