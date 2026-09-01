import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

// ── LiveKit token helpers (reused from livekit-token) ───────────
function base64UrlEncode(data: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let b64 = "";
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    b64 += String.fromCharCode(...chunk);
  }
  b64 = btoa(b64);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function signHS256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", strToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, strToBytes(payload)));
  return base64UrlEncode(sig);
}

interface LKGrants {
  roomJoin?: boolean;
  room?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: string[];
  roomAdmin?: boolean;
  roomList?: boolean; // solo para consultar RoomService/ListRooms (ocupación), sin entrar a nada
  hidden?: boolean; // observador invisible: se suscribe pero no aparece en la lista de participantes
}

async function createLKToken(apiKey: string, apiSecret: string, identity: string, name: string, grants: LKGrants, ttl = 86400): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: apiKey, sub: identity, iat: now, nbf: now, exp: now + ttl, name, video: grants, metadata: JSON.stringify({ name, isHost: !!grants.roomAdmin }) };
  const hB64 = base64UrlEncode(strToBytes(JSON.stringify(header)));
  const pB64 = base64UrlEncode(strToBytes(JSON.stringify(payload)));
  const sig = await signHS256(`${hB64}.${pB64}`, apiSecret);
  return `${hB64}.${pB64}.${sig}`;
}

