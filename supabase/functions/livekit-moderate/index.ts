import { corsFor } from "../_shared/cors.ts";
// Moderación REAL de llamadas: mutear, expulsar, quitar la palabra y terminar.
//
// POR QUÉ EXISTE: antes esto se hacía publicando un mensaje por el canal de datos
// de LiveKit y esperando que el cliente de la víctima se muteara o se
// desconectara solo. Era honor system — con la consola abierta, ignorabas el
// mensaje y te quedabas — y encima el chequeo de "sos admin" que corría en el
// receptor daba verdadero para cualquiera (comparaba `canPublish && canSubscribe`,
// que todo participante tiene).
//
// Ahora la acción la ejecuta el SERVIDOR de LiveKit por su API twirp, y la
// autorización la responde la base (`can_moderate_livekit_room`), que sabe quién
// es host de cada tipo de sala: creador/co-anfitrión de un Meet, host de una
// sesión de Cowork, o quien inició una llamada 1:1.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function err(req: Request, msg: string, status = 400) {
  return json(req, { error: msg }, status);
}

function base64UrlEncode(data: Uint8Array): string {
  let b64 = "";
  for (let i = 0; i < data.length; i += 8192) b64 += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(b64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function signHS256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", strToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, strToBytes(payload))));
}

// Token de ADMINISTRACIÓN de sala: no es para unirse, es para que la API twirp
// acepte las órdenes. Vive 60 segundos — solo tiene que durar esta petición.
//
// OJO con los grants: `roomAdmin` habilita ListParticipants, MutePublishedTrack,
// UpdateParticipant y RemoveParticipant, pero DeleteRoom exige `roomCreate` y
// devuelve 401 sin él. Se pide solo cuando hace falta (menor privilegio).
async function createAdminToken(
  apiKey: string, apiSecret: string, room: string, canDeleteRoom = false,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey, sub: "maven-moderation", iat: now, nbf: now, exp: now + 60,
    video: canDeleteRoom ? { roomAdmin: true, roomCreate: true, room } : { roomAdmin: true, room },
  };
  const hB64 = base64UrlEncode(strToBytes(JSON.stringify(header)));
  const pB64 = base64UrlEncode(strToBytes(JSON.stringify(payload)));
  return `${hB64}.${pB64}.${await signHS256(`${hB64}.${pB64}`, apiSecret)}`;
}

// LIVEKIT_URL es el wss:// que usan los clientes; la API de administración vive
// en el mismo host por https.
function httpBase(livekitUrl: string): string {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/+$/, "");
}

