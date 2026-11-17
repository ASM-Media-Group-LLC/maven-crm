import { supabase } from "@/integrations/supabase/client";

// Llamar a la edge meet-room con la sesión de quien está en Maven. La usan
// «Invitar de afuera» (link directo de invitado) y «Agendar» de Meet.
// Un error de la edge sube como Error con su mensaje: un fallo no es «vacío».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invocarMeetRoom(action: string, payload: Record<string, unknown> = {}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-room`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/** ¿Esta sala admite link de invitado? Meet y llamadas del Messenger; Cowork no. */
export function salaAdmiteInvitados(sala: string | undefined | null): boolean {
  return !!sala && (sala.startsWith("meet_") || /^call-[0-9a-f-]{36}$/.test(sala));
}
