import { supabase } from "@/integrations/supabase/client";
export type SolicitudPropia = {
  estado: "pendiente" | "aprobada" | "rechazada";
  sessionId: string; sessionName: string; roomId: string | null; roomName: string | null;
};
export type PanelAccesos = {
  personas: { id: string; nombre: string }[];
  sesiones: { id: string; nombre: string; salas: { id: string; nombre: string }[] }[];
  solicitudes: { userId: string; nombre: string; sessionId: string; sessionName: string; roomId: string | null; createdAt: string }[];
};
// Contrato explícito mientras se regeneran los tipos de las RPC nuevas.
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
async function pedir<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as Rpc)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const leerPanelAccesos = (sessionId?: string) => pedir<PanelAccesos>("cowork_panel_accesos", { _session: sessionId ?? null });
export const leerSolicitudPropia = (sessionId: string) => pedir<SolicitudPropia | null>("cowork_mi_solicitud", { _session: sessionId });
export const resolverAcceso = (sessionId: string, userId: string, roomId: string | null, aprobar: boolean) =>
  pedir<{ ok: boolean }>("cowork_resolver_acceso", { _session: sessionId, _user: userId, _room: roomId, _aprobar: aprobar });
