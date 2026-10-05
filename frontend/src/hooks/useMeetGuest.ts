import { useCallback, useEffect, useRef, useState } from "react";
import { traducir } from "@/lib/i18n";

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

/** Lo que contesta la edge en cualquiera de sus acciones (knock/claim/leave). */
interface RespuestaMeetGuest extends ClaimResult {
  guestToken?: string;
  ok?: boolean;
}

const POLL_MS = 3000;

/** Cuánto espera el invitado antes de que la pantalla le diga que nadie ha
 *  respondido. Google Meet lo dice; acá la espera era infinita y sin salida, y
 *  la persona concluía que el enlace no funcionaba. */
export const SIN_RESPUESTA_MS = 10 * 60 * 1000;

/** Un fallo al hablar con la edge, con lo que hace falta para DECIDIR qué hacer:
 *  un 404 es "esa solicitud no existe", pero la red caída o un 5xx no dicen nada
 *  sobre la solicitud, y tratarlos igual tiraba una espera legítima. */
export class ErrorDeMeetGuest extends Error {
  /** Código HTTP, o 0 si la petición no llegó (red) o la respuesta no era JSON. */
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ErrorDeMeetGuest";
    this.status = status;
  }
  /** La solicitud guardada ya no sirve: hay que empezar de nuevo. */
  get solicitudInvalida(): boolean {
    return this.status === 400 || this.status === 404;
  }
}

async function callMeetGuest(action: string, payload: Record<string, unknown>): Promise<RespuestaMeetGuest> {
  let res: Response;
  try {
    res = await fetch(
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
  } catch {
    // "Failed to fetch": sin red, CORS o DNS. Llegaba en inglés y sin pista.
    throw new ErrorDeMeetGuest(traducir("meet.guest.networkError"), 0);
  }
  // Un 502/546 del gateway llega como HTML: `res.json()` tiraba
  // "Unexpected token '<'" y eso era lo que leía la persona en pantalla.
  let json: Record<string, unknown> | null = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    const delServidor = json && typeof json.error === "string" ? json.error : null;
    throw new ErrorDeMeetGuest(delServidor || traducir("meet.guest.serverError"), json ? res.status : 0);
  }
  if (!json) throw new ErrorDeMeetGuest(traducir("meet.guest.serverError"), 0);
  return json as unknown as RespuestaMeetGuest;
}

// El secreto del invitado vive en el navegador: si recarga la página mientras
// espera, retoma su solicitud en vez de golpear de nuevo (y gastar un intento).
const storageKey = (code: string) => `meet.guest.${code.toUpperCase()}`;

function olvidarSecreto(code: string) {
  try { window.localStorage.removeItem(storageKey(code)); } catch { /* noop */ }
}

export function useMeetGuest(code: string) {
  const [status, setStatus] = useState<GuestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [call, setCall] = useState<{ token: string; url: string; room: string } | null>(null);
  // Lleva tanto esperando que vale la pena decírselo (ver SIN_RESPUESTA_MS).
  const [sinRespuesta, setSinRespuesta] = useState(false);
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
      olvidarSecreto(code);
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
      } catch (e) {
        // Un fallo puntual de red no cancela la espera: reintenta en el próximo
        // tick. Solo si el servidor dice que la solicitud YA NO EXISTE se deja
        // de insistir (la reunión se borró, o el secreto quedó viejo).
        if (e instanceof ErrorDeMeetGuest && e.solicitudInvalida) {
          stopPolling();
          olvidarSecreto(code);
          guestTokenRef.current = null;
          setStatus("idle");
        }
      }
    }, POLL_MS);
  }, [applyClaim, stopPolling, code]);

  // Si ya había golpeado antes (recarga), retomamos su solicitud.
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey(code));
    if (!saved) return;
    guestTokenRef.current = saved;
    setStatus("pending");
    callMeetGuest("claim", { guestToken: saved })
      .then((res) => { if (!applyClaim(res)) startPolling(); })
      .catch((e) => {
        // Antes CUALQUIER fallo acá borraba el secreto y mandaba a la persona al
        // formulario, también si lo que falló fue la red al recargar: golpeaba
        // de nuevo, gastaba un intento y el anfitrión veía dos "Ana quiere
        // entrar". Solo "la solicitud no existe" vuelve a empezar; lo demás
        // sigue esperando y sondeando.
        if (e instanceof ErrorDeMeetGuest && !e.solicitudInvalida) {
          startPolling();
          return;
        }
        olvidarSecreto(code);
        guestTokenRef.current = null;
        setStatus("idle");
      });
    return stopPolling;
  }, [code, applyClaim, startPolling, stopPolling]);

  // Pasado un rato en espera, la pantalla pasa de "espera" a "nadie respondió".
  // Antes el spinner era eterno y sin botón.
  useEffect(() => {
    if (status !== "pending") {
      setSinRespuesta(false);
      return;
    }
    const id = window.setTimeout(() => setSinRespuesta(true), SIN_RESPUESTA_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const knock = useCallback(async (name: string) => {
    setError(null);
    setStatus("knocking");
    try {
      const res = await callMeetGuest("knock", { code, name });
      const guestToken = res.guestToken ?? "";
      guestTokenRef.current = guestToken;
      window.localStorage.setItem(storageKey(code), guestToken);
      setRoomName(res.roomName ?? null);
      setGuestName(name);
      setStatus("pending");
      startPolling();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : traducir("meet.guest.knockFailed"));
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
  //
  // También es "Cancelar" mientras espera: el servidor anota la salida y el
  // panel del anfitrión deja de mostrar la solicitud.
  const leave = useCallback(async () => {
    const token = guestTokenRef.current;
    stopPolling();
    setCall(null);
    setStatus("idle");
    guestTokenRef.current = null;
    olvidarSecreto(code);
    // Aunque el aviso al servidor falle, del lado de esta persona ya salió: lo
    // que se pierde es que su token viejo siga sirviendo, no la salida.
    if (token) await callMeetGuest("leave", { guestToken: token }).catch(() => {});
  }, [code, stopPolling]);

  // Volver a empezar desde un rechazo o una espera sin respuesta: se olvida la
  // solicitud anterior y vuelve el formulario. Antes "No te dejaron entrar" no
  // tenía ningún botón y, como el secreto seguía guardado, recargar o reabrir
  // el enlace mostraba lo mismo: un rechazo por error era definitivo en ese
  // navegador.
  const reiniciar = useCallback(() => {
    stopPolling();
    guestTokenRef.current = null;
    olvidarSecreto(code);
    setCall(null);
    setError(null);
    setStatus("idle");
  }, [code, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { status, error, roomName, guestName, call, sinRespuesta, knock, getToken, leave, reiniciar };
}
