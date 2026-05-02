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
  action: "send" | "claim-device" | "set-typing" | "mark-read" | "upload-image";
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
  // upload-image
  fileName?: string;
  contentType?: string;
  base64?: string;                       // raw base64 (no data URL prefix)
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

    case "upload-image": {
      if (!body.base64 || !body.fileName) {
        return json(400, { ok: false, error: "base64 and fileName required" });
      }
      const ct = body.contentType ?? "image/jpeg";
      if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
        return json(400, { ok: false, error: "only image/* or video/* supported" });
      }
      // Decode base64 → bytes. Hard cap at 8 MB (post-decode) to keep edge
      // function payload reasonable; the frontend should refuse larger files
      // before encoding.
      const bin = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      if (bin.length > 8 * 1024 * 1024) {
        return json(413, { ok: false, error: "file too large (max 8 MB)" });
      }
      const safeName = (body.fileName || "upload")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || `upload-${Date.now()}`;
      const path = `_chat_uploads/${body.sessionId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supa.storage
        .from("chatter-vault")
        .upload(path, bin, { upsert: false, contentType: ct });
      if (upErr) return json(500, { ok: false, error: upErr.message });
      const { data: pub } = supa.storage
        .from("chatter-vault")
        .getPublicUrl(path);
      return json(200, { ok: true, url: pub.publicUrl, path });
    }

    default:
      return json(400, { ok: false, error: "unknown action" });
  }
});
