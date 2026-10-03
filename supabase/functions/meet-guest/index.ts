import { corsFor } from "../_shared/cors.ts";
// Meet — puerta PÚBLICA para invitados sin cuenta en Maven.
//
// Es el único endpoint de Meet que atiende a alguien sin sesión, así que acá vive
// toda la desconfianza:
//
//   1. GOLPEAR NO DA ACCESO. `knock` crea una solicitud pendiente y devuelve un
//      secreto para consultar el estado. El token de LiveKit se emite en `claim`,
//      y solo si alguien de adentro ya admitió. Emitirlo antes convertiría la
//      sala de espera en un adorno.
//   2. RATE LIMIT por hash de IP: sin esto, probar códigos de 6 caracteres en
//      masa hasta encontrar una reunión viva es trivial.
//   3. DOS RECHAZOS Y AFUERA, como Workspace for Education: quien fue rechazado
//      dos veces en una reunión no puede volver a pedir.
//   4. La IP se guarda HASHEADA con un salt del servidor. Alcanza para contar
//      abuso y no es un registro de direcciones de gente.
//
// El token que emite da micrófono y cámara, NUNCA roomAdmin: un invitado no
// puede mutear ni echar a nadie.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { agenciaDePersona, agenciaDeReunion } from "../_shared/livekit-agencia.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function err(req: Request, msg: string, status = 400) {
  return json(req, { error: msg }, status);
}

// ── LiveKit token (mismo esquema que livekit-token / cowork-session) ──────
function base64UrlEncode(data: Uint8Array): string {
  let b64 = "";
  for (let i = 0; i < data.length; i += 8192) {
    b64 += String.fromCharCode(...data.subarray(i, i + 8192));
  }
  return btoa(b64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s);
}

async function signHS256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", strToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, strToBytes(payload)));
  return base64UrlEncode(sig);
}

async function createGuestToken(
  apiKey: string, apiSecret: string, identity: string, name: string, room: string, ttl = 14400,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey, sub: identity, iat: now, nbf: now, exp: now + ttl, name,
    video: {
      roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true,
      roomAdmin: false, // un invitado nunca modera
    },
    metadata: JSON.stringify({ name, isGuest: true }),
  };
  const hB64 = base64UrlEncode(strToBytes(JSON.stringify(header)));
  const pB64 = base64UrlEncode(strToBytes(JSON.stringify(payload)));
  return `${hB64}.${pB64}.${await signHS256(`${hB64}.${pB64}`, apiSecret)}`;
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", strToBytes(`${salt}:${ip}`));
  return base64UrlEncode(new Uint8Array(digest)).slice(0, 32);
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "unknown";
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

