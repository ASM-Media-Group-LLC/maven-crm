// Public-facing chatter API. Anyone with a session URL hits this — no Maven
// auth required. The function uses the service role internally so it can
// validate state and write messages, but only exposes a tightly-scoped
// surface to the caller.
//
// Actions (selected via JSON body { action: "..." }):
//
//   - "send"           : insert a message as role='chatter' for the session
//   - "claim-device"   : record/refresh active_device_id (single-device lock)
//   - "set-typing"     : update typing_chatter + timestamp
//   - "mark-read"      : update read_by_chatter_at
//
// All actions require sessionId and reject ended sessions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action: "send" | "claim-device" | "set-typing" | "mark-read";
  sessionId: string;
  // send
  content?: string;
  images?: string[];
  price?: number;                        // when set, msg_type defaults to "purchase"
  msgType?: "message" | "purchase";      // explicit override
  // claim-device
  deviceId?: string;
  // set-typing
  typing?: boolean;
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method not allowed" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid JSON" });
  }
  if (!body.sessionId) return json(400, { ok: false, error: "sessionId required" });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Validate session is open
  const { data: session, error: sErr } = await supa
    .from("chatter_sessions")
    .select("*")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (sErr) return json(500, { ok: false, error: sErr.message });
  if (!session) return json(404, { ok: false, error: "session not found" });
  if (session.status === "ended") return json(403, { ok: false, error: "session ended" });

  switch (body.action) {
    case "send": {
      const content = (body.content ?? "").trim();
      const images = body.images ?? [];
      if (!content && images.length === 0) {
        return json(400, { ok: false, error: "content or images required" });
      }
      // Restrict chatter-side msg_type to message or purchase. If a price is
      // set we treat it as a purchase by default (matches the original
      // Roleplaychatters semantics where the chatter sends content "for sale").
      let msgType: "message" | "purchase" = body.msgType ?? "message";
      if (typeof body.price === "number" && body.price > 0 && !body.msgType) {
        msgType = "purchase";
      }
      if (msgType !== "message" && msgType !== "purchase") {
        return json(400, { ok: false, error: "invalid msgType for chatter" });
      }
      const price = typeof body.price === "number" && body.price >= 0 ? body.price : null;

      const { data, error } = await supa
        .from("chatter_messages")
        .insert({
          session_id: body.sessionId,
          role: "chatter",
          msg_type: msgType,
          content: content || null,
          images,
          price,
          from_examiner: false,
        })
        .select("*")
        .single();
      if (error) return json(500, { ok: false, error: error.message });

      // Auto-flip status to 'active' on first chatter message
      if (session.status === "waiting") {
        await supa
          .from("chatter_sessions")
          .update({ status: "active", started_at: new Date().toISOString() })
          .eq("id", body.sessionId);
      }
      return json(200, { ok: true, message: data });
    }

    case "claim-device": {
      if (!body.deviceId) return json(400, { ok: false, error: "deviceId required" });
      // If another device is currently active and was claimed in the last
      // 30 seconds, reject. Otherwise (re)claim.
      const stale = Date.now() - 30 * 1000;
      const claimedAt = session.active_device_claimed_at
        ? new Date(session.active_device_claimed_at).getTime()
        : 0;
      const isOtherDevice =
        session.active_device_id && session.active_device_id !== body.deviceId;
      const isFresh = claimedAt > stale;
      if (isOtherDevice && isFresh) {
        return json(409, {
          ok: false,
          error: "session_locked",
          message: "Otro dispositivo está activo en esta sesión.",
        });
      }
      await supa
        .from("chatter_sessions")
        .update({
          active_device_id: body.deviceId,
          active_device_claimed_at: new Date().toISOString(),
        })
        .eq("id", body.sessionId);
      return json(200, { ok: true });
    }

    case "set-typing": {
      await supa
        .from("chatter_sessions")
        .update({
          typing_chatter: !!body.typing,
          typing_chatter_at: body.typing ? new Date().toISOString() : null,
        })
        .eq("id", body.sessionId);
      return json(200, { ok: true });
    }

    case "mark-read": {
      await supa
        .from("chatter_sessions")
        .update({ read_by_chatter_at: new Date().toISOString() })
        .eq("id", body.sessionId);
      return json(200, { ok: true });
    }

    default:
      return json(400, { ok: false, error: "unknown action" });
  }
});
