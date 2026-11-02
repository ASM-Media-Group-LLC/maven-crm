import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// EL CONTEXTO DE LA EMPRESA para Argos (argos_contexto, una fila por tenant):
// qué hace la empresa, qué sistemas son trabajo y cuáles fuera de lugar. Argos
// juzga el SISTEMA que usa la persona, nunca el contenido; con esto arma el
// prompt por empresa. La RLS deja leer a supervisor+ y editar solo al admin.
// Si la empresa aún no tiene fila (empresa nueva), guardar la crea.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string) => any };

export interface ArgosContexto {
  tenantId: string;
  descripcion: string;
  esTrabajo: string;
  fueraDeLugar: string;
  updatedAt: string | null;
}

export interface ContextoEditable {
  descripcion: string;
  esTrabajo: string;
  fueraDeLugar: string;
}

export function useArgosContexto() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["argos-contexto"],
    staleTime: 60_000,
    queryFn: async (): Promise<ArgosContexto | null> => {
      // La RLS ya limita a la empresa del usuario: una sola fila (o ninguna).
      const { data, error } = await sinTipar
        .from("argos_contexto")
        .select("tenant_id, descripcion, es_trabajo, fuera_de_lugar, updated_at")
        .limit(1)
        .maybeSingle();
      // PostgREST: error ≠ vacío. Si falló, propagamos; nunca mostramos "sin contexto" ante un fallo.
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        tenantId: data.tenant_id as string,
        descripcion: (data.descripcion as string) ?? "",
        esTrabajo: (data.es_trabajo as string) ?? "",
        fueraDeLugar: (data.fuera_de_lugar as string) ?? "",
        updatedAt: (data.updated_at as string) ?? null,
      };
    },
  });

  const guardar = useMutation({
    mutationFn: async (c: ContextoEditable) => {
      const { data: u } = await supabase.auth.getUser();
      let tenantId = q.data?.tenantId ?? null;
      if (!tenantId) {
        const { data: t, error: tErr } = await sinTipar.rpc("current_tenant_id");
        if (tErr) throw new Error(tErr.message);
        tenantId = (t as string | null) ?? null;
      }
      if (!tenantId) throw new Error("sin-empresa");
      const fila = {
        tenant_id: tenantId,
        descripcion: c.descripcion.trim(),
        es_trabajo: c.esTrabajo.trim(),
        fuera_de_lugar: c.fueraDeLugar.trim(),
        updated_at: new Date().toISOString(),
        updated_by: u.user?.id ?? null,
      };
      const { error } = await sinTipar.from("argos_contexto").upsert(fila, { onConflict: "tenant_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["argos-contexto"] });
    },
  });

  return {
    contexto: q.data ?? null,
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    guardar: guardar.mutateAsync,
    guardando: guardar.isPending,
    guardadoOk: guardar.isSuccess,
    errorGuardar: (guardar.error as Error | null) ?? null,
  };
}