// Límites del endpoint público.
const MAX_ATTEMPTS_PER_10MIN = 8;   // intentos (acertados o no) por IP
const MAX_DENIALS_PER_ROOM = 2;     // rechazos antes de cerrarle la puerta

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { action } = body;

    const lkUrl = Deno.env.get("LIVEKIT_URL")!;
    const lkKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    // Si no hay salt configurado usamos el secreto de service_role como salt:
    // nunca sale de acá y el hash solo tiene que ser estable e imposible de
    // revertir a la IP.
    const ipSalt = Deno.env.get("MEET_GUEST_IP_SALT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ═══════════════════════════════════════════════════════════════
    // KNOCK — "quiero entrar". NO devuelve token de LiveKit.
    // ═══════════════════════════════════════════════════════════════
    if (action === "knock") {
      const code = normalizeCode(body.code);
      const rawName = String(body.name ?? "").trim().replace(/\s+/g, " ");
      if (code.length !== 6) return err(req, "Código inválido");
      if (rawName.length < 2) return err(req, "Escribe tu nombre para pedir entrar");
      const guestName = rawName.slice(0, 40);

      const ipHash = await hashIp(clientIp(req), ipSalt);

      // Rate limit ANTES de tocar la reunión, así un barrido de códigos se corta
      // aunque acierte.
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: recentAttempts } = await admin.from("meet_guest_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", since);
      if (recentAttempts !== null && recentAttempts >= MAX_ATTEMPTS_PER_10MIN) {
        return err(req, "Demasiados intentos. Espera unos minutos.", 429);
      }

      const { data: room } = await admin.from("meet_rooms")
        .select("id, name, livekit_room_name, status")
        .eq("code", code).maybeSingle();

      await admin.from("meet_guest_attempts").insert({ ip_hash: ipHash, ok: !!room });
      // Purga barata: la tabla es solo telemetría de abuso.
      await admin.from("meet_guest_attempts")
        .delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (!room) return err(req, "Código inválido", 404);
      if (room.status !== "active") return err(req, "Esa reunión ya terminó", 410);

      // Dos rechazos en ESTA reunión y no se puede volver a pedir.
      const { count: denials } = await admin.from("meet_guest_requests")
        .select("*", { count: "exact", head: true })
        .eq("meet_room_id", room.id).eq("ip_hash", ipHash).eq("status", "denied");
      if (denials !== null && denials >= MAX_DENIALS_PER_ROOM) {
        return err(req, "Tu solicitud fue rechazada. Contacta a quien te invitó.", 403);
      }

      const guestToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

      const { error: insErr } = await admin.from("meet_guest_requests").insert({
        meet_room_id: room.id, guest_name: guestName, guest_token: guestToken, ip_hash: ipHash,
      });
      if (insErr) return err(req, insErr.message, 500);

      return json(req, { guestToken, roomName: room.name, status: "pending" });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLAIM — "¿ya me admitieron?". Devuelve el token SOLO si sí.
    // ═══════════════════════════════════════════════════════════════
    // El invitado colgó. Cierra SU admisión: nadie más puede hacerlo porque
    // hace falta su token, que solo tiene su navegador.
    if (action === "leave") {
      const guestToken = String(body.guestToken ?? "");
      if (guestToken.length < 32) return err(req, "Solicitud inválida", 400);
      // `is("left_at", null)` para no correr la marca si vuelve a llamar: la
      // hora que importa es la de la primera salida.
      await admin.from("meet_guest_requests")
        .update({ left_at: new Date().toISOString() })
        .eq("guest_token", guestToken).is("left_at", null);
      return json(req, { ok: true });
    }

    if (action === "claim") {
      const guestToken = String(body.guestToken ?? "");
      if (guestToken.length < 32) return err(req, "Solicitud inválida", 400);

      const { data: request } = await admin.from("meet_guest_requests")
        .select("id, meet_room_id, guest_name, status, left_at, decided_by")
        .eq("guest_token", guestToken).maybeSingle();
      if (!request) return err(req, "Solicitud no encontrada", 404);

      // Ya colgó una vez: esa entrada se consumió. Volver exige pedir de nuevo
      // y que alguien de adentro apruebe otra vez (Jhon, 09/09/2026). Antes la
      // admisión era para siempre y el token guardado lo devolvía derecho a la
      // llamada, así que con el enlace un externo entraba y salía todo el día.
      if (request.left_at) return json(req, { status: "left" });

      if (request.status === "denied") return json(req, { status: "denied" });
      if (request.status === "pending") return json(req, { status: "pending" });

      const { data: room } = await admin.from("meet_rooms")
        .select("*").eq("id", request.meet_room_id).maybeSingle();
      if (!room) return err(req, "Reunión no encontrada", 404);
      if (room.status !== "active") return json(req, { status: "ended" });

      // La admisión vale solo si la dio alguien de la agencia de la reunión
      // (entrega 3c; meet-room y la base ya lo exigen al admitir). Si no, es como
      // un rechazo: el invitado puede volver a pedir y que lo admita alguien de
      // adentro. El token es de ESTA sala y de ninguna otra: la del pedido, nunca
      // una que mande el cliente.
      const agenciaDeLaReunion = await agenciaDeReunion(admin, room);
      if (!agenciaDeLaReunion || await agenciaDePersona(admin, request.decided_by) !== agenciaDeLaReunion) {
        return json(req, { status: "denied" });
      }

      // Identidad propia y marcada, para que en la sala se vea que es un invitado
      // y no se confunda con una cuenta de Maven.
      const token = await createGuestToken(
        lkKey, lkSecret, `guest_${request.id}`, request.guest_name, room.livekit_room_name,
      );

      return json(req, {
        status: "admitted", token, url: lkUrl,
        room: room.livekit_room_name, roomName: room.name, guestName: request.guest_name,
      });
    }

    return err(req, "Unknown action: " + action);
  } catch (e) {
    console.error("meet-guest error:", e);
    return err(req, "Internal server error", 500);
  }
});
