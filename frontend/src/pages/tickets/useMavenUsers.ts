import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * La gente de Maven, para los campos de tipo "Empleado de Maven".
 *
 * POR QUE ESTE HOOK: el selector usaba TEAM_MEMBERS, una lista de 37 personas
 * HARDCODEADA en useTickets.ts — el mismo antipatron del Apps Script que este
 * modulo vino a eliminar. Cada alta o baja del equipo obligaba a editar codigo,
 * y por eso la lista tenia gente que ya no esta.
 *
 * La fuente es `profiles` (59 filas, todas con nombre), no `employees`: esa es
 * la tabla del modulo de RRHH y hoy tiene 1 fila y 0 activos.
 *
 * Se guarda el ID, no el nombre: hay homonimos en el equipo (dos personas con
 * el mismo nombre) y por nombre serian indistinguibles.
 */

export interface MavenUserOption {
  value: string; // profiles.id (= auth user id)
  label: string;
  searchAdditional?: string;
}

export function useMavenUsers() {
  const query = useQuery({
    queryKey: ["maven-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return (data || []).filter((p) => (p.full_name || "").trim() !== "");
    },
    // Cambia poco: no hace falta refetch en cada apertura del formulario.
    staleTime: 5 * 60 * 1000,
  });

  const options: MavenUserOption[] = useMemo(
    () => (query.data || []).map((p) => ({ value: p.id, label: p.full_name as string })),
    [query.data],
  );

  /** Nombre por id, para mostrar respuestas ya guardadas. */
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

  return { query, options, nameById };
}
