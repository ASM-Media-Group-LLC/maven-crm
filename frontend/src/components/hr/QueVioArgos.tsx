import { useMemo } from "react";
import { format } from "date-fns";
import { Bot, AlertTriangle, Check, Monitor } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { a12 } from "@/lib/horaBogota";
import type { CapturaDia } from "@/hooks/useExpedienteEmpleado";

// "Qué vio Argos hoy" (Alvaro, 09/11): el resumen EN SECO de lo que la IA juzgó,
// sin tener que abrir foto por foto. Cuántos momentos miró, cuántos en lo suyo vs
// fuera de lugar, y en qué sistemas pasó el rato. Si Argos no juzgó nada, no sale.

// El veredicto viene como "Sistema A / Sistema B · qué hacía". Sacamos los
// sistemas (lo de antes del ·, partido por /) para contar en qué pasó el tiempo.
function sistemasDe(veredicto: string): string[] {
  const parte = veredicto.split("·")[0].trim();
  return parte.split("/").map((s) => s.trim()).filter((s) => s.length > 1);
}

export function QueVioArgos({ capturas }: { capturas: CapturaDia[] }) {
  const { t } = useLanguage();

  const d = useMemo(() => {
    const juzgadas = capturas.filter((c) => c.veredicto && c.tipo === "pantalla");
    const fuera = juzgadas.filter((c) => c.fueraDeLugar === true && !c.perdonado);
    const conteo = new Map<string, number>();
    for (const c of juzgadas) for (const s of sistemasDe(c.veredicto!)) conteo.set(s, (conteo.get(s) ?? 0) + 1);
    const sistemas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const fueraLista = fuera
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((c) => ({ id: c.id, hora: a12(format(new Date(c.createdAt), "HH:mm")), veredicto: c.veredicto! }));
    const ultimo = juzgadas.length
      ? [...juzgadas].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
      : null;
    return {
      total: juzgadas.length,
      enLoSuyo: juzgadas.length - fuera.length,
      fuera: fuera.length,
      sistemas,
      fueraLista,
      ultimoTexto: ultimo?.veredicto ?? null,
      ultimoHora: ultimo ? a12(format(new Date(ultimo.createdAt), "HH:mm")) : null,
    };
  }, [capturas]);

  // Si Argos no juzgó ningún pantallazo, no se muestra (silencioso).
  if (d.total === 0) return null;
  const limpio = d.fuera === 0;

  return (
    <section className="vidrio sube mt-5 p-4 lg:p-5" style={{ animationDelay: "0.04s" }}>
      <div className="v-cont">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" />{t("hr.exp.argosvio.titulo")}
        </p>

        {/* Veredicto de la IA en una línea humana. */}
        <div className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 ${limpio ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
          <span className="mt-0.5 shrink-0">
            {limpio ? <Check className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
          </span>
          <p className="text-sm">
            {limpio
              ? t("hr.exp.argosvio.limpio", { n: d.total })
              : t("hr.exp.argosvio.conFuera", { total: d.total, fuera: d.fuera })}
          </p>
        </div>

        {/* En qué sistemas pasó el tiempo (lo que Argos reconoció). */}
        {d.sistemas.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Monitor className="h-3 w-3" />{t("hr.exp.argosvio.enQue")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {d.sistemas.map(([sistema, n]) => (
                <span key={sistema} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/40 px-2.5 py-1 text-xs">
                  <span className="truncate max-w-[180px]">{sistema}</span>
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Si hubo fuera de lugar, Argos los nombra uno a uno. */}
        {d.fueraLista.length > 0 && (
          <div className="mt-3 border-t border-border/40 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-destructive">{t("hr.exp.argosvio.fueraTitulo")}</p>
            <div className="flex flex-col gap-1.5">
              {d.fueraLista.map((f) => (
                <div key={f.id} className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1 text-xs">{f.veredicto}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{f.hora}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lo último que Argos vio, textual, para que se entienda el tono. */}
        {d.ultimoTexto && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("hr.exp.argosvio.ultimo", { hora: d.ultimoHora ?? "" })} <span className="italic">"{d.ultimoTexto}"</span>
          </p>
        )}
      </div>
    </section>
  );
}
