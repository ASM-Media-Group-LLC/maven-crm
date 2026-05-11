import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Categorías canónicas desde la tabla model_categories. Lista fija
// (Elite, A+, A, B+, B, C+, C) que se usa en TODOS los selects/filtros
// de categoría — replaces los arrays hardcodeados.
export interface ModelCategory {
  code: string;
  label: string;
  sort_order: number;
  active: boolean;
}

export const useModelCategories = () =>
  useQuery({
    queryKey: ["model-categories"],
    queryFn: async (): Promise<ModelCategory[]> => {
      const { data, error } = await (supabase as any)
        .from("model_categories")
        .select("code, label, sort_order, active")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ModelCategory[];
    },
    staleTime: 10 * 60 * 1000, // 10 min — la lista no cambia seguido
  });