// ── Helpers ─────────────────────────────────────────────────────
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function err(req: Request, msg: string, status = 400) {
  return json(req, { error: msg }, status);
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

    // Get profile name
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).single();
    const userName = profile?.full_name || "User";

    const body = await req.json();
    const { action } = body;

    const lkUrl = Deno.env.get("LIVEKIT_URL")!;
    const lkKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

    // ═══════════════════════════════════════════════════════════════
    // CREATE COWORK SESSION
    // ═══════════════════════════════════════════════════════════════
    if (action === "createSession") {
      // Crear una sesión es una acción de COORDINACIÓN. La regla vive en la DB
      // (can_use_module_function) para que el front y esta función no se
      // desincronicen: si el rol tiene fila explícita para Cowork → "Crear
      // sesión" en el modal de permisos, esa fila manda; si no la tiene, cae al
      // nivel de acceso supervisor+. Así un admin puede habilitar a un rol de
      // nivel miembro desde Administración → Roles sin tocar código.
      // Guarda dura acá porque el front solo esconde el botón, y esta función
      // corre con service_role (bypassa RLS): sin este check cualquiera con
      // sesión válida podría llamar la acción a mano.
      const { data: canCreate, error: permErr } = await admin.rpc("can_use_module_function", {
        _user_id: userId,
        _module: "Cowork",
        _submodule: "Crear sesión",
        _fallback_group: "supervisor_or_above",
      });
      if (permErr) return err(req, permErr.message, 500);
      if (!canCreate) {
        return err(req, "Tu rol no permite crear sesiones de Cowork. Pide el enlace de la sala a tu coordinador.", 403);
      }

      const { name, description, roomNames } = body; // roomNames: string[]
      if (!name || !roomNames?.length) return err(req, "name and roomNames required");
      if (roomNames.length > 10) return err(req, "Máximo 10 salas por sesión");

      // Check active session limit per user
      const { count: activeCount } = await admin.from("cowork_sessions")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", "active");
      if (activeCount !== null && activeCount >= 10) return err(req, "Máximo 10 sesiones activas permitidas");

      const sessionId = crypto.randomUUID();
      const hostHubRoom = `cowork_hub_${sessionId.slice(0, 8)}`;

      // Create session
      const { error: sessErr } = await admin.from("cowork_sessions").insert({
        id: sessionId, name, description: description || null, host_hub_livekit_room: hostHubRoom, created_by: userId,
      });
      if (sessErr) return err(req, sessErr.message, 500);

      // Create rooms
      const rooms = roomNames.map((rn: string, i: number) => ({
        session_id: sessionId,
        name: rn,
        livekit_room_name: `cowork_${sessionId.slice(0, 8)}_${i}`,
        sort_order: i,
      }));
      const { data: createdRooms, error: roomErr } = await admin.from("cowork_rooms").insert(rooms).select();
      if (roomErr) return err(req, roomErr.message, 500);

      // Creator as host
      const { error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: "host",
      });
      if (memErr) return err(req, memErr.message, 500);

      return json(req, { sessionId, hostHubRoom, rooms: createdRooms });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN: LISTAR TODAS LAS SESIONES ACTIVAS (con ocupación en vivo)
    // ═══════════════════════════════════════════════════════════════
    if (action === "adminListSessions") {
      // La lista sale del RPC cowork_sesiones_activas_admin, llamado con el
      // cliente DEL USUARIO (no service_role: con service_role auth.uid() es
      // NULL y la guarda de rol devolvería cero filas). El RPC ya filtra por
      // rol admin — un no-admin recibe lista vacía, no un error.
      const { data: sessions, error: rpcErr } = await supabase.rpc("cowork_sesiones_activas_admin");
      if (rpcErr) return err(req, rpcErr.message, 500);
      if (!sessions?.length) return json(req, { sessions: [] });

      const ids = sessions.map((s: { id: string }) => s.id);
      const { data: rooms } = await admin.from("cowork_rooms")
        .select("id, session_id, name, livekit_room_name, sort_order")
        .in("session_id", ids)
        .order("sort_order");

      // Ocupación EN VIVO desde LiveKit: un solo ListRooms trae todas las salas
      // activas con num_participants. Es la verdad del SFU — no presencia de
      // Supabase (a esa ya la vimos tirar el socket bajo carga, #1458) ni
      // asignaciones is_active (quedan activas aunque cierres la pestaña).
      // Si LiveKit no contesta, la lista sale igual con online=null.
      const lkOnline = new Map<string, number>();
      let lkOk = false;
      try {
        const token = await createLKToken(lkKey, lkSecret, `cowork-admin-list-${userId.slice(0, 8)}`, userName, { roomList: true }, 60);
        const httpUrl = lkUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        const resp = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListRooms`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        });
        if (resp.ok) {
          const j = await resp.json();
          for (const r of (j.rooms || [])) {
            lkOnline.set(r.name, Number(r.numParticipants ?? r.num_participants ?? 0));
          }
          lkOk = true;
        }
      } catch (_e) {
        // LiveKit caído o inalcanzable: contadores en null, la lista no se cae.
      }

      const result = sessions.map((s: { id: string; [k: string]: unknown }) => {
        const sessRooms = (rooms || []).filter((r) => r.session_id === s.id);
        const roomList = sessRooms.map((r) => ({
          id: r.id,
          name: r.name,
          online: lkOk ? (lkOnline.get(r.livekit_room_name) ?? 0) : null,
        }));
        return {
          ...s,
          rooms: roomList,
          online: lkOk ? roomList.reduce((acc, r) => acc + (r.online || 0), 0) : null,
        };
      });
      return json(req, { sessions: result });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN SESSION (as participant or host)
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinSession") {
      const { sessionId, role, hostCode, roomId } = body;
      if (!sessionId) return err(req, "sessionId required");

      // Check session exists and is active
      const { data: session } = await admin.from("cowork_sessions").select("*").eq("id", sessionId).eq("status", "active").single();
      if (!session) return err(req, "Session not found or ended");

      // Determine requested role
      let memberRole = "participant";
      if (role === "host") {
        if (!hostCode || hostCode !== session.host_invite_code) {
          // Sin código válido solo pasa un ADMIN: puede entrar como host a
          // cualquier sesión (es su vía para supervisar salas ajenas desde la
          // lista global del landing, sin pedirle el código al coordinador).
          const { data: adminRole } = await admin.from("user_roles")
            .select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
          if (!adminRole) return err(req, "Código de host inválido", 403);
        }
        memberRole = "host";
      }

      // Check if already a member
      const { data: existing } = await admin.from("cowork_memberships").select("id, role").eq("session_id", sessionId).eq("user_id", userId).single();

      if (existing) {
        // Same role → return as-is
        if (existing.role === memberRole) {
          // If participant re-joins with a roomId but has no active assignment, create one
          if (memberRole === "participant" && roomId) {
            const { data: currentAssignment } = await admin.from("cowork_room_assignments")
              .select("id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).single();
            if (!currentAssignment) {
              const { data: roomCheck } = await admin.from("cowork_rooms")
                .select("id").eq("id", roomId).eq("session_id", sessionId).single();
              if (roomCheck) {
                await admin.from("cowork_room_assignments").insert({
                  session_id: sessionId, user_id: userId, room_id: roomId, assigned_by: userId,
                });
              }
            }
          }
          return json(req, { membership: existing, alreadyJoined: true });
        }

        // Different role → update membership
        const { data: updated, error: upErr } = await admin.from("cowork_memberships")
          .update({ role: memberRole })
          .eq("id", existing.id)
          .select()
          .single();
        if (upErr) return err(req, upErr.message, 500);

        if (memberRole === "host") {
          // Switching to host: remove active room assignments (hosts use Hub)
          await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true);
        } else if (memberRole === "participant" && roomId) {
          // Switching to participant: assign room
          const { data: roomCheck } = await admin.from("cowork_rooms").select("id").eq("id", roomId).eq("session_id", sessionId).single();
          if (roomCheck) {
            await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true);
            await admin.from("cowork_room_assignments").insert({
              session_id: sessionId, user_id: userId, room_id: roomId, assigned_by: userId,
            });
          }
        }

        return json(req, { membership: updated, alreadyJoined: true, roleChanged: true });
      }

      // New member
      const { data: membership, error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: memberRole,
      }).select().single();
      if (memErr) return err(req, memErr.message, 500);

      // Auto-assign participant to room if roomId provided
      if (memberRole === "participant" && roomId) {
        const { data: roomCheck } = await admin.from("cowork_rooms").select("id").eq("id", roomId).eq("session_id", sessionId).single();
        if (roomCheck) {
          await admin.from("cowork_room_assignments").insert({
            session_id: sessionId, user_id: userId, room_id: roomId, assigned_by: userId,
          });
        }
      }

      return json(req, { membership, alreadyJoined: false });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN BY ROOM CODE
    // Canjea el código corto de una sala (cowork_rooms.join_code) por
    // membresía + asignación. Es la puerta de entrada del participante cuando
    // el link largo no sobrevivió al camino (WhatsApp, PWA, copy/paste): el
    // coordinador dicta 6 caracteres y el chatter entra a LA sala que le toca.
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinByCode") {
      // Normalizamos lo que la gente realmente pega: minúsculas, espacios, guiones.
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 6) return err(req, "El código debe tener 6 caracteres");

      const { data: room } = await admin.from("cowork_rooms")
        .select("id, session_id, name").eq("join_code", code).maybeSingle();
      if (!room) return err(req, "Código inválido. Pídele el código a tu coordinador.", 404);

      const { data: session } = await admin.from("cowork_sessions")
        .select("id, name, status").eq("id", room.session_id).maybeSingle();
      if (!session || session.status !== "active") return err(req, "Esa sesión ya finalizó", 410);

      const { data: existing } = await admin.from("cowork_memberships")
        .select("id, role").eq("session_id", room.session_id).eq("user_id", userId).maybeSingle();

      if (!existing) {
        const { error: memErr } = await admin.from("cowork_memberships").insert({
          session_id: room.session_id, user_id: userId, role: "participant",
        });
        if (memErr) return err(req, memErr.message, 500);
      }

      // Un host que canjea un código NO se degrada a participante: los hosts
      // viven en el Hub y entran a las salas desde el dashboard.
      const isHost = existing?.role === "host";
      if (!isHost) {
        // El índice único parcial de asignaciones activas exige desactivar la
        // anterior antes de insertar la nueva.
        await admin.from("cowork_room_assignments").update({ is_active: false })
          .eq("session_id", room.session_id).eq("user_id", userId).eq("is_active", true);
        const { error: asgErr } = await admin.from("cowork_room_assignments").insert({
          session_id: room.session_id, user_id: userId, room_id: room.id, assigned_by: userId,
        });
        if (asgErr) return err(req, asgErr.message, 500);
      }

      return json(req, {
        sessionId: room.session_id, sessionName: session.name,
        roomId: room.id, roomName: room.name, isHost,
      });
    }

    // (assignToRoom removed — participants self-join via URL ?room=X or a room code)

    // ═══════════════════════════════════════════════════════════════
    // LEAVE ROOM (deactivate caller's active assignment)
    // ═══════════════════════════════════════════════════════════════
    if (action === "leaveRoom") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      // Idempotent: just deactivate any active assignment for this user in this session.
      // No-op if there isn't one.
      await admin.from("cowork_room_assignments")
        .update({ is_active: false })
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .eq("is_active", true);

      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // ISSUE LIVEKIT TOKEN
    // ═══════════════════════════════════════════════════════════════
    if (action === "issueLiveKitToken") {
      const { sessionId, purpose, roomId } = body;
      // purpose: "join_room" | "join_host_hub"
      if (!sessionId || !purpose) return err(req, "sessionId and purpose required");

      const { data: membership } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (!membership) return err(req, "Not a member of this session", 403);

      const isHost = membership.role === "host";

      if (purpose === "join_host_hub") {
        if (!isHost) return err(req, "Only hosts can join host hub", 403);
        const { data: session } = await admin.from("cowork_sessions").select("host_hub_livekit_room").eq("id", sessionId).single();
        if (!session) return err(req, "Session not found");

        const identity = userId;
        const token = await createLKToken(lkKey, lkSecret, identity, userName, {
          roomJoin: true, room: session.host_hub_livekit_room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: true,
        });
        return json(req, { token, url: lkUrl, room: session.host_hub_livekit_room });
      }

      if (purpose === "join_room") {
        let targetRoomId = roomId;

        if (!isHost) {
          // Participant: can only join their assigned room
          const { data: assignment } = await admin.from("cowork_room_assignments").select("room_id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).single();
          if (!assignment) return err(req, "No room assignment found");
          targetRoomId = assignment.room_id;
        }

        if (!targetRoomId) return err(req, "roomId required for hosts joining a room");

        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", targetRoomId).single();
        if (!room) return err(req, "Room not found");

        // TODOS los miembros de la sala pueden compartir pantalla directo (pedido del
        // owner 2026-07-20). Antes el token de participante excluía screen_share
        // (canPublishSources: camera+mic) y forzaba el flujo pedir-permiso→aprobar→
        // token especial — el botón "no hacía nada" para no-supervisores.
        const identity = userId;
        const grants: LKGrants = {
          roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: isHost,
        };

        const token = await createLKToken(lkKey, lkSecret, identity, userName, grants);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name, roomId: targetRoomId });
      }

      // PREVIEW: el host se suscribe a una sala en modo SOLO-LECTURA para ver el video en
      // vivo en la miniatura del dashboard, SIN publicar (canPublish:false) y como observador
      // OCULTO (hidden:true → no aparece en la lista de participantes de la sala). Identity
      // distinta (`${userId}__preview`) para no colisionar si el host también "Entra" a la sala.
      if (purpose === "preview_room") {
        if (!isHost) return err(req, "Only hosts can preview rooms", 403);
        if (!roomId) return err(req, "roomId required");
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", roomId).single();
        if (!room) return err(req, "Room not found");
        const token = await createLKToken(lkKey, lkSecret, `${userId}__preview`, userName, {
          roomJoin: true, room: room.livekit_room_name, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true,
        }, 3600);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name });
      }

      // MONITOR: el host, desde el dashboard, se conecta al audio de una sala para ESCUCHARLA
      // y, cuando quiere, HABLARLE (publica su micro). A diferencia de preview_room, NO es
      // hidden (para que los participantes lo escuchen/vean como "📢 Coordinador") y solo puede
      // publicar micrófono (nunca cámara/pantalla). Identity distinta para no colisionar con
      // "Entrar" a la sala (que usa userId).
      if (purpose === "monitor_room") {
        if (!isHost) return err(req, "Only hosts can monitor rooms", 403);
        if (!roomId) return err(req, "roomId required");
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", roomId).single();
        if (!room) return err(req, "Room not found");
        // La identidad lleva el id de la PESTAÑA, no solo el del usuario.
        //
        // Con `${userId}__monitor` a secas, la misma persona con el tablero
        // abierto dos veces (otra pestaña, la app instalada además del
        // navegador, otra máquina) generaba DOS monitores con la misma
        // identidad en cada sala, y LiveKit expulsa al que estaba. El expulsado
        // no vuelve a publicar su micro nunca —el efecto que lo publica está
        // guardado por `status !== "ready"`— mientras el botón sigue verde.
        //
        // Se sanea porque viene del cliente: solo minúsculas y dígitos, corto.
        // Nunca se interpola algo de afuera en una identidad sin acotarlo.
        const tabRaw = typeof body.clientId === "string" ? body.clientId : "";
        const tab = tabRaw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
        const monitorIdentity = tab ? `${userId}__monitor__${tab}` : `${userId}__monitor`;
        const token = await createLKToken(lkKey, lkSecret, monitorIdentity, `📢 ${userName}`, {
          roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ["microphone"],
        }, 3600);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name });
      }

      return err(req, "Invalid purpose");
    }

    // (moveParticipant removed — participants self-join via URL ?room=X)

    // ═══════════════════════════════════════════════════════════════
    // REQUEST HOST
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestHost") {
      const { sessionId, roomId, message, requestOneOnOne } = body;
      if (!sessionId || !roomId) return err(req, "sessionId and roomId required");

      // Check for existing open/acknowledged request from this user
      const { data: existingReq } = await admin.from("cowork_host_requests")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .in("status", ["open", "acknowledged"])
        .maybeSingle();

      if (existingReq) {
        // Allow upgrading a simple request to a 1:1 call
        if (requestOneOnOne && !existingReq.oneone_livekit_room) {
          // Resolve the old simple request
          await admin.from("cowork_host_requests")
            .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: userId })
            .eq("id", existingReq.id);
          // Fall through to create a new 1:1 request below
        } else {
          return json(req, { request: existingReq, oneone_livekit_room: existingReq.oneone_livekit_room });
        }
      }

      const requestId = crypto.randomUUID();
      const oneoneRoom = requestOneOnOne ? `cowork_1on1_${sessionId.slice(0, 8)}_${requestId.slice(0, 8)}` : null;

      const { data: newHostReq, error: reqErr } = await admin.from("cowork_host_requests").insert({
        id: requestId, session_id: sessionId, room_id: roomId, user_id: userId, message: message || null, oneone_livekit_room: oneoneRoom,
      }).select().single();
      if (reqErr) return err(req, reqErr.message, 500);

      return json(req, { request: newHostReq, oneone_livekit_room: oneoneRoom });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN 1:1 ROOM (for host requests)
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinOneOnOne") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      const { data: hostReq } = await admin.from("cowork_host_requests").select("*").eq("id", requestId).single();
      if (!hostReq) return err(req, "Request not found");
      if (!hostReq.oneone_livekit_room) return err(req, "No 1:1 room for this request");

      // Validate: caller must be the requester or a host of the session
      const isRequester = hostReq.user_id === userId;
      const { data: membership } = await admin.from("cowork_memberships").select("role").eq("session_id", hostReq.session_id).eq("user_id", userId).single();
      if (!membership) return err(req, "Not a member", 403);
      const callerIsHost = membership.role === "host";

      if (!isRequester && !callerIsHost) return err(req, "Not authorized to join this 1:1 room", 403);

      const identity = userId;
      const token = await createLKToken(lkKey, lkSecret, identity, userName, {
        roomJoin: true, room: hostReq.oneone_livekit_room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: callerIsHost,
      }, 3600);

      return json(req, { token, url: lkUrl, room: hostReq.oneone_livekit_room });
    }

    // ═══════════════════════════════════════════════════════════════
    // ACK / RESOLVE HOST REQUEST
    // ═══════════════════════════════════════════════════════════════
    if (action === "ackHostRequest" || action === "resolveHostRequest") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      // Get request to verify session + ownership
      const { data: hostReq } = await admin.from("cowork_host_requests").select("session_id, user_id").eq("id", requestId).single();
      if (!hostReq) return err(req, "Request not found");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", hostReq.session_id).eq("user_id", userId).single();
      const isHostMember = hostCheck?.role === "host";
      const isRequester = hostReq.user_id === userId;
      // Ack: solo host. Resolve: host O el que hizo la solicitud (para cerrar su propia 1:1).
      if (action === "ackHostRequest" && !isHostMember) return err(req, "Only hosts", 403);
      if (action === "resolveHostRequest" && !isHostMember && !isRequester) return err(req, "Not authorized", 403);

      if (action === "ackHostRequest") {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "acknowledged", acked_by: userId, acked_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(req, upErr.message, 500);
      } else {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "resolved", resolved_by: userId, resolved_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(req, upErr.message, 500);
      }

      return json(req, { success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // REQUEST SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestScreenShare") {
      const { sessionId, roomId } = body;
      if (!sessionId || !roomId) return err(req, "sessionId and roomId required");

      // Check not already pending
      const { data: existing } = await admin.from("cowork_screenshare_requests").select("id").eq("session_id", sessionId).eq("user_id", userId).eq("status", "pending");
      if (existing && existing.length > 0) return err(req, "Already have a pending request");

      const { data: ssReq, error: ssErr } = await admin.from("cowork_screenshare_requests").insert({
        session_id: sessionId, room_id: roomId, user_id: userId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10min
      }).select().single();
      if (ssErr) return err(req, ssErr.message, 500);

      return json(req, { request: ssReq });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE / DENY SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "approveScreenShare") {
      const { requestId, approve } = body;
      if (!requestId || approve === undefined) return err(req, "requestId and approve required");

      const { data: ssReq } = await admin.from("cowork_screenshare_requests").select("*").eq("id", requestId).single();
      if (!ssReq) return err(req, "Request not found");

      // Verify host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", ssReq.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const newStatus = approve ? "approved" : "denied";
      await admin.from("cowork_screenshare_requests").update({
        status: newStatus, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", requestId);

      // If approved, issue a new token with screen share permission
      if (approve) {
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", ssReq.room_id).single();
        const { data: requesterProfile } = await admin.from("profiles").select("full_name").eq("id", ssReq.user_id).single();
        if (room) {
          const identity = ssReq.user_id;
          const token = await createLKToken(lkKey, lkSecret, identity, requesterProfile?.full_name || "User", {
            roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true,
          }, 600); // 10 min token
          return json(req, { success: true, status: newStatus, screenshareToken: token, url: lkUrl, room: room.livekit_room_name });
        }
      }

      return json(req, { success: true, status: newStatus });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLAIM SCREEN SHARE TOKEN (participant claims after approval)
    // ═══════════════════════════════════════════════════════════════
    if (action === "claimScreenShareToken") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      const { data: ssReq } = await admin.from("cowork_screenshare_requests").select("*").eq("id", requestId).single();
      if (!ssReq) return err(req, "Request not found");
      if (ssReq.user_id !== userId) return err(req, "Not your request", 403);
      if (ssReq.status !== "approved") return err(req, "Request is not approved");

      // Marcar como usada para sacarla de la lista activa (fetchData solo trae pending/approved).
      // OJO: el CHECK de la tabla NO permite 'claimed' (solo pending/approved/denied/expired) →
      // usar 'claimed' fallaba en silencio y la request quedaba 'approved' para siempre,
      // re-disparando el reclamo en cada montaje. Usamos 'expired'.
      const { error: claimErr } = await admin.from("cowork_screenshare_requests").update({ status: "expired" }).eq("id", requestId);
      if (claimErr) console.error("claimScreenShareToken status update:", claimErr.message);

      // Issue token with full publish permissions (including screen share)
      const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", ssReq.room_id).single();
      if (!room) return err(req, "Room not found");

      const identity = userId;
      const token = await createLKToken(lkKey, lkSecret, identity, userName, {
        roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true,
      }, 600); // 10 min token

      return json(req, { token, url: lkUrl, room: room.livekit_room_name });
    }

    // ═══════════════════════════════════════════════════════════════
    // END SESSION
    // ═══════════════════════════════════════════════════════════════
    if (action === "endSession") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      await admin.from("cowork_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
      return json(req, { success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // GET HOST CODE (only for existing hosts)
    // ═══════════════════════════════════════════════════════════════
    if (action === "getHostCode") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts can get the invite code", 403);

      const { data: session } = await admin.from("cowork_sessions").select("host_invite_code").eq("id", sessionId).single();
      if (!session) return err(req, "Session not found");

      return json(req, { hostCode: session.host_invite_code });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD ROOM (host añade una sala a una sesión existente)
    // ═══════════════════════════════════════════════════════════════
    if (action === "addRoom") {
      const { sessionId, name } = body;
      if (!sessionId || !name?.trim()) return err(req, "sessionId and name required");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { count } = await admin.from("cowork_rooms").select("*", { count: "exact", head: true }).eq("session_id", sessionId);
      if (count !== null && count >= 10) return err(req, "Máximo 10 salas por sesión");

      const { data: last } = await admin.from("cowork_rooms").select("sort_order").eq("session_id", sessionId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const nextOrder = (last?.sort_order ?? -1) + 1;
      // LiveKit room name único (sufijo aleatorio, no índice: las salas se pueden borrar).
      const lkName = `cowork_${sessionId.slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`;

      const { data: room, error: rErr } = await admin.from("cowork_rooms").insert({
        session_id: sessionId, name: String(name).trim().slice(0, 80), livekit_room_name: lkName, sort_order: nextOrder,
      }).select().single();
      if (rErr) return err(req, rErr.message, 500);
      return json(req, { room });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE SESSION (renombrar la sesión) — host only
    // El nombre se elegía al crear y no se podía tocar; con sesiones que duran
    // semanas ("Chatters mañana") eso obligaba a cerrar y rehacer todo.
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // PAUSAS (baño / break)
    //
    // Los tiempos los pone el SERVIDOR con now(). Antes la pausa solo vivia en
    // el navegador de quien la tomaba: el reloj arrancaba con un Date.now()
    // suyo y nada quedaba guardado. Medir a alguien con el cronometro que el
    // mismo maneja no mide nada, y sin registro no hay historial que revisar.
    // ═══════════════════════════════════════════════════════════════
    if (action === "startBreak") {
      const kind = body.kind === "break" ? "break" : "bano";
      const { data: asignacion } = await admin.from("cowork_room_assignments")
        .select("session_id, room_id").eq("user_id", userId).eq("is_active", true)
        .order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      if (!asignacion?.session_id) return err(req, "No estás en una sala");

      // Si ya habia una abierta, se cierra antes: el indice unico solo permite
      // una por persona, y quedarse trabado sin poder volver seria peor.
      await admin.from("cowork_breaks")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", userId).is("ended_at", null);

      const { data: pausa, error: insErr } = await admin.from("cowork_breaks")
        .insert({
          session_id: asignacion.session_id, room_id: asignacion.room_id,
          user_id: userId, kind,
        })
        .select("id, kind, started_at").single();
      if (insErr) return err(req, insErr.message, 500);

      const { data: limite } = await admin.from("cowork_break_limits")
        .select("minutos, label").eq("kind", kind).maybeSingle();
      return json(req, { break: pausa, limiteMinutos: limite?.minutos ?? null, label: limite?.label ?? kind });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAUSA ABIERTA — para rehidratar al recargar la pestaña
    // ═══════════════════════════════════════════════════════════════
    //
    // El navegador guardaba el arranque de la pausa SOLO en memoria. Si la
    // pestaña se recargaba —el banner de actualización, el service worker, un
    // F5— Maven se olvidaba de que la persona estaba en pausa, aunque la fila
    // siguiera abierta en la base. Consecuencias, las dos malas:
    //
    //   · el botón volvía a decir "Baño", así que al volver se abría una
    //     pausa NUEVA en vez de cerrar la anterior, y la primera quedaba
    //     colgada para siempre (nada cierra las pausas abiertas);
    //   · el contador arrancaba de cero, así que el aviso de "se te acabó el
    //     break" no saltaba nunca.
    if (action === "pausaAbierta") {
      const { data: pausa } = await admin.from("cowork_breaks")
        .select("id, kind, started_at")
        .eq("user_id", userId).is("ended_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!pausa) return json(req, { pausa: null });

      const { data: limite } = await admin.from("cowork_break_limits")
        .select("minutos, label").eq("kind", pausa.kind).maybeSingle();
      return json(req, { pausa, limiteMinutos: limite?.minutos ?? null, label: limite?.label ?? pausa.kind });
    }

    if (action === "endBreak") {
      const { data: cerrada, error: upErr } = await admin.from("cowork_breaks")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", userId).is("ended_at", null)
        .select("id, kind, started_at, ended_at, duration_seconds").maybeSingle();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { break: cerrada });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTRAR LLAMADO DE ATENCIÓN (cámara / encuadre / luz / pantalla)
    // ═══════════════════════════════════════════════════════════════
    //
    // Lo llama el navegador de la propia persona cuando un problema ya lleva el
    // tiempo suficiente como para que se le avise al supervisor. Hasta ahora
    // esos avisos se decían por voz, aparecían en la pantalla del supervisor y
    // se perdían: al cerrar la pestaña no quedaba nada.
    //
    // ⚠️ Por ahora esto SOLO registra. No afecta ninguna nota.
    //
    // ── POR QUÉ ACÁ NO SE LE CREE NADA AL CLIENTE ───────────────────────────
    //
    // Esto va a terminar afectando la nota de la gente, así que el defecto que
    // importa no es perder un llamado: es INVENTAR uno. Una acusación falsa le
    // baja un número a alguien que hizo todo bien. Por eso:
    //
    //   · el user_id sale del token y la sala de la asignación real — el cuerpo
    //     no puede anotarle un llamado a otra persona;
    //   · el cliente manda CUÁNTO DURÓ, no CUÁNDO EMPEZÓ, y el inicio lo resta
    //     el servidor. Con una fecha absoluta, un reloj desviado la corría en
    //     cada llamada y cada reintento creaba una fila nueva en vez de estirar
    //     la misma. Una duración es un delta: no le importa en qué hora cree
    //     vivir la máquina de la persona;
    //   · si el rato reclamado se solapa con una pausa registrada, se descarta.
    //     Esta es la garantía importante y por eso vive acá y no en el
    //     navegador: la bandera de pausa del cliente es un booleano en memoria
    //     que NO sobrevive a recargar la pestaña, mientras que la escritura sí
    //     es durable. Alguien que marcó "Break", se fue, y cuya pestaña se
    //     recargó sola, se llevaba un llamado de media hora por estar ausente
    //     justo después de haber avisado que se ausentaba.
    //
    // Se llama repetido a propósito para ir estirando `seconds` mientras el
    // problema sigue. El índice único (user_id, kind, started_at) convierte eso
    // en una actualización en vez de N filas, y un trigger impide que una
    // llamada demorada acorte el llamado.
    if (action === "registrarLlamado") {
      const KINDS = ["camara", "encuadre", "luz", "pantalla"];
      const kind = String(body.kind ?? "");
      if (!KINDS.includes(kind)) return err(req, "kind inválido");

      const { data: asignacion } = await admin.from("cowork_room_assignments")
        .select("session_id, room_id").eq("user_id", userId).eq("is_active", true)
        .order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      // Sin sala activa no hay nada que anotar: esta persona no está en Cowork.
      // No es un error — la llamada puede seguir viva un instante después de
      // que la sacaron de la sala.
      if (!asignacion?.session_id) return json(req, { skipped: "sin sala" });

      const ahora = Date.now();
      const TURNO_MS = 12 * 60 * 60 * 1000;
      const segundos = Math.max(0, Math.min(
        Math.floor(Number(body.seconds) || 0),
        Math.floor(TURNO_MS / 1000),
      ));

      const inicio = new Date(ahora - segundos * 1000);

      // Qué episodio es. Lo sortea el cliente al arrancar su reloj y lo repite
      // mientras el problema siga.
      //
      // Antes esto se resolvía redondeando el inicio al minuto y usándolo como
      // identidad. No alcanzaba: el cliente trunca los segundos a entero, así
      // que la resta se mueve casi un segundo entre llamadas y de vez en cuando
      // cruza el borde del minuto. Una simulación de 20.000 episodios dio 1-2%
      // partidos en dos filas, y las dos siguen creciendo — o sea que sumar
      // duraciones contaba el episodio dos veces.
      //
      // El nonce no le da poder al cliente sobre nada ajeno: la identidad real
      // es (user_id del token, kind, nonce). Lo peor que puede hacer un cliente
      // roto es abrir filas de más para sí mismo.
      const nonce = String(body.nonce ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)
        // Sin nonce se cae al comportamiento viejo (el minuto redondeado), para
        // que un navegador con el bundle anterior en caché siga registrando.
        || `t${Math.round(inicio.getTime() / 60_000) * 60_000}`;

      // ¿El rato reclamado pisa una pausa? Se mira contra `cowork_breaks`, que
      // es la única fuente que sobrevive a que la persona recargue la pestaña.
      //
      // Se acota a las últimas 12 h porque una pausa que alguien dejó abierta y
      // nunca cerró no debería silenciar los llamados de esa persona para
      // siempre.
      // Una pausa ABIERTA solo cuenta si empezó hace poco. Nada cierra las
      // pausas colgadas —no hay cron, y `endBreak` necesita que la persona
      // apriete "volver"—, así que alguien a quien se le cerró la pestaña
      // durante un break deja una fila abierta para siempre. Sin este límite,
      // esa persona dejaba de registrar llamados por el resto del turno sin que
      // nadie se enterara. Ninguna pausa legítima dura tres horas.
      const PAUSA_ABIERTA_MAX_MS = 3 * 60 * 60 * 1000;
      const { data: pausa, error: pausaErr } = await admin.from("cowork_breaks")
        .select("id")
        .eq("user_id", userId)
        .gt("started_at", new Date(ahora - TURNO_MS).toISOString())
        .lt("started_at", new Date(ahora).toISOString())
        .or(
          `and(ended_at.is.null,started_at.gt.${new Date(ahora - PAUSA_ABIERTA_MAX_MS).toISOString()}),` +
          `ended_at.gt.${inicio.toISOString()}`,
        )
        .limit(1).maybeSingle();
      // Si NO se pudo comprobar, no se escribe. La regla de toda esta acción es
      // que ante la duda se pierde el llamado, y "la consulta falló" es duda:
      // dejarlo pasar convertiría una caída de la base en una tanda de
      // acusaciones falsas contra gente que estaba en su break.
      if (pausaErr) return json(req, { skipped: "no se pudo verificar la pausa" });
      // Se descarta ENTERO, aunque parte del rato caiga fuera de la pausa.
      if (pausa) return json(req, { skipped: "en pausa" });

      const { data: llamado, error: insErr } = await admin.from("cowork_llamados")
        .upsert({
          session_id: asignacion.session_id,
          room_id: asignacion.room_id,
          user_id: userId,
          kind,
          detail: body.detail ? String(body.detail).slice(0, 40) : null,
          nonce,
          started_at: inicio.toISOString(),
          seconds: segundos,
        }, { onConflict: "user_id,kind,nonce" })
        .select("id, kind, started_at, seconds").single();
      if (insErr) return err(req, insErr.message, 500);
      return json(req, { llamado });
    }

    if (action === "updateSession") {
      const { sessionId, name } = body;
      if (!sessionId) return err(req, "sessionId required");
      const clean = String(name ?? "").trim();
      if (!clean) return err(req, "Escribe un nombre para la sesión");

      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { data: updated, error: upErr } = await admin.from("cowork_sessions")
        .update({ name: clean.slice(0, 80), updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .select("id, name")
        .single();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE ROOM (renombrar y/o cambiar preview_mode) — host only
    // ═══════════════════════════════════════════════════════════════
    if (action === "updateRoom") {
      const { roomId, name, previewMode } = body;
      if (!roomId) return err(req, "roomId required");
      const { data: room } = await admin.from("cowork_rooms").select("session_id").eq("id", roomId).single();
      if (!room) return err(req, "Room not found");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", room.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const patch: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) patch.name = name.trim().slice(0, 80);
      if (previewMode === "video" || previewMode === "avatars") patch.preview_mode = previewMode;
      if (!Object.keys(patch).length) return err(req, "Nothing to update");

      const { data: updated, error: uErr } = await admin.from("cowork_rooms").update(patch).eq("id", roomId).select().single();
      if (uErr) return err(req, uErr.message, 500);
      return json(req, { room: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE ROOM (borra la sala + desasigna a sus participantes) — host only
    // ═══════════════════════════════════════════════════════════════
    if (action === "closeRoom") {
      const { roomId } = body;
      if (!roomId) return err(req, "roomId required");
      const { data: room } = await admin.from("cowork_rooms").select("session_id").eq("id", roomId).single();
      if (!room) return err(req, "Room not found");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", room.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { count } = await admin.from("cowork_rooms").select("*", { count: "exact", head: true }).eq("session_id", room.session_id);
      if (count !== null && count <= 1) return err(req, "No puedes cerrar la última sala de la sesión");

      // Sacar a los participantes asignados (su asignación queda inactiva) y borrar la sala.
      await admin.from("cowork_room_assignments").update({ is_active: false }).eq("room_id", roomId).eq("is_active", true);
      const { error: dErr } = await admin.from("cowork_rooms").delete().eq("id", roomId);
      if (dErr) return err(req, dErr.message, 500);
      return json(req, { ok: true });
    }

    return err(req, "Unknown action: " + action);
  } catch (e) {
    console.error("cowork-session error:", e);
    return err(req, "Internal server error", 500);
  }
});
