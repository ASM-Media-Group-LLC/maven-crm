import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

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
const SECCIONES: Array<{ clave: string; etiqueta: string; excluir?: string[] }> = [
  // Vocabulario nuevo (nombre de categoría). El corte fino va por título.
  { clave: "operación core", etiqueta: "Operación core" },
  { clave: "gestión de chats", etiqueta: "Gestión de chats" },
  { clave: "negocio y crecimiento", etiqueta: "Negocio y crecimiento" },
  { clave: "horarios", etiqueta: "Horarios", excluir: ["contacto de emergencia"] },
  { clave: "plataformas y cuentas", etiqueta: "Plataformas", excluir: ["cuentas backup"] },
  // Vocabulario viejo (slug), una entrada por sección operativa.
  { clave: "pricing", etiqueta: "Precios" },
  { clave: "limits", etiqueta: "Límites" },
  { clave: "preferences", etiqueta: "Gustos y preferencias" },
  { clave: "content_style", etiqueta: "Estilo de contenido" },
  { clave: "sexting_rules", etiqueta: "Reglas de sexting" },
  { clave: "ppv_strategy", etiqueta: "Estrategia PPV" },
  { clave: "custom_content", etiqueta: "Contenido personalizado" },
  { clave: "chat_instructions", etiqueta: "Instrucciones para chats" },
  { clave: "user_types", etiqueta: "Tipos de usuario" },
  { clave: "vip_fans", etiqueta: "Fans VIP / whales" },
  { clave: "response_time", etiqueta: "Tiempos de respuesta" },
  { clave: "renewals", etiqueta: "Renovaciones" },
  { clave: "mass_messages", etiqueta: "Mensajes masivos" },
  { clave: "languages", etiqueta: "Idiomas" },
  { clave: "schedule", etiqueta: "Horarios y disponibilidad" },
  { clave: "time_zones", etiqueta: "Zonas horarias" },
  { clave: "goals", etiqueta: "Metas" },
  { clave: "promotions", etiqueta: "Promociones permitidas" },
  { clave: "cross_promo", etiqueta: "Cross-promo de redes" },
  { clave: "fan_acquisition", etiqueta: "Adquisición de fans" },
  { clave: "upselling", etiqueta: "Upselling" },
  { clave: "retention", etiqueta: "Retención" },
  { clave: "platform_rules", etiqueta: "Reglas de plataforma" },
  { clave: "social_handles", etiqueta: "Redes sociales" },
];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Aplica la lista blanca y agrupa en el orden de SECCIONES. Pura: es la
 *  frontera de privacidad de esta pantalla, así que tiene test propio. */
export function agruparVisibles<T extends { guideline_type?: string | null; title?: string | null }>(
  todos: T[],
): Array<{ etiqueta: string; items: T[] }> {
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

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Cargando lineamientos…</div>;
  }

  if (grupos.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border py-12 text-center">
        <ClipboardList className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
        <p className="text-sm font-medium">Sin lineamientos cargados</p>
        <p className="mt-1 text-xs text-muted-foreground">Los carga el manager de la creadora.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {grupos.map((g) => (
        <section key={g.etiqueta}>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">{g.etiqueta}</h4>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {g.items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <p className="text-sm font-medium leading-tight">{item.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
