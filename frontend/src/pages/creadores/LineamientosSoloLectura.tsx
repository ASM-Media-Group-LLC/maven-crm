import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { CATEGORIES } from "./lineamientos/categoriesConfig";

type Lineamiento = Tables<"creator_guidelines">;

/**
 * Qué lineamientos ve el chatter.
 *
 * Es una LISTA BLANCA a propósito: entre los lineamientos de una creadora hay
 * cosas que no le corresponden —"Contacto de Emergencia" (un número), "Datos
 * bancarios", "Contrato de management", "Cuentas backup", verificación— y una
 * lista negra se rompe sola en cuanto alguien agrega una sección nueva.
 *
 * ⚠️ `guideline_type` está en DOS vocabularios y hay que cubrir los dos:
 *  · **slug** en los lineamientos viejos: `limits`, `pricing`, `payments`…
 *  · **nombre de categoría** en lo que crea la UI de gestión hoy, porque
 *    `openAddForItem` guarda `cat.category` ("Operación Core") en esa columna.
 *
 * Consecuencia a tener presente: una sección nueva no le llega al chatter
 * hasta que se agregue a esta tabla.
 */
// `clave` es el guideline_type guardado (y `excluir`, títulos guardados): DATO. `etiqueta`
// es la clave del diccionario con la que se muestra la sección.
const SECCIONES: Array<{ clave: string; etiqueta: TranslationKey; excluir?: string[] }> = [
  // Vocabulario nuevo (nombre de categoría). El corte fino va por título.
  { clave: "operación core", etiqueta: "creadores.guideRO.sec.opsCore" },
  { clave: "gestión de chats", etiqueta: "creadores.guideRO.sec.chats" },
  { clave: "negocio y crecimiento", etiqueta: "creadores.guideRO.sec.business" },
  { clave: "horarios", etiqueta: "creadores.guideRO.sec.schedules", excluir: ["contacto de emergencia"] },
  { clave: "plataformas y cuentas", etiqueta: "creadores.guideRO.sec.platforms", excluir: ["cuentas backup"] },
  // Vocabulario viejo (slug), una entrada por sección operativa.
  { clave: "pricing", etiqueta: "creadores.guideRO.sec.pricing" },
  { clave: "limits", etiqueta: "creadores.guideRO.sec.limits" },
  { clave: "preferences", etiqueta: "creadores.guideRO.sec.preferences" },
  { clave: "content_style", etiqueta: "creadores.guideRO.sec.contentStyle" },
  { clave: "sexting_rules", etiqueta: "creadores.guideRO.sec.sexting" },
  { clave: "ppv_strategy", etiqueta: "creadores.guideRO.sec.ppv" },
  { clave: "custom_content", etiqueta: "creadores.guideRO.sec.custom" },
  { clave: "chat_instructions", etiqueta: "creadores.guideRO.sec.chatInstructions" },
  { clave: "user_types", etiqueta: "creadores.guideRO.sec.userTypes" },
  { clave: "vip_fans", etiqueta: "creadores.guideRO.sec.vip" },
  { clave: "response_time", etiqueta: "creadores.guideRO.sec.responseTime" },
  { clave: "renewals", etiqueta: "creadores.guideRO.sec.renewals" },
  { clave: "mass_messages", etiqueta: "creadores.guideRO.sec.mass" },
  { clave: "languages", etiqueta: "creadores.guideRO.sec.languages" },
  { clave: "schedule", etiqueta: "creadores.guideRO.sec.schedule" },
  { clave: "time_zones", etiqueta: "creadores.guideRO.sec.timeZones" },
  { clave: "goals", etiqueta: "creadores.guideRO.sec.goals" },
  { clave: "promotions", etiqueta: "creadores.guideRO.sec.promotions" },
  { clave: "cross_promo", etiqueta: "creadores.guideRO.sec.crossPromo" },
  { clave: "fan_acquisition", etiqueta: "creadores.guideRO.sec.acquisition" },
  { clave: "upselling", etiqueta: "creadores.guideRO.sec.upselling" },
  { clave: "retention", etiqueta: "creadores.guideRO.sec.retention" },
  { clave: "platform_rules", etiqueta: "creadores.guideRO.sec.platformRules" },
  { clave: "social_handles", etiqueta: "creadores.guideRO.sec.socials" },
];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Aplica la lista blanca y agrupa en el orden de SECCIONES. Pura: es la
 *  frontera de privacidad de esta pantalla, así que tiene test propio. */
export function agruparVisibles<T extends { guideline_type?: string | null; title?: string | null }>(
  todos: T[],
): Array<{ etiqueta: TranslationKey; items: T[] }> {
  return SECCIONES.map((s) => ({
    etiqueta: s.etiqueta,
    items: todos.filter(
      (g) => norm(g.guideline_type) === s.clave && !(s.excluir ?? []).includes(norm(g.title)),
    ),
  })).filter((g) => g.items.length > 0);
}

// Lineamientos de la creadora en SOLO LECTURA para la vista de trabajo del
// chatter: sin agregar, editar ni borrar, y sin las secciones de gestión. La
// pestaña de gestión (LineamientosTabContent) queda igual que antes.
export default function LineamientosSoloLectura({ creatorId }: { creatorId: string }) {
  const { t } = useLanguage();
  const { data: todos = [], isLoading } = useQuery({
    // Misma clave que la pestaña de gestión: comparten caché.
    queryKey: ["creator_guidelines", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_guidelines")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lineamiento[];
    },
  });

  const grupos = useMemo(() => agruparVisibles(todos), [todos]);
  // Un título que es el de un ítem del catálogo (lo guarda así la pestaña de
  // gestión) se muestra con su etiqueta; lo escrito a mano, tal cual.
  const tituloVisible = (tipo: string | null, titulo: string | null) => {
    const item = CATEGORIES.find((c) => c.category === tipo)?.items.find((i) => i.title === titulo);
    return item ? t(item.label) : titulo;
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("creadores.guide.loading")}</div>;
  }

  if (grupos.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border py-12 text-center">
        <ClipboardList className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
        <p className="text-sm font-medium">{t("creadores.guideRO.empty")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("creadores.guideRO.emptyDesc")}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {grupos.map((g) => (
        <section key={g.etiqueta}>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">{t(g.etiqueta)}</h4>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {g.items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <p className="text-sm font-medium leading-tight">{tituloVisible(item.guideline_type, item.title)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
