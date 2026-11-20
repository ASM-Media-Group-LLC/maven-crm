import { useEffect, useState } from "react";
import { CalendarHeart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useGuardarPolitica, usePoliticaAusencias } from "@/hooks/useAusencias";
import type { TranslationKey } from "@/lib/i18n";
import type { Politica } from "@/lib/ausencias";
import { CAMPO, Fallo } from "./piezas";

// AJUSTES → EMPRESA → AUSENCIAS (20/11/2026): de toda la empresa, nunca por
// persona. Días de vacaciones por año (se acumulan desde el ingreso) y la
// anticipación mínima por tipo. La cambia quien tenga N:empresa.configurar.

const CAMPOS: Array<[keyof Politica, TranslationKey, number]> = [
  ["vacaciones_dias_anio", "aus.pol.diasAnio", 60],
  ["aviso_vacaciones_dias", "aus.pol.avisoVac", 120],
  ["aviso_permiso_dias", "aus.pol.avisoPermiso", 120],
  ["aviso_dia_libre_dias", "aus.pol.avisoDiaLibre", 120],
];

export function PoliticaAusencias() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const q = usePoliticaAusencias();
  const guardar = useGuardarPolitica();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setV(Object.fromEntries(CAMPOS.map(([k]) => [k, String(q.data![k])])));
  }, [q.data]);
  const editable = !!q.data?.puede_editar;
  const valido = CAMPOS.every(([k, , max]) => v[k] !== "" && Number(v[k]) >= 0 && Number(v[k]) <= max);
  return (
    <section className="vidrio flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarHeart className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("aus.pol.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("aus.pol.sub")}</p>
        </div>
      </div>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        : q.isError ? <Fallo texto="aus.pol.fallo" reintentar={() => void q.refetch()} />
        : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CAMPOS.map(([k, lbl, max]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{t(lbl)}</span>
                  <input type="number" min={0} max={max} step={k === "vacaciones_dias_anio" ? 0.5 : 1} disabled={!editable}
                    className={`${CAMPO} w-20 tabular-nums`} value={v[k] ?? ""} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("aus.pol.incapacidad")}</p>
            {editable ? (
              <Button size="sm" className="h-9 self-start rounded-lg" disabled={!valido || guardar.isPending}
                onClick={() => guardar.mutate({
                  vacaciones_dias_anio: Number(v.vacaciones_dias_anio), aviso_vacaciones_dias: Number(v.aviso_vacaciones_dias),
                  aviso_permiso_dias: Number(v.aviso_permiso_dias), aviso_dia_libre_dias: Number(v.aviso_dia_libre_dias),
                }, {
                  onSuccess: () => toast({ title: t("aus.pol.guardado") }),
                  onError: (e) => toast({ title: t("aus.bandeja.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
                })}>
                {guardar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("aus.pol.guardar")}
              </Button>
            ) : <p className="text-[11px] text-muted-foreground">{t("aus.pol.soloVer")}</p>}
          </>
        )}
    </section>
  );
}
