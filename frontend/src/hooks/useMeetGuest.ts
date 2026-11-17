import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DestinoDeTelemetria, FilaDeCorte, FilaDeSalud } from "@/lib/saludDeLlamada";

// Invitado SIN cuenta en Maven: golpea, espera que alguien de adentro lo admita,
// y recién entonces recibe el token de LiveKit.
//
// No usa el cliente de Supabase porque no hay sesión: le pega directo a la edge
// pública `meet-guest`, que es la única de Meet que atiende sin autenticación.
export type GuestStatus = "idle" | "knocking" | "pending" | "admitted" | "denied" | "ended" | "error";

interface ClaimResult {
  status: string;
  token?: string;
  url?: string;
  room?: string;
  roomName?: string;
  guestName?: string;
}

const POLL_MS = 3000;

async function callMeetGuest(action: string, payload: Record<string, unknown>) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-guest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

/** Fuego y olvido, con `keepalive`: sale aunque la página se esté cerrando (la
 *  salida por caída se manda justo al cerrarse). Nunca tira. */
function enviarSinEsperar(action: string, payload: Record<string, unknown>): void {
  try {
    void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-guest`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action, ...payload }),
    }).catch(() => {});
  } catch { /* sin aviso, pero sin romper nada */ }
}

// El secreto del invitado vive en el navegador: si recarga la página mientras
// espera, retoma su solicitud en vez de golpear de nuevo (y gastar un intento).
const storageKey = (code: string) => `meet.guest.${code.toUpperCase()}`;

export function useMeetGuest(code: string) {
  const [status, setStatus] = useState<GuestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [call, setCall] = useState<{ token: string; url: string; room: string } | null>(null);
  const guestTokenRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const applyClaim = useCallback((res: ClaimResult) => {
    if (res.status === "admitted" && res.token && res.url && res.room) {
      setCall({ token: res.token, url: res.url, room: res.room });
      if (res.roomName) setRoomName(res.roomName);
      if (res.guestName) setGuestName(res.guestName);
      setStatus("admitted");
      return true;
    }
    // Ya colgó una vez: esa admisión se terminó. Se limpia el token guardado
    // para que volver a entrar sea una solicitud NUEVA, con aprobación nueva.
    if (res.status === "left") {
      try { window.localStorage.removeItem(storageKey(code)); } catch { /* noop */ }
      guestTokenRef.current = null;
      setCall(null);
      setStatus("idle");
      return true;
    }
    if (res.status === "denied") { setStatus("denied"); return true; }
    if (res.status === "ended") { setStatus("ended"); return true; }
    setStatus("pending");
    return false;
  }, [code]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      const guestToken = guestTokenRef.current;
      if (!guestToken) return;
      try {
        const res = await callMeetGuest("claim", { guestToken });
        if (applyClaim(res)) stopPolling();
      } catch {
        // Un fallo puntual de red no cancela la espera: reintenta en el próximo tick.
      }
    }, POLL_MS);
  }, [applyClaim, stopPolling]);

  // Si ya había golpeado antes (recarga), retomamos su solicitud.
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey(code));
    if (!saved) return;
    guestTokenRef.current = saved;
    setStatus("pending");
    callMeetGuest("claim", { guestToken: saved })
      .then((res) => { if (!applyClaim(res)) startPolling(); })
      .catch(() => {
        // La solicitud ya no existe (reunión borrada): volvemos a empezar limpio.
        window.localStorage.removeItem(storageKey(code));
        guestTokenRef.current = null;
        setStatus("idle");
      });
    return stopPolling;
  }, [code, applyClaim, startPolling, stopPolling]);

  const knock = useCallback(async (name: string) => {
    setError(null);
    setStatus("knocking");
    try {
      const res = await callMeetGuest("knock", { code, name });
      guestTokenRef.current = res.guestToken;
      window.localStorage.setItem(storageKey(code), res.guestToken);
      setRoomName(res.roomName ?? null);
      setGuestName(name);
      setStatus("pending");
      startPolling();
    } catch (e: any) {
      setError(e.message || "No se pudo pedir entrada");
      setStatus("error");
    }
  }, [code, startPolling]);

  // LiveKitCallView pide el token con esta función; para el invitado ya lo tenemos
  // del claim que lo admitió.
  const getToken = useCallback(async () => {
    if (!call) throw new Error("Todavía no te admitieron");
    return { token: call.token, url: call.url };
  }, [call]);

  // Colgar TERMINA la admisión. Antes salir no cambiaba nada del lado del
  // servidor: el token seguía guardado y volver a entrar —o simplemente
  // recargar— lo metía derecho a la llamada sin que nadie lo aprobara otra vez
  // (Jhon, 09/09/2026: "debería volver a pedir autorización y no entrar como si
  // nada"). Ahora vuelve al formulario y tiene que golpear de nuevo.
  const leave = useCallback(async () => {
    const token = guestTokenRef.current;
    stopPolling();
    setCall(null);
    setStatus("idle");
    guestTokenRef.current = null;
    try { window.localStorage.removeItem(storageKey(code)); } catch { /* noop */ }
    // Aunque el aviso al servidor falle, del lado de esta persona ya salió: lo
    // que se pierde es que su token viejo siga sirviendo, no la salida.
    if (token) await callMeetGuest("leave", { guestToken: token }).catch(() => {});
  }, [code, stopPolling]);

  // SE LE CAYÓ, NO COLGÓ (Alvaro, 17/11/2026). Cerrar la pestaña o recargar en
  // medio de la llamada se avisa como CAÍDA: el secreto queda guardado y durante
  // 15 minutos vuelve a entrar solo, sin que lo admitan otra vez (meet-guest,
  // REENTRADA_DEL_INVITADO_MS). Colgar con el botón sigue siendo `leave()`, que
  // termina la admisión.
  useEffect(() => {
    if (status !== "admitted" || !call) return;
    const alIrse = () => {
      const g = guestTokenRef.current;
      if (g) enviarSinEsperar("leave", { guestToken: g, caida: true });
    };
    window.addEventListener("pagehide", alIrse);
    return () => window.removeEventListener("pagehide", alIrse);
  }, [status, call]);

  // Los cortes y la salud de su llamada (saludDeLlamada.ts): sin sesión, las
  // tablas del equipo los rechazan; van por meet-guest con su secreto.
  const telemetria = useMemo<DestinoDeTelemetria>(() => ({
    corte: (fila: FilaDeCorte) => {
      const g = guestTokenRef.current;
      if (g) enviarSinEsperar("telemetria", { guestToken: g, tipo: "corte", ...fila });
    },
    salud: (fila: FilaDeSalud) => {
      const g = guestTokenRef.current;
      if (g) enviarSinEsperar("telemetria", { guestToken: g, tipo: "salud", ...fila });
    },
  }), []);

  useEffect(() => stopPolling, [stopPolling]);

  return { status, error, roomName, guestName, call, knock, getToken, leave, telemetria };
}
