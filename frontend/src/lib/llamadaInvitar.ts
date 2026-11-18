// LLAMADAS TIPO SKYPE (Alvaro, 18/11/2026): agregar gente a una llamada en
// curso y hacer sonar a varios a la vez (grupos).
//
// El timbre es por persona: cada invitado es una fila 'ringing' en
// call_participants. useVideoCall escucha esas filas y muestra el modal; quien
// ya está en la llamada ve «sonando / rechazó / no contestó» por cada uno.
import { supabase } from "@/integrations/supabase/client";
import { idsContactables, restringidosOVacio } from "@/lib/contactoRestringido";

export type EstadoInvitado = "ringing" | "accepted" | "declined" | "missed" | "ended";

/** Segundos que suena a cada invitado antes de quedar como «no contestó». */
export const SUENA_MS = 45_000;

export interface LlamadaViva {
  id: string;
  caller_id: string | null;
  room_id: string;
  conversation_id: string | null;
  call_status: string;
  call_type: string;
  is_group: boolean;
}

/** La conversación de una sala `call-<uuid de la conversación>`. */
export function conversacionDeLaSala(roomName: string): string | null {
  const m = /^call-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(roomName);
  return m ? m[1] : null;
}

/** La llamada viva de esta sala (la más reciente, sonando o en curso). */
export async function buscarLlamadaViva(roomName: string): Promise<LlamadaViva | null> {
  const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data, error } = await (supabase.from("calls") as any)
    .select("id, caller_id, room_id, conversation_id, call_status, call_type, is_group")
    .eq("room_id", roomName)
    .in("call_status", ["ringing", "accepted"])
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as LlamadaViva) ?? null;
}

/** La llamada que está en pantalla: la viva, o la que acaba de terminar
 *  (rechazada o sin contestar hace menos de 3 min) para poder decirlo. */
export async function buscarUltimaLlamada(roomName: string): Promise<LlamadaViva | null> {
  const viva = await buscarLlamadaViva(roomName);
  if (viva) return viva;
  const desde = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data, error } = await (supabase.from("calls") as any)
    .select("id, caller_id, room_id, conversation_id, call_status, call_type, is_group")
    .eq("room_id", roomName)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as LlamadaViva) ?? null;
}

/** ¿Todavía se puede invitar a esta llamada? (sonando o en curso) */
export const estaViva = (l: LlamadaViva | null) => !!l && (l.call_status === "ringing" || l.call_status === "accepted");

/** La llamada de esta sala; si nadie la creó (se entró por link), se crea ya en curso. */
export async function asegurarLlamada(roomName: string, uid: string, tipo: "audio" | "video" = "video"): Promise<LlamadaViva> {
  const viva = await buscarLlamadaViva(roomName);
  if (viva) return viva;
  const { data, error } = await (supabase.from("calls") as any)
    .insert({
      caller_id: uid,
      receiver_id: null,
      call_status: "accepted",
      start_time: new Date().toISOString(),
      room_id: roomName,
      conversation_id: conversacionDeLaSala(roomName),
      call_type: tipo,
      is_group: true,
    })
    .select("id, caller_id, room_id, conversation_id, call_status, call_type, is_group")
    .single();
  if (error || !data) throw error ?? new Error("no se pudo crear la llamada");
  await (supabase.from("call_participants") as any).insert({ call_id: data.id, user_id: uid, status: "accepted" });
  return data as LlamadaViva;
}

/** Hace sonar a estas personas en la llamada. Devuelve a quiénes se invitó. */
export async function invitarALaLlamada(llamada: LlamadaViva, uid: string, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds)].filter((u) => u && u !== uid);
  if (!ids.length) return [];
  const { data: ya, error } = await (supabase.from("call_participants") as any)
    .select("id, user_id, status")
    .eq("call_id", llamada.id)
    .in("user_id", ids);
  if (error) throw error;
  const filas = (ya ?? []) as { id: string; user_id: string; status: string }[];
  const ahora = new Date().toISOString();
  // Un chatter no suma (ni hace sonar en su grupo) a otro chatter: se quitan los
  // restringidos NUEVOS. Quien ya tiene su fila en la llamada (el 1 a 1 de
  // siempre) se puede volver a llamar. La base frena igual (call_participants_contacto).
  const restringidos = await restringidosOVacio(uid);
  const nuevos = idsContactables(ids.filter((u) => !filas.some((f) => f.user_id === u)), restringidos);
  const reintento = filas.filter((f) => f.status !== "accepted" && f.status !== "ringing").map((f) => f.id);
  if (!nuevos.length && !reintento.length) return [];
  if (nuevos.length) {
    const { error: e } = await (supabase.from("call_participants") as any).insert(
      nuevos.map((u) => ({ call_id: llamada.id, user_id: u, status: "ringing", invitado_por: uid })),
    );
    if (e) throw e;
  }
  if (reintento.length) {
    await (supabase.from("call_participants") as any)
      .update({ status: "ringing", invitado_por: uid, actualizado: ahora })
      .in("id", reintento);
  }
  // Con más de dos personas, la llamada pasa a ser de grupo: rechazar ya no la
  // corta para todos.
  if (!llamada.is_group) {
    await (supabase.from("calls") as any).update({ is_group: true }).eq("id", llamada.id);
  }
  const invitados = [...nuevos, ...filas.filter((f) => reintento.includes(f.id)).map((f) => f.user_id)];
  void supabase.functions
    .invoke("web-push", { body: { action: "notify_call", callId: llamada.id, userIds: invitados } })
    .catch(() => {});
  // Si nadie contesta en SUENA_MS (45 s), queda «no contestó» (y deja de sonar).
  setTimeout(() => {
    void (supabase.from("call_participants") as any)
      .update({ status: "missed", actualizado: new Date().toISOString() })
      .eq("call_id", llamada.id)
      .in("user_id", invitados)
      .eq("status", "ringing");
  }, SUENA_MS);
  return invitados;
}
