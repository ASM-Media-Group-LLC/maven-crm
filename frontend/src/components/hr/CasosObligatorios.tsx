import { Gavel } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useCasosBloqueo } from "@/hooks/useCasosArgos";
import { CasosPendientes } from "@/components/hr/RevisionCasos";

// CARTEL QUE NO SE QUITA (Alvaro, 19/11/2026): a quien su puesto obliga a
// revisar los casos de Argos (función «obligado», hoy el puesto HHRR), Maven le
// tapa la pantalla mientras queden casos de días que ya terminaron sin juzgar.
// Se juzga ahí mismo y se va solo al terminar. Si la consulta falla, no bloquea
// a nadie (un fallo no es «tienes pendientes»). El dueño nunca lo ve.

export function CasosObligatorios() {
  const { t } = useLanguage();
  const q = useCasosBloqueo();
  const b = q.data;
  if (!b?.debe) return null;
  const listos = Math.max(0, b.total - b.pendientes);
  const pct = b.total > 0 ? Math.round((listos / b.total) * 100) : 0;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="casos-obligatorios-titulo"
      className="fixed inset-0 z-[89] overflow-y-auto bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:py-10">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-primary/15 text-primary"><Gavel className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="casos-obligatorios-titulo" className="font-display text-lg font-bold leading-tight text-foreground">{t("hr.casos.obligTitulo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("hr.casos.obligSub")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{t("hr.casos.avance", { a: listos, b: b.total })}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <CasosPendientes />
      </div>
    </div>
  );
}