async function twirp(
  livekitUrl: string, apiKey: string, apiSecret: string, room: string, method: string, body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await createAdminToken(apiKey, apiSecret, room, method === "DeleteRoom");
  const res = await fetch(`${httpBase(livekitUrl)}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

interface LkTrack { sid: string; type?: string; source?: string; muted?: boolean; }
interface LkParticipant { identity: string; name?: string; tracks?: LkTrack[]; permission?: Record<string, unknown>; }

// El identity de un usuario de Maven es `<uuid>` o `<uuid>_<sufijo>` (y
// `<uuid>__preview` / `__monitor` en Cowork). Los invitados de Meet son
// `guest_<uuid>` y no tienen cuenta.
function userIdFromIdentity(identity: string): string | null {
  if (identity.startsWith("guest_")) return null;
  const head = identity.split("_")[0];
  return /^[0-9a-f-]{36}$/i.test(head) ? head : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err(req, "Unauthorized", 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return err(req, "Unauthorized", 401);
    const userId = userData.user.id;

    const body = await req.json();
    const action = String(body.action ?? "");
    const room = String(body.room ?? "").trim();
    if (!room) return err(req, "room required");

    const lkUrl = Deno.env.get("LIVEKIT_URL")!;
    const lkKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

    // ── Autorización: una sola pregunta a la base ────────────────────────
    const { data: canModerate, error: permErr } = await admin.rpc("can_moderate_livekit_room", {
      _user_id: userId, _room: room,
    });
    if (permErr) return err(req, permErr.message, 500);
    if (!canModerate) return err(req, "No eres anfitrión de esta llamada", 403);

    // Un co-anfitrión no puede tocar al anfitrión ORIGINAL (regla de Google).
    const protectTarget = async (targetIdentity: string): Promise<string | null> => {
      const targetUserId = userIdFromIdentity(targetIdentity);
      if (!targetUserId || targetUserId === userId) return null;
      const { data: targetIsOwner } = await admin.rpc("is_livekit_room_owner", {
        _user_id: targetUserId, _room: room,
      });
      if (!targetIsOwner) return null;
      const { data: callerIsOwner } = await admin.rpc("is_livekit_room_owner", {
        _user_id: userId, _room: room,
      });
      return callerIsOwner ? null : "No puedes moderar al anfitrión de la reunión";
    };

    const listParticipants = async (): Promise<LkParticipant[]> => {
      const res = await twirp(lkUrl, lkKey, lkSecret, room, "ListParticipants", { room });
      if (!res.ok) throw new Error(`LiveKit ListParticipants ${res.status}`);
      return (res.data?.participants ?? []) as LkParticipant[];
    };

    // Los track sids los resuelve el SERVIDOR: si los aceptáramos del cliente,
    // podría mandar el de cualquier otro.
    const muteAudioOf = async (participant: LkParticipant): Promise<number> => {
      const audio = (participant.tracks ?? []).filter(
        (t) => t.type === "AUDIO" || t.source === "MICROPHONE",
      );
      let muted = 0;
      for (const track of audio) {
        if (track.muted) continue;
        const res = await twirp(lkUrl, lkKey, lkSecret, room, "MutePublishedTrack", {
          room, identity: participant.identity, track_sid: track.sid, muted: true,
        });
        if (res.ok) muted++;
      }
      return muted;
    };

    // ═══ MUTE a una persona ═══
    if (action === "muteParticipant") {
      const identity = String(body.identity ?? "");
      if (!identity) return err(req, "identity required");
      const blocked = await protectTarget(identity);
      if (blocked) return err(req, blocked, 403);

      const participants = await listParticipants();
      const target = participants.find((p) => p.identity === identity);
      if (!target) return err(req, "Esa persona ya no está en la llamada", 404);

      const muted = await muteAudioOf(target);
      return json(req, { ok: true, muted });
    }

    // ═══ MUTE a todos (menos quien lo pide y menos otros anfitriones) ═══
    if (action === "muteAll") {
      const participants = await listParticipants();
      let muted = 0;
      for (const p of participants) {
        const pUserId = userIdFromIdentity(p.identity);
        if (pUserId === userId) continue;
        if (pUserId) {
          const { data: isHost } = await admin.rpc("can_moderate_livekit_room", {
            _user_id: pUserId, _room: room,
          });
          if (isHost) continue; // no silenciamos a otro anfitrión
        }
        muted += await muteAudioOf(p);
      }
      return json(req, { ok: true, muted });
    }

    // ═══ QUITAR / DEVOLVER LA PALABRA (el "solo ver" de Google) ═══
    if (action === "setCanPublish") {
      const identity = String(body.identity ?? "");
      const canPublish = body.canPublish === true;
      if (!identity) return err(req, "identity required");
      const blocked = await protectTarget(identity);
      if (blocked) return err(req, blocked, 403);

      const res = await twirp(lkUrl, lkKey, lkSecret, room, "UpdateParticipant", {
        room, identity,
        permission: { can_subscribe: true, can_publish: canPublish, can_publish_data: true },
      });
      if (!res.ok) return err(req, `LiveKit UpdateParticipant ${res.status}`, 502);

      // Quitar la palabra no apaga lo que ya está publicando: hay que mutearlo.
      if (!canPublish) {
        const participants = await listParticipants();
        const target = participants.find((p) => p.identity === identity);
        if (target) await muteAudioOf(target);
      }
      return json(req, { ok: true, canPublish });
    }

    // ═══ EXPULSAR ═══
    if (action === "removeParticipant") {
      const identity = String(body.identity ?? "");
      if (!identity) return err(req, "identity required");
      const blocked = await protectTarget(identity);
      if (blocked) return err(req, blocked, 403);

      const res = await twirp(lkUrl, lkKey, lkSecret, room, "RemoveParticipant", { room, identity });
      if (!res.ok) return err(req, `LiveKit RemoveParticipant ${res.status}`, 502);
      return json(req, { ok: true });
    }

    // ═══ TERMINAR PARA TODOS ═══
    if (action === "endRoom") {
      // Solo el dueño original cierra la llamada de todos; un co-anfitrión no.
      const { data: callerIsOwner } = await admin.rpc("is_livekit_room_owner", {
        _user_id: userId, _room: room,
      });
      const { data: isMavenAdmin } = await admin.rpc("is_in_role_group", {
        _user_id: userId, _group: "admin",
      });
      // En Cowork el dueño de la sala no es una persona sino "los hosts": ahí
      // alcanza con poder moderar (ya validado arriba).
      const coworkHost = room.startsWith("cowork_");
      if (!callerIsOwner && !isMavenAdmin && !coworkHost) {
        return err(req, "Solo el anfitrión puede terminar la llamada para todos", 403);
      }

      const res = await twirp(lkUrl, lkKey, lkSecret, room, "DeleteRoom", { room });
      // Una sala de LiveKit no existe hasta que alguien entra: si la reunión está
      // vacía, DeleteRoom devuelve 404 y "terminar" tiene que funcionar igual.
      // Cualquier otro error sí es un problema.
      if (!res.ok && res.status !== 404) {
        return err(req, `LiveKit DeleteRoom ${res.status}`, 502);
      }

      // Una reunión de Meet además se marca terminada: su código deja de servir.
      if (room.startsWith("meet_")) {
        await admin.from("meet_rooms")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("livekit_room_name", room).eq("status", "active");
      }
      return json(req, { ok: true, livekitRoomExisted: res.ok });
    }

    // ═══ CO-ANFITRIONES (solo Meet, solo el creador) ═══
    if (action === "setCohost") {
      if (!room.startsWith("meet_")) return err(req, "Los co-anfitriones son de las reuniones de Meet");
      const identity = String(body.identity ?? "");
      const targetUserId = userIdFromIdentity(identity);
      if (!targetUserId) return err(req, "Un invitado sin cuenta no puede ser co-anfitrión");

      const { data: callerIsOwner } = await admin.rpc("is_livekit_room_owner", {
        _user_id: userId, _room: room,
      });
      const { data: isMavenAdmin } = await admin.rpc("is_in_role_group", {
        _user_id: userId, _group: "admin",
      });
      if (!callerIsOwner && !isMavenAdmin) {
        return err(req, "Solo el anfitrión puede dar controles de anfitrión", 403);
      }

      const { data: meetRoom } = await admin.from("meet_rooms")
        .select("id, created_by").eq("livekit_room_name", room).maybeSingle();
      if (!meetRoom) return err(req, "Reunión no encontrada", 404);
      if (meetRoom.created_by === targetUserId) return err(req, "Ya es el anfitrión");

      if (body.isCohost === true) {
        const { error: insErr } = await admin.from("meet_room_cohosts")
          .upsert({ meet_room_id: meetRoom.id, user_id: targetUserId, granted_by: userId },
                  { onConflict: "meet_room_id,user_id" });
        if (insErr) return err(req, insErr.message, 500);
      } else {
        const { error: delErr } = await admin.from("meet_room_cohosts")
          .delete().eq("meet_room_id", meetRoom.id).eq("user_id", targetUserId);
        if (delErr) return err(req, delErr.message, 500);
      }
      return json(req, { ok: true, isCohost: body.isCohost === true });
    }

    return err(req, "Unknown action: " + action);
  } catch (e) {
    console.error("livekit-moderate error:", e);
    return err(req, "Internal server error", 500);
  }
});
