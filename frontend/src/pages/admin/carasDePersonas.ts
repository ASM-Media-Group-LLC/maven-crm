import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Cara = { src: string | null; seed: string | null };

/** La foto y el muñequito (DiceBear) de las personas que aparecen en Ajustes →
 *  API keys: la persona de cada key y quien pausó un webhook. manage-api-keys solo
 *  manda id y nombre; la cara se lee de profiles, como en el resto de Maven. Si la
 *  lectura falla o no llega, UserAvatar cae a las iniciales: nunca frena la pantalla. */
export function useCaras(ids: (string | null | undefined)[]): Map<string, Cara> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))].sort();
  const { data } = useQuery({
    queryKey: ["caras-de-personas", unicos],
    queryFn: async () => {
      const { data: filas, error } = await supabase.from("profiles").select("id, avatar_url, avatar_seed").in("id", unicos);
      if (error) throw error;
      return filas ?? [];
    },
    enabled: unicos.length > 0,
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => new Map((data ?? []).map((p) => [p.id, { src: p.avatar_url ?? null, seed: p.avatar_seed ?? null }])),
    [data],
  );
}
