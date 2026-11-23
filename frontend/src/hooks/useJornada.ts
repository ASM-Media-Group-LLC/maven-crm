import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Db { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> }
const db = supabase as unknown as Db;
export interface JornadaConfig { configurada: boolean; registra_horas: boolean; registra_comida: boolean; registra_bano: boolean }
export interface RegistroJornada { id: string; user_id: string; nombre: string; inicio: string; fin: string | null; pausa_seg: number }
export interface SolicitudJornada {
  id: string; solicitante: string; nombre: string; motivo: string; estado: "pendiente" | "aprobada" | "rechazada";
  antes_inicio: string; antes_fin: string; nuevo_inicio: string; nuevo_fin: string;
}
export interface RegistrosJornada { dueno: boolean; registros: RegistroJornada[]; solicitudes: SolicitudJornada[] }
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function useJornadaConfig() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["mi-jornada-config", user?.id], enabled: !!user?.id, staleTime: 30_000,
    refetchInterval: 60_000, queryFn: () => rpc<JornadaConfig>("mi_jornada_config") });
}
export function useJornadaRegistros(abierto: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["jornada-registros", user?.id], enabled: abierto && !!user?.id,
    queryFn: () => rpc<RegistrosJornada>("jornada_registros") });
}
export function useJornadaAcciones() {
  const qc = useQueryClient();
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ["mi-turno"] }); void qc.invalidateQueries({ queryKey: ["jornada-registros"] }); };
  const pausar = useMutation({ mutationFn: (kind: "bano" | "almuerzo") => rpc("jornada_pausar", { _kind: kind }), onSuccess: refrescar });
  const retomar = useMutation({ mutationFn: () => rpc("jornada_retomar"), onSuccess: refrescar });
  const solicitar = useMutation({ mutationFn: (v: { marca: string; inicio: string; fin: string; motivo: string }) => rpc("jornada_solicitar_correccion", {
    _marca: v.marca, _inicio: v.inicio, _fin: v.fin, _motivo: v.motivo,
  }), onSuccess: refrescar });
  const resolver = useMutation({ mutationFn: (v: { id: string; aprobar: boolean }) => rpc("jornada_resolver_correccion", { _id: v.id, _aprobar: v.aprobar }), onSuccess: refrescar });
  return { pausar, retomar, solicitar, resolver };
}
