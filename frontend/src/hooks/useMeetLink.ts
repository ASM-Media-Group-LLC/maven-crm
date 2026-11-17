import { useCallback, useEffect, useRef, useState } from "react";

// Invitado SIN cuenta que entra por LINK DIRECTO (/unirse/<link>): escribe su
// nombre y entra, sin sala de espera (Alvaro, 17/11/2026). La sala de espera
// (useMeetGuest, /entrar/<código>) sigue para quien llega solo con el código.
//
// Como useMeetGuest, no usa el cliente de Supabase: el invitado no tiene sesión
// y nunca la tiene. Le pega a la edge pública `meet-guest`, que valida el link y
// emite un token de LiveKit acotado a ESA sala.
export type EstadoLink = "revisando" | "listo" | "entrando" | "adentro" | "invalido" | "error";

interface Llamada { token: string; url: string; room: string }

async function llamarMeetGuest(action: string, payload: Record<string, unknown>) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-guest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** El link tiene que verse como id.firma antes de molestar al servidor. */
export function formaDeLink(raw: string): boolean {
  return /^[0-9a-f]{32}\.[A-Za-z0-9_-]{32}$/.test(raw);
}

export function useMeetLink(link: string) {
  const [estado, setEstado] = useState<EstadoLink>("revisando");
  const [error, setError] = useState<string | null>(null);
  const [nombreSala, setNombreSala] = useState<string | null>(null);
  const [agendadaPara, setAgendadaPara] = useState<string | null>(null);
  const [miNombre, setMiNombre] = useState<string | null>(null);
  const [llamada, setLlamada] = useState<Llamada | null>(null);
  const salidaRef = useRef<string | null>(null);

  const revisar = useCallback(async () => {
    if (!formaDeLink(link)) { setEstado("invalido"); return; }
    setEstado("revisando");
    setError(null);
    try {
      const r = await llamarMeetGuest("linkInfo", { link });
      if (r.ok && r.json.ok) {
        setNombreSala(r.json.roomName ?? null);
        setAgendadaPara(r.json.scheduledFor ?? null);
        setEstado("listo");
        return;
      }
      // 404/410: el link no sirve (falso, vencido, anulado o la reunión
      // terminó). Otro código (429, 5xx) NO es «link inválido»: es un fallo, y
      // se ofrece reintentar en vez de mandar a la persona a pedir otro link.
      setError(r.json.error || null);
      setEstado(r.status === 404 || r.status === 410 ? "invalido" : "error");
    } catch {
      setEstado("error");
    }
  }, [link]);

  useEffect(() => { void revisar(); }, [revisar]);

  const entrar = useCallback(async (nombre: string) => {
    setError(null);
    setEstado("entrando");
    try {
      const r = await llamarMeetGuest("joinLink", { link, name: nombre });
      if (r.ok && r.json.token && r.json.url && r.json.room) {
        setLlamada({ token: r.json.token, url: r.json.url, room: r.json.room });
        setNombreSala(r.json.roomName ?? nombreSala);
        setMiNombre(r.json.guestName ?? nombre);
        salidaRef.current = r.json.guestToken ?? null;
        setEstado("adentro");
        return;
      }
      setError(r.json.error || null);
      setEstado(r.status === 404 || r.status === 410 ? "invalido" : "listo");
    } catch {
      setError(null);
      setEstado("error");
    }
  }, [link, nombreSala]);

  const getToken = useCallback(async () => {
    if (!llamada) throw new Error("not-joined");
    return { token: llamada.token, url: llamada.url };
  }, [llamada]);

  // Salir: se avisa al servidor (queda la hora de salida en el historial del
  // Meet). Con el link todavía vivo, puede volver a entrar: como en Google Meet.
  const salir = useCallback(async () => {
    const t = salidaRef.current;
    salidaRef.current = null;
    setLlamada(null);
    setEstado("listo");
    if (t) await llamarMeetGuest("leave", { guestToken: t }).catch(() => {});
  }, []);

  return { estado, error, nombreSala, agendadaPara, miNombre, llamada, revisar, entrar, getToken, salir };
}
