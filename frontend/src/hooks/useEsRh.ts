import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ¿Es HR (rol HHRR/RRHH)? Andrea Palacio y el equipo de Recursos Humanos. Es la
// llave para que HR vea Argos/el expediente de todo el equipo MENOS los admins
// (la RLS lo filtra por nivel del observado; esto solo abre la puerta del
// frontend). Mismo criterio que useEsDueno: un fallo de red deja esRh en null y
// quien lo use espera o avisa, nunca cierra la puerta en silencio.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useEsRh(): { esRh: boolean | null; cargando: boolean; error: Error | null } {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["es-rh", user?.id ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sinTipar
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role.toLowerCase());
      return roles.includes("hhrr") || roles.includes("rrhh");
    },
  });
  return {
    esRh: q.isSuccess ? q.data : null,
    cargando: !user?.id || q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
