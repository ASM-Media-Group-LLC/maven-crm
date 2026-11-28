import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardCheck, Lightbulb, Minus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { VUELVE_MS, itemsVisibles, type ItemPendiente, leerOcultos, ocultarHoy, ocultarSugerencia } from "@/lib/pendientesDeGestion";

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
  // Chiquito (27/11/2026): el cuadro tapaba la página de Posiciones. Se puede
  // achicar a una pastilla «Pendientes · N» y se recuerda.
  const [chico, setChico] = useState(() => { try { return window.localStorage.getItem("maven.pendientes.chico") === "1"; } catch { return false; } });
  const alternarChico = (v: boolean) => { setChico(v); try { window.localStorage.setItem("maven.pendientes.chico", v ? "1" : "0"); } catch { /* noop */ } };

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const leerTodo = async () => {
      try {
        const { data, error } = await (supabase as unknown as RpcDb).rpc("pendientes_de_gestion");
        if (vivo && !error && Array.isArray(data)) setItems(data as ItemPendiente[]);
      } catch { /* sin dato no se muestra nada: nunca un pendiente inventado */ }
    };
    void leerTodo();
    // Cada 5 minutos: se pone al día y, si se cerró con la X, vuelve a salir.
    const id = window.setInterval(() => { void leerTodo(); setOcultos(leerOcultos(new Date())); }, VUELVE_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user]);

  const visibles = itemsVisibles(items, ocultos);
  if (visibles.length === 0) return null;

  const ir = (ruta: string) => { navigate(ruta); };
  const cerrar = () => { ocultarHoy(new Date()); setOcultos(leerOcultos(new Date())); };
  const despues = (clave: string) => { ocultarSugerencia(clave, new Date()); setOcultos(leerOcultos(new Date())); };

  if (chico) {
    return (
      <button
        type="button"
        data-pendientes-gestion
        onClick={() => alternarChico(false)}
        className="vidrio fixed bottom-24 right-4 z-[55] flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-xs font-semibold text-foreground shadow-xl hover:bg-white/10"
      >
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        {t("hr.pendientes.titulo")}
        <span className="rounded-full bg-warning/20 px-1.5 text-[11px] tabular-nums text-warning">{visibles.length}</span>
      </button>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label={t("hr.pendientes.titulo")}
      data-pendientes-gestion
      className="vidrio fixed bottom-24 right-4 z-[55] w-[min(92vw,22rem)] rounded-2xl border border-border/60 p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-foreground/80" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{t("hr.pendientes.titulo")}</p>
        <button type="button" onClick={() => alternarChico(true)} title={t("hr.pendientes.achicar")} aria-label={t("hr.pendientes.achicar")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground">
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" onClick={cerrar} title={t("hr.pendientes.cerrar")} aria-label={t("hr.pendientes.cerrar")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <ul className="grid gap-1.5">
        {visibles.map((it) => (
          <li key={it.clave} className={cn("flex items-start gap-2 rounded-xl px-2.5 py-2", it.tipo === "pendiente" ? "bg-warning/10" : "bg-white/5")}>
            {it.tipo === "pendiente"
              ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              : <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug text-foreground">{t(TEXTO[it.clave], { n: it.n })}</p>
              <div className="mt-1 flex items-center gap-3">
                {/* 27/11/2026 (Alvaro: «no se ve ni mierda el Fix it»): botón de verdad, con
                    fondo y texto claro, no un enlace en el color de la marca. */}
                <button type="button" onClick={() => ir(it.ruta)} className="inline-flex h-7 items-center gap-1 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background hover:bg-foreground/90">
                  {t(it.tipo === "pendiente" ? "hr.pendientes.resolver" : "hr.pendientes.verComo")}<ArrowRight className="h-3 w-3" aria-hidden />
                </button>
                {it.tipo === "sugerencia" && (
                  <button type="button" onClick={() => despues(it.clave)} className="h-7 rounded-full px-2 text-[11px] text-foreground/70 hover:bg-white/10 hover:text-foreground">
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
