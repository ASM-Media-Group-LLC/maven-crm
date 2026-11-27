import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardCheck, Lightbulb, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { itemsVisibles, type ItemPendiente, leerOcultos, ocultarHoy, ocultarSugerencia } from "@/lib/pendientesDeGestion";

// PENDIENTES Y SUGERENCIAS (Alvaro, 27/11/2026): un cuadrito abajo a la derecha
// para quien cuadra a los empleados: lo que falta (horarios sin confirmar,
// personas sin Posición) y funciones que la empresa no está usando (hora de
// comida, turnos). No bloquea: se cierra hasta mañana y la sugerencia se puede
// dejar para después. Quién ve cada cosa lo dice la base según su Posición.

type RpcDb = { rpc: (f: string) => Promise<{ data: unknown; error: unknown }> };

const TEXTO: Record<ItemPendiente["clave"], TranslationKey> = {
  horarios: "hr.pendientes.horarios",
  sin_posicion: "hr.pendientes.sinPosicion",
  comida_sin_hora: "hr.pendientes.comidaSinHora",
  turnos_sin_crear: "hr.pendientes.turnosSinCrear",
  turnos_sin_usar: "hr.pendientes.turnosSinUsar",
};

export function PendientesDeGestion() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemPendiente[]>([]);
  const [ocultos, setOcultos] = useState(() => leerOcultos(new Date()));

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await (supabase as unknown as RpcDb).rpc("pendientes_de_gestion");
        if (vivo && !error && Array.isArray(data)) setItems(data as ItemPendiente[]);
      } catch { /* sin dato no se muestra nada: nunca un pendiente inventado */ }
    })();
    return () => { vivo = false; };
  }, [user]);

  const visibles = itemsVisibles(items, ocultos);
  if (visibles.length === 0) return null;

  const ir = (ruta: string) => { navigate(ruta); };
  const cerrar = () => { ocultarHoy(new Date()); setOcultos(leerOcultos(new Date())); };
  const despues = (clave: string) => { ocultarSugerencia(clave, new Date()); setOcultos(leerOcultos(new Date())); };

  return (
    <aside
      role="complementary"
      aria-label={t("hr.pendientes.titulo")}
      data-pendientes-gestion
      className="vidrio fixed bottom-24 right-4 z-[55] w-[min(92vw,22rem)] rounded-2xl border border-border/60 p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{t("hr.pendientes.titulo")}</p>
        <button type="button" onClick={cerrar} title={t("hr.pendientes.cerrar")} aria-label={t("hr.pendientes.cerrar")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <ul className="grid gap-1.5">
        {visibles.map((it) => (
          <li key={it.clave} className={cn("flex items-start gap-2 rounded-xl px-2.5 py-2", it.tipo === "pendiente" ? "bg-warning/10" : "bg-primary/5")}>
            {it.tipo === "pendiente"
              ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              : <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug text-foreground">{t(TEXTO[it.clave], { n: it.n })}</p>
              <div className="mt-1 flex items-center gap-3">
                <button type="button" onClick={() => ir(it.ruta)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                  {t(it.tipo === "pendiente" ? "hr.pendientes.resolver" : "hr.pendientes.verComo")}<ArrowRight className="h-3 w-3" aria-hidden />
                </button>
                {it.tipo === "sugerencia" && (
                  <button type="button" onClick={() => despues(it.clave)} className="text-[11px] text-muted-foreground hover:text-foreground">
                    {t("hr.pendientes.ahoraNo")}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default PendientesDeGestion;
