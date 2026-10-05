// Operaciones de SERVIDOR sobre una sala de LiveKit (API twirp), compartidas por
// las edges de Meet: quién está adentro y borrar la sala.
//
// Antes cada edge tenía su propia copia del token de administración, o no podía
// hablar con LiveKit en absoluto: `meet-room` terminaba una reunión solo en la
// base, y la gente seguía hablando en una sala que para Maven «ya terminó».
// Los secretos se leen acá, en cada llamada, igual que en livekit-aviso.ts.

function base64UrlEncode(data: Uint8Array): string {
  let b64 = "";
  for (let i = 0; i < data.length; i += 8192) b64 += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(b64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Token de ADMINISTRACIÓN de 60 s: solo tiene que durar esta petición.
// `roomAdmin` alcanza para ListParticipants; DeleteRoom exige además
// `roomCreate` (sin él LiveKit contesta 401). Se pide solo cuando hace falta.
async function tokenDeApi(apiKey: string, apiSecret: string, room: string, conRoomCreate: boolean): Promise<string> {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(enc.encode(JSON.stringify({
    iss: apiKey, sub: "maven-sala", iat: now, nbf: now, exp: now + 60,
    video: conRoomCreate ? { roomAdmin: true, roomCreate: true, room } : { roomAdmin: true, room },
  })));
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64UrlEncode(firma)}`;
}

// LIVEKIT_URL es el wss:// de los clientes; la API vive en el mismo host por https.
function httpBase(): string {
  return (Deno.env.get("LIVEKIT_URL") ?? "").replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
}

export interface RespuestaTwirp { ok: boolean; status: number; data: unknown }

/** Llama a un método de RoomService. Nunca tira por red: devuelve `status: 0`. */
export async function twirpSala(method: "ListParticipants" | "DeleteRoom", room: string, body: unknown): Promise<RespuestaTwirp> {
  try {
    const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    const token = await tokenDeApi(apiKey, apiSecret, room, method === "DeleteRoom");
    const res = await fetch(`${httpBase()}/twirp/livekit.RoomService/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.warn(`[livekit-sala] ${method}`, (e as Error).message);
    return { ok: false, status: 0, data: null };
  }
}

export interface ParticipanteDeSala {
  identity: string;
  name?: string;
  kind?: string | number;
  permission?: { hidden?: boolean } & Record<string, unknown>;
}

/** Quiénes están de verdad en la sala: sin la grabadora (oculta), sin agentes
 *  y sin el supervisor de Cowork mirando (`__monitor`/`__preview`).
 *
 *  Devuelve `[]` si la sala está vacía o todavía no existe en LiveKit (una sala
 *  nace con el primer join: el 404 no es un error). Devuelve `null` si LiveKit
 *  no contestó: quien llama decide qué hacer sin saber. */
export async function participantesVisibles(room: string): Promise<ParticipanteDeSala[] | null> {
  const res = await twirpSala("ListParticipants", room, { room });
  if (!res.ok && res.status === 404) return [];
  if (!res.ok) return null;
  const todos = ((res.data as { participants?: ParticipanteDeSala[] } | null)?.participants ?? []);
  return todos.filter((p) => {
    if (p.permission?.hidden) return false;
    if (p.kind && p.kind !== "STANDARD" && p.kind !== 0) return false;
    if (/__(monitor|preview)(__|$)/.test(p.identity)) return false;
    return true;
  });
}

/** Borra la sala: todos los que están adentro reciben ROOM_DELETED. Una sala
 *  que nunca tuvo a nadie no existe en LiveKit y responde 404: borrar algo que
 *  no existe cuenta como hecho. */
export async function borrarSala(room: string): Promise<{ ok: boolean; existia: boolean; status: number }> {
  const res = await twirpSala("DeleteRoom", room, { room });
  if (res.ok) return { ok: true, existia: true, status: res.status };
  if (res.status === 404) return { ok: true, existia: false, status: 404 };
  console.warn(`[livekit-sala] DeleteRoom ${room} -> ${res.status}`, JSON.stringify(res.data));
  return { ok: false, existia: false, status: res.status };
}
