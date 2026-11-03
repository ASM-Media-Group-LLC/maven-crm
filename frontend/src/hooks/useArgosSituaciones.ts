import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// AJUSTES de Argos editables por el dueño: las SITUACIONES (qué dice Argos, en
// cuántos minutos, a quién avisa) y la VOZ. Todo en un lugar, para controlarlo
// desde Ajustes (Álvaro, 02/11). La RLS deja ver/editar solo al dueño.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface Situacion {
  tipo: string;
  activa: boolean;
  umbral_min: number;
  mensaje: string;
  avisar_persona: boolean;
  avisar_supervisor: boolean;
  avisar_dueno: boolean;
  orden: number;
}
export interface Voz {
  voz_es: string;
  voz_en: string;
  intro_locutora: boolean;
}

export function useArgosSituaciones() {
  const qc = useQueryClient();

  const situaciones = useQuery({
    queryKey: ["argos-situaciones"],
    staleTime: 60_000,
    queryFn: async (): Promise<Situacion[]> => {
      const { data, error } = await sinTipar.from("argos_situaciones").select("*").order("orden", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Situacion[];
    },
  });

  const voz = useQuery({
    queryKey: ["argos-voz"],
    staleTime: 60_000,
    queryFn: async (): Promise<Voz | null> => {
      const { data, error } = await sinTipar.from("argos_voz").select("voz_es, voz_en, intro_locutora").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Voz | null;
    },
  });

  const guardarSituacion = useMutation({
    mutationFn: async (s: Partial<Situacion> & { tipo: string }) => {
      const { tipo, ...campos } = s;
      const { error } = await sinTipar.from("argos_situaciones").update({ ...campos, updated_at: new Date().toISOString() }).eq("tipo", tipo);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["argos-situaciones"] }),
  });

  const guardarVoz = useMutation({
    mutationFn: async (v: Partial<Voz>) => {
      const { error } = await sinTipar.from("argos_voz").update({ ...v, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["argos-voz"] }),
  });

  return {
    situaciones: situaciones.data ?? [],
    voz: voz.data ?? null,
    cargando: situaciones.isLoading || voz.isLoading,
    error: (situaciones.error as Error | null) ?? (voz.error as Error | null) ?? null,
    guardarSituacion: guardarSituacion.mutateAsync,
    guardarVoz: guardarVoz.mutateAsync,
  };
}
