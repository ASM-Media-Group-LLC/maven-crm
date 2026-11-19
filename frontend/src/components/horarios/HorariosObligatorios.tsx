import { CalendarClock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useHorariosBloqueo } from "@/hooks/useHorariosEquipo";
import { ListaHorarios } from "@/components/horarios/ListaHorarios";

// CARTEL QUE NO SE QUITA (Alvaro, 19/11/2026: «bombardear a Andrea para que
// reafirme los horarios»; eligió «cartel que no se quita»). A RR. HH. (que no es
// admin ni dueño) le tapa Maven hasta que confirme el horario de cada persona;
// se confirma ahí mismo y se va solo al terminar. Si la consulta falla, no
// bloquea a nadie (un fallo no es «tienes pendientes»).

export function HorariosObligatorios() {
  const { t } = useLanguage();
  const q = useHorariosBloqueo();
  const b = q.data;
  if (!b?.debe) return null;
  const listos = Math.max(0, b.total - b.pendientes);
  const pct = b.total > 0 ? Math.round((listos / b.total) * 100) : 0;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="horarios-obligatorios-titulo"
      className="fixed inset-0 z-[90] overflow-y-auto bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:py-10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><CalendarClock className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="horarios-obligatorios-titulo" className="font-display text-lg font-bold leading-tight text-foreground">{t("hr.horEq.obligTitulo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("hr.horEq.obligSub")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{t("hr.horEq.avance", { a: listos, b: b.total })}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <section className="vidrio overflow-hidden p-0">
          <ListaHorarios obligatorio />
        </section>
      </div>
    </div>
  );
}
