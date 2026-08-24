import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

// Minimal JWT-based LiveKit token generator (no external deps)
function base64UrlEncode(data: Uint8Array): string {
  // Process in chunks to avoid stack overflow with spread operator on large arrays
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
  const key = await crypto.subtle.importKey(
    "raw",
    strToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, strToBytes(payload)));
  return base64UrlEncode(sig);
}

interface LiveKitGrants {
  roomJoin: boolean;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  roomAdmin?: boolean;
  roomRecord?: boolean;
}

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  name: string,
  grants: LiveKitGrants,
  ttlSeconds = 86400
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    name,
    video: grants,
    metadata: JSON.stringify({ name, isAdmin: !!grants.roomAdmin }),
  };

  const headerB64 = base64UrlEncode(strToBytes(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(strToBytes(JSON.stringify(payload)));
  const signature = await signHS256(`${headerB64}.${payloadB64}`, apiSecret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Get request body
    const { roomName, participantName, isAdmin = false } = await req.json();
    if (!roomName || !participantName) {
      return new Response(
        JSON.stringify({ error: "roomName and participantName required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── Server-side admin verification ────────────────────────────
    // Only grant roomAdmin if the user actually has an admin/moderator role
    let verifiedAdmin = false;
    if (isAdmin) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: userRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const adminRoles = ["admin", "moderator"];
      verifiedAdmin = (userRoles || []).some((r: any) => adminRoles.includes(r.role));

      // Also check if the user is the caller of this room (they created the call)
      if (!verifiedAdmin) {
        const { data: callData } = await adminClient
          .from("calls")
          .select("caller_id")
          .eq("room_id", roomName)
          .eq("caller_id", userId)
          .limit(1);

        verifiedAdmin = (callData && callData.length > 0);
      }

      // Meet: quien creó la reunión es su anfitrión (mutear, echar, terminar),
      // como en Google Meet. Se verifica contra la tabla, no contra lo que diga
      // el cliente en `isAdmin`.
      if (!verifiedAdmin && roomName.startsWith("meet_")) {
        const { data: meetRoom } = await adminClient
          .from("meet_rooms")
          .select("created_by")
          .eq("livekit_room_name", roomName)
          .eq("created_by", userId)
          .limit(1);

        verifiedAdmin = !!(meetRoom && meetRoom.length > 0);
      }
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL")!;
    const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

    // Use a unique identity per connection so the same user can join from
    // multiple tabs/devices without LiveKit kicking the earlier connection.
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const identity = `${userId}_${uniqueSuffix}`;

    const grants: LiveKitGrants = {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: verifiedAdmin,
    };

    const lkToken = await createLiveKitToken(
      apiKey,
      apiSecret,
      identity,
      participantName,
      grants
    );

    return new Response(
      JSON.stringify({ token: lkToken, url: livekitUrl }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("livekit-token error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
