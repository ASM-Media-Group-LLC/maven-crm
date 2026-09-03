import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleTier } from "@/hooks/useRoleTier";
import { useUserRole } from "@/hooks/useUserRole";
import type { Agency, Estado, Pedido, PedidoAdjunto, PedidoEvento } from "./types";

// Las tablas son nuevas y los tipos generados de Supabase no las conocen todavía:
// se tipan a mano acá (misma excepción que otros módulos nuevos).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FiltrosPedidos {
  agencia: Agency | "";
  estado: Estado | "";
  creadora: string;   // creator_name exacto
  chatter: string;    // chatter_name tal como figura en el pedido (hay chatters que
                      // ya no tienen usuario en Maven: por id se perdían del filtro)
  mes: string;        // YYYY-MM sobre requested_on
  q: string;          // fan / descripción / creadora
}
export const FILTROS_VACIOS: FiltrosPedidos = { agencia: "", estado: "", creadora: "", chatter: "", mes: "", q: "" };

export function usePedidos(filtros: FiltrosPedidos) {
  return useQuery({
    queryKey: ["personalizados", filtros],
    queryFn: async (): Promise<Pedido[]> => {
      let q = db.from("custom_requests").select("*").order("requested_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
      if (filtros.agencia) q = q.eq("agency", filtros.agencia);
      if (filtros.estado) q = q.eq("status", filtros.estado);
      if (filtros.creadora) q = q.eq("creator_name", filtros.creadora);
      if (filtros.chatter) q = q.eq("chatter_name", filtros.chatter);
      if (filtros.mes) {
        const [y, m] = filtros.mes.split("-").map(Number);
        const desde = `${filtros.mes}-01`;
        const hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // primer día del mes siguiente
        q = q.gte("requested_on", desde).lt("requested_on", hasta);
      }
      if (filtros.q.trim()) {
        const t = filtros.q.trim().replace(/[,()]/g, " ");
        q = q.or(`fan_handle.ilike.%${t}%,description.ilike.%${t}%,creator_name.ilike.%${t}%,chatter_name.ilike.%${t}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Pedido[];
    },
  });
}

export function usePedidoEventos(requestId: string | null) {
  return useQuery({
    queryKey: ["personalizados-eventos", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<PedidoEvento[]> => {
      const { data, error } = await db.from("custom_request_events").select("*").eq("request_id", requestId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoEvento[];
    },
  });
}

export function usePedidoAdjuntos(requestId: string | null) {
  return useQuery({
    queryKey: ["personalizados-adjuntos", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<PedidoAdjunto[]> => {
      const { data, error } = await db.from("custom_request_attachments").select("*").eq("request_id", requestId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoAdjunto[];
    },
  });
}

// Catálogos para los selectores. Creadoras activas de Maven; chatters = perfiles
// con rol Chatter (y supervisores, que también venden). Nombres para mostrar.
export function useCatalogos() {
  const creadoras = useQuery({
    queryKey: ["personalizados-creadoras"],
    queryFn: async () => {
      const { data, error } = await db.from("creators").select("id, name, artistic_name, status").order("name");
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; name: string | null; artistic_name: string | null; status: string | null }>)
        .map((c) => ({ id: c.id, nombre: (c.artistic_name || c.name || "").trim(), status: c.status }))
        .filter((c) => c.nombre);
    },
    staleTime: 5 * 60_000,
  });
  const perfiles = useQuery({
    queryKey: ["personalizados-perfiles"],
    queryFn: async () => {
      const { data, error } = await db.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; full_name: string | null }>).filter((p) => p.full_name);
    },
    staleTime: 5 * 60_000,
  });
  const nombreDe = useCallback(
    (id: string | null | undefined) => (id ? perfiles.data?.find((p) => p.id === id)?.full_name ?? null : null),
    [perfiles.data],
  );
  return { creadoras: creadoras.data ?? [], perfiles: perfiles.data ?? [], nombreDe, cargando: creadoras.isLoading || perfiles.isLoading };
}

// ¿Qué puede hacer quien está mirando? Misma precedencia que la BD: la fila
// explícita del modal de permisos manda; sin fila, decide el nivel del rol.
export function usePermisosPersonalizados() {
  const { explicitPermission, isLoading } = usePermissions();
  const { isSupervisorOrAbove } = useRoleTier();
  const { isAdmin } = useUserRole();
  const puedeAprobar = isAdmin || (explicitPermission("Personalizados", "Aprobar") ?? isSupervisorOrAbove);
  const puedeGestionar = isAdmin || (explicitPermission("Personalizados", "Gestionar") ?? isSupervisorOrAbove);
  const puedeCrear = isAdmin || (explicitPermission("Personalizados", "Crear pedido") ?? true);
  return { puedeAprobar, puedeGestionar, puedeCrear, cargando: isLoading };
}

export type PedidoInput = Omit<Pedido, "id" | "created_at" | "updated_at" | "created_by" | "approved_by" | "approved_at" | "delivered_at" | "source" | "source_ref" | "status"> & { status?: Estado };

export function useMutacionesPedidos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["personalizados"] });
    qc.invalidateQueries({ queryKey: ["personalizados-eventos"] });
  };

  const crear = useMutation({
    mutationFn: async (input: PedidoInput) => {
      const { data, error } = await db.from("custom_requests").insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data as Pedido;
    },
    onSuccess: invalidar,
  });

  const editar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pedido> }) => {
      const { data, error } = await db.from("custom_requests").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Pedido;
    },
    onSuccess: invalidar,
  });

  // Cambiar de estado. El trigger de la BD exige supervisor+ para aprobar/denegar
  // y anota el evento; acá solo se manda el estado (y el motivo si es denegado).
  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado, motivo }: { id: string; estado: Estado; motivo?: string }) => {
      const patch: Partial<Pedido> = { status: estado };
      if (estado === "denegado" && motivo) patch.denied_reason = motivo;
      const { data, error } = await db.from("custom_requests").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as Pedido;
    },
    onSuccess: invalidar,
  });

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("custom_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  // Adjuntos: el archivo va al bucket PRIVADO custom-requests y la fila apunta
  // al path. Se muestran con URL firmada (1h) — nunca pública: son referencias
  // de contenido adulto y entregas de las creadoras.
  const subirAdjunto = useMutation({
    mutationFn: async ({ requestId, file, kind }: { requestId: string; file: File; kind: "referencia" | "entrega" }) => {
      if (!user) throw new Error("Sin sesión");
      const seguro = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${requestId}/${Date.now()}-${seguro}`;
      const { error: upErr } = await supabase.storage.from("custom-requests").upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error } = await db.from("custom_request_attachments").insert({
        request_id: requestId, storage_path: path, file_name: file.name, mime_type: file.type || null,
        size_bytes: file.size, kind, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["personalizados-adjuntos", v.requestId] }),
  });

  const borrarAdjunto = useMutation({
    mutationFn: async (a: PedidoAdjunto) => {
      await supabase.storage.from("custom-requests").remove([a.storage_path]);
      const { error } = await db.from("custom_request_attachments").delete().eq("id", a.id);
      if (error) throw error;
      return a;
    },
    onSuccess: (a) => qc.invalidateQueries({ queryKey: ["personalizados-adjuntos", a.request_id] }),
  });

  return { crear, editar, cambiarEstado, borrar, subirAdjunto, borrarAdjunto };
}

export async function urlFirmada(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("custom-requests").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
