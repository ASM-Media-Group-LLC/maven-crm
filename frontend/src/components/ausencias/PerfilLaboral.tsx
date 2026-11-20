import { useEffect, useState } from "react";
import { CalendarHeart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useAccionesAusencias, useMisPermisosAusencias, useSaldo } from "@/hooks/useAusencias";
import { CAMPO, Fallo, useFechaCorta } from "./piezas";
import { PermisosEspeciales } from "./PermisosEspeciales";

// EN EL PERFIL DE LA PERSONA (expediente, 20/11/2026): su saldo de vacaciones, la
// fecha de ingreso (la pone RR. HH.; de ahí se acumulan) y sus permisos
// especiales encima del puesto, con quién y cuándo.

export function PerfilLaboral({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fecha = useFechaCorta();
  const saldo = useSaldo(userId);
  const mios = useMisPermisosAusencias();
  const { fechaIngreso } = useAccionesAusencias();
  const [ingreso, setIngreso] = useState("");
  useEffect(() => { if (saldo.data && !saldo.data.ingreso_estimado) setIngreso(saldo.data.fecha_ingreso.slice(0, 10)); }, [saldo.data]);
  const rrhh = mios.data?.aprueba_final === true;
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="vidrio flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarHeart className="h-4 w-4 text-primary" />{t("aus.saldo.titulo")}</div>
        {saldo.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : saldo.isError ? <Fallo texto="aus.saldo.fallo" reintentar={() => void saldo.refetch()} />
          : saldo.data && (
            <>
              <p className="text-2xl font-semibold tabular-nums">{t("aus.saldo.dias", { n: Math.max(0, saldo.data.disponibles - saldo.data.pendientes) })}</p>
              <p className="text-[11px] text-muted-foreground">{t("aus.saldo.detalle", { a: saldo.data.acumulados, u: saldo.data.usados, p: saldo.data.pendientes })}</p>
              <p className="text-[11px] text-muted-foreground">{t("aus.saldo.politica", { d: saldo.data.dias_anio, f: fecha(saldo.data.fecha_ingreso.slice(0, 10)) })}</p>
              {saldo.data.ingreso_estimado && <p className="text-[11px] text-muted-foreground">{t("aus.saldo.estimado")}</p>}
            </>
          )}
        {rrhh && (
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.reg.fechaIngreso")}
              <input type="date" className={CAMPO} value={ingreso} onChange={(e) => setIngreso(e.target.value)} />
            </label>
            <Button size="sm" variant="outline" className="h-9 rounded-lg" disabled={!ingreso || fechaIngreso.isPending}
              onClick={() => fechaIngreso.mutate({ userId, fecha: ingreso }, {
                onSuccess: () => toast({ title: t("aus.bandeja.listo") }),
                onError: (e) => toast({ title: t("aus.bandeja.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
              })}>
              {t("aus.reg.guardarIngreso")}
            </Button>
          </div>
        )}
      </section>
      <PermisosEspeciales userId={userId} />
    </div>
  );
}
