import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { agenciaDe, type LineaDeAgencia, type NegocioDeCreadora } from "@/lib/creadoras/agencia";

// Las opciones de «Agencia asignada» de MI agencia (agencia_lineas, con la RLS:
// cada uno ve las suyas) y el nombre con el que mi agencia está registrada en
// Maven (tenants_self_visible). Ver lib/creadoras/agencia.ts.
export function useAgenciaDeCreadoras() {
  const lineas = useQuery({
    queryKey: ["agencia-lineas"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<LineaDeAgencia[]> => {
      const { data, error } = await supabase
        .from("agencia_lineas" as never)
        .select("id, nombre, orden, company_id, kash_type, alias")
        .order("orden");
      if (error) throw error;
      return (data ?? []) as unknown as LineaDeAgencia[];
    },
  });
  const propia = useQuery({
    queryKey: ["mi-agencia"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("name").limit(1).maybeSingle();
      if (error) throw error;
      return (data as { name: string } | null)?.name ?? "";
    },
  });
  const listaDeLineas = lineas.data ?? [];
  const nombrePropio = propia.data ?? "";
  const de = useCallback(
    (cb: NegocioDeCreadora | null | undefined) => agenciaDe(cb, listaDeLineas, nombrePropio),
    [listaDeLineas, nombrePropio],
  );
  return {
    lineas: listaDeLineas,
    propia: nombrePropio,
    cargando: lineas.isLoading || propia.isLoading,
    agenciaDe: de,
  };
}
