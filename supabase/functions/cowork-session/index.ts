import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  roomJoin: boolean;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canPublishSources?: string[];
  roomAdmin?: boolean;
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
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return err("Unauthorized", 401);
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
      const { name, description, roomNames } = body; // roomNames: string[]
      if (!name || !roomNames?.length) return err("name and roomNames required");

      const sessionId = crypto.randomUUID();
      const hostHubRoom = `cowork_hub_${sessionId.slice(0, 8)}`;

      // Create session
      const { error: sessErr } = await admin.from("cowork_sessions").insert({
        id: sessionId, name, description: description || null, host_hub_livekit_room: hostHubRoom, created_by: userId,
      });
      if (sessErr) return err(sessErr.message, 500);

      // Create rooms
      const rooms = roomNames.map((rn: string, i: number) => ({
        session_id: sessionId,
        name: rn,
        livekit_room_name: `cowork_${sessionId.slice(0, 8)}_${i}`,
        sort_order: i,
      }));
      const { data: createdRooms, error: roomErr } = await admin.from("cowork_rooms").insert(rooms).select();
      if (roomErr) return err(roomErr.message, 500);

      // Creator as host
      const { error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: "host",
      });
      if (memErr) return err(memErr.message, 500);

      return json({ sessionId, hostHubRoom, rooms: createdRooms });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN SESSION (as participant or host)
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinSession") {
      const { sessionId, role, hostCode, roomId } = body;
      if (!sessionId) return err("sessionId required");

      // Check session exists and is active
      const { data: session } = await admin.from("cowork_sessions").select("*").eq("id", sessionId).eq("status", "active").single();
      if (!session) return err("Session not found or ended");

      // Check if already a member
      const { data: existing } = await admin.from("cowork_memberships").select("id, role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (existing) return json({ membership: existing, alreadyJoined: true });

      // Enforce host invite code for host joins
      let memberRole = "participant";
      if (role === "host") {
        if (!hostCode || hostCode !== session.host_invite_code) {
          return err("Código de host inválido", 403);
        }
        memberRole = "host";
      }

      const { data: membership, error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: memberRole,
      }).select().single();
      if (memErr) return err(memErr.message, 500);

      // Auto-assign participant to room if roomId provided
      if (memberRole === "participant" && roomId) {
        // Verify room belongs to this session
        const { data: roomCheck } = await admin.from("cowork_rooms").select("id").eq("id", roomId).eq("session_id", sessionId).single();
        if (roomCheck) {
          await admin.from("cowork_room_assignments").insert({
            session_id: sessionId, user_id: userId, room_id: roomId, assigned_by: userId,
          });
        }
      }

      return json({ membership, alreadyJoined: false });
    }

    // ═══════════════════════════════════════════════════════════════
    // ASSIGN PARTICIPANT TO ROOM
    // ═══════════════════════════════════════════════════════════════
    if (action === "assignToRoom") {
      const { sessionId, targetUserId, roomId } = body;
      if (!sessionId || !targetUserId || !roomId) return err("sessionId, targetUserId, roomId required");

      // Verify caller is host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts can assign rooms", 403);

      // Deactivate current assignment
      await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", targetUserId).eq("is_active", true);

      // Create new assignment
      const { data: assignment, error: assErr } = await admin.from("cowork_room_assignments").insert({
        session_id: sessionId, user_id: targetUserId, room_id: roomId, assigned_by: userId,
      }).select().single();
      if (assErr) return err(assErr.message, 500);

      return json({ assignment });
    }

    // ═══════════════════════════════════════════════════════════════
    // ISSUE LIVEKIT TOKEN
    // ═══════════════════════════════════════════════════════════════
    if (action === "issueLiveKitToken") {
      const { sessionId, purpose, roomId } = body;
      // purpose: "join_room" | "join_host_hub"
      if (!sessionId || !purpose) return err("sessionId and purpose required");

      const { data: membership } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (!membership) return err("Not a member of this session", 403);

      const isHost = membership.role === "host";

      if (purpose === "join_host_hub") {
        if (!isHost) return err("Only hosts can join host hub", 403);
        const { data: session } = await admin.from("cowork_sessions").select("host_hub_livekit_room").eq("id", sessionId).single();
        if (!session) return err("Session not found");

        const identity = `${userId}_${crypto.randomUUID().slice(0, 8)}`;
        const token = await createLKToken(lkKey, lkSecret, identity, userName, {
          roomJoin: true, room: session.host_hub_livekit_room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: true,
        });
        return json({ token, url: lkUrl, room: session.host_hub_livekit_room });
      }

      if (purpose === "join_room") {
        let targetRoomId = roomId;

        if (!isHost) {
          // Participant: can only join their assigned room
          const { data: assignment } = await admin.from("cowork_room_assignments").select("room_id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).single();
          if (!assignment) return err("No room assignment found");
          targetRoomId = assignment.room_id;
        }

        if (!targetRoomId) return err("roomId required for hosts joining a room");

        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", targetRoomId).single();
        if (!room) return err("Room not found");

        // Participants: no screen share by default
        const canPublishSources = isHost ? undefined : ["camera", "microphone"];

        const identity = `${userId}_${crypto.randomUUID().slice(0, 8)}`;
        const grants: LKGrants = {
          roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: isHost,
        };
        if (canPublishSources) (grants as any).canPublishSources = canPublishSources;

        const token = await createLKToken(lkKey, lkSecret, identity, userName, grants);
        return json({ token, url: lkUrl, room: room.livekit_room_name, roomId: targetRoomId });
      }

      return err("Invalid purpose");
    }

    // ═══════════════════════════════════════════════════════════════
    // MOVE PARTICIPANT
    // ═══════════════════════════════════════════════════════════════
    if (action === "moveParticipant") {
      const { sessionId, targetUserId, targetRoomId } = body;
      if (!sessionId || !targetUserId || !targetRoomId) return err("sessionId, targetUserId, targetRoomId required");

      // Verify host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts can move participants", 403);

      // Deactivate old
      await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", targetUserId).eq("is_active", true);

      // Create new
      const { data: assignment, error: assErr } = await admin.from("cowork_room_assignments").insert({
        session_id: sessionId, user_id: targetUserId, room_id: targetRoomId, assigned_by: userId,
      }).select().single();
      if (assErr) return err(assErr.message, 500);

      return json({ assignment, moved: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // REQUEST HOST
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestHost") {
      const { sessionId, roomId, message } = body;
      if (!sessionId || !roomId) return err("sessionId and roomId required");

      const { data: req, error: reqErr } = await admin.from("cowork_host_requests").insert({
        session_id: sessionId, room_id: roomId, user_id: userId, message: message || null,
      }).select().single();
      if (reqErr) return err(reqErr.message, 500);

      return json({ request: req });
    }

    // ═══════════════════════════════════════════════════════════════
    // ACK / RESOLVE HOST REQUEST
    // ═══════════════════════════════════════════════════════════════
    if (action === "ackHostRequest" || action === "resolveHostRequest") {
      const { requestId } = body;
      if (!requestId) return err("requestId required");

      // Get request to verify session
      const { data: hostReq } = await admin.from("cowork_host_requests").select("session_id").eq("id", requestId).single();
      if (!hostReq) return err("Request not found");

      // Verify host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", hostReq.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts", 403);

      if (action === "ackHostRequest") {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "acknowledged", acked_by: userId, acked_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(upErr.message, 500);
      } else {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "resolved", resolved_by: userId, resolved_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(upErr.message, 500);
      }

      return json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // REQUEST SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestScreenShare") {
      const { sessionId, roomId } = body;
      if (!sessionId || !roomId) return err("sessionId and roomId required");

      // Check not already pending
      const { data: existing } = await admin.from("cowork_screenshare_requests").select("id").eq("session_id", sessionId).eq("user_id", userId).eq("status", "pending");
      if (existing && existing.length > 0) return err("Already have a pending request");

      const { data: ssReq, error: ssErr } = await admin.from("cowork_screenshare_requests").insert({
        session_id: sessionId, room_id: roomId, user_id: userId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10min
      }).select().single();
      if (ssErr) return err(ssErr.message, 500);

      return json({ request: ssReq });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE / DENY SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "approveScreenShare") {
      const { requestId, approve } = body;
      if (!requestId || approve === undefined) return err("requestId and approve required");

      const { data: ssReq } = await admin.from("cowork_screenshare_requests").select("*").eq("id", requestId).single();
      if (!ssReq) return err("Request not found");

      // Verify host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", ssReq.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts", 403);

      const newStatus = approve ? "approved" : "denied";
      await admin.from("cowork_screenshare_requests").update({
        status: newStatus, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", requestId);

      // If approved, issue a new token with screen share permission
      if (approve) {
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", ssReq.room_id).single();
        const { data: requesterProfile } = await admin.from("profiles").select("full_name").eq("id", ssReq.user_id).single();
        if (room) {
          const identity = `${ssReq.user_id}_${crypto.randomUUID().slice(0, 8)}`;
          const token = await createLKToken(lkKey, lkSecret, identity, requesterProfile?.full_name || "User", {
            roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true,
          }, 600); // 10 min token
          return json({ success: true, status: newStatus, screenshareToken: token, url: lkUrl, room: room.livekit_room_name });
        }
      }

      return json({ success: true, status: newStatus });
    }

    // ═══════════════════════════════════════════════════════════════
    // END SESSION
    // ═══════════════════════════════════════════════════════════════
    if (action === "endSession") {
      const { sessionId } = body;
      if (!sessionId) return err("sessionId required");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts", 403);

      await admin.from("cowork_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
      return json({ success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // GET HOST CODE (only for existing hosts)
    // ═══════════════════════════════════════════════════════════════
    if (action === "getHostCode") {
      const { sessionId } = body;
      if (!sessionId) return err("sessionId required");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err("Only hosts can get the invite code", 403);

      const { data: session } = await admin.from("cowork_sessions").select("host_invite_code").eq("id", sessionId).single();
      if (!session) return err("Session not found");

      return json({ hostCode: session.host_invite_code });
    }

    return err("Unknown action: " + action);
  } catch (e) {
    console.error("cowork-session error:", e);
    return err("Internal server error", 500);
  }
});
