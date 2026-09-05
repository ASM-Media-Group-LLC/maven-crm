// Avisos del SERVIDOR a toda una sala de LiveKit (self-hosted en Dokploy).
//
// Cuando el servidor ejecuta algo que la gente tiene que saber —alguien fue
// silenciado, empezó una grabación— se lo cuenta a la sala por el canal de
// datos con la API twirp `SendData`. Del lado del cliente estos mensajes
// llegan SIN participante remitente: esa es la firma de que vienen del
// servidor y no de un cliente haciéndose pasar por él.

export type ClaseDeAviso = "silenciado" | "silenciados-todos" | "grabando" | "grabacion-detenida";

export interface PersonaDelAviso { uuid: string | null; nombre: string }

export interface AvisoDeSala {
  clase: ClaseDeAviso;
  /** A quién le pasó (silenciado). */
  objetivo?: PersonaDelAviso & { identity: string };
  /** Quién lo hizo. */
  por: PersonaDelAviso;
}

function base64UrlEncode(data: Uint8Array): string {
  let b64 = "";
  for (let i = 0; i < data.length; i += 8192) b64 += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(b64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64Std(data: Uint8Array): string {
  let b64 = "";
  for (let i = 0; i < data.length; i += 8192) b64 += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(b64);
}

async function tokenAdmin(apiKey: string, apiSecret: string, room: string): Promise<string> {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(enc.encode(JSON.stringify({
    iss: apiKey, sub: "maven-avisos", iat: now, nbf: now, exp: now + 60,
    video: { roomAdmin: true, room },
  })));
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64UrlEncode(firma)}`;
}

/** Manda el aviso a todos los de la sala. Nunca tira: si falla, la acción
 *  principal (silenciar, grabar) ya se hizo y eso es lo que importa. */
export async function enviarAvisoASala(room: string, aviso: AvisoDeSala): Promise<boolean> {
  try {
    const url = (Deno.env.get("LIVEKIT_URL") ?? "").replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
    const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    const cuerpo = new TextEncoder().encode(JSON.stringify({ type: "aviso", payload: aviso }));
    const res = await fetch(`${url}/twirp/livekit.RoomService/SendData`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenAdmin(apiKey, apiSecret, room)}` },
      body: JSON.stringify({ room, data: base64Std(cuerpo), kind: "RELIABLE" }),
    });
    if (!res.ok) console.warn("[livekit-aviso] SendData", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.warn("[livekit-aviso]", (e as Error).message);
    return false;
  }
}

/** Nombre visible de un usuario de Maven, para el aviso. */
// deno-lint-ignore no-explicit-any
export async function nombreDeUsuario(admin: any, userId: string, respaldo = "Alguien de Maven"): Promise<string> {
  try {
    const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    return (data?.full_name as string | null)?.trim() || respaldo;
  } catch {
    return respaldo;
  }
}
