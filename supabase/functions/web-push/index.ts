import { corsFor } from "../_shared/cors.ts";
// Web Push: avisar de una llamada entrante aunque Maven esté CERRADO o en otra
// pestaña. El navegador del destinatario se suscribe (guarda la suscripción
// acá) y su service worker recibe el push que dispara esta edge.
//
// La criptografía del push (VAPID JWT + payload cifrado, RFC 8291/8292) la hace
// la librería `web-push`; acá solo orquestamos: guardar suscripciones y enviar.
//
// Claves VAPID en secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@unlok.me";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) return json(req, { error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // La public key la pide el frontend para suscribirse. No es secreta.
    if (action === "public_key") {
      if (!VAPID_PUBLIC) return json(req, { error: "push no configurado" }, 503);
      return json(req, { publicKey: VAPID_PUBLIC });
    }

    if (action === "subscribe") {
      const sub = (body as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }).subscription;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json(req, { error: "suscripción inválida" }, 400);
      }
      const { error } = await admin.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: req.headers.get("user-agent"),
      }, { onConflict: "user_id,endpoint" });
      if (error) return json(req, { error: error.message }, 500);
      return json(req, { ok: true });
    }

    if (action === "unsubscribe") {
      const endpoint = (body as { endpoint?: string }).endpoint;
      if (!endpoint) return json(req, { error: "falta endpoint" }, 400);
      await admin.from("push_subscriptions").delete()
        .eq("user_id", user.id).eq("endpoint", endpoint);
      return json(req, { ok: true });
    }

    // Notificar una llamada entrante al destinatario. Lo dispara el frontend de
    // QUIEN LLAMA justo después de crear el "ringing".
    if (action === "notify_call") {
      if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json(req, { error: "push no configurado" }, 503);
      const callId = (body as { callId?: string }).callId;
      if (!callId) return json(req, { error: "falta callId" }, 400);

      const { data: call } = await admin.from("calls")
        .select("id, caller_id, receiver_id, room_id, call_type, call_status")
        .eq("id", callId).maybeSingle();
      if (!call) return json(req, { error: "llamada no encontrada" }, 404);
      // Solo quien inició la llamada puede pedir notificarla.
      if (call.caller_id !== user.id) return json(req, { error: "no autorizado" }, 403);
      if (!call.receiver_id) return json(req, { ok: true, sent: 0 });

      const { data: profile } = await admin.from("profiles")
        .select("full_name").eq("id", user.id).maybeSingle();

      const { data: subs } = await admin.from("push_subscriptions")
        .select("id, endpoint, p256dh, auth").eq("user_id", call.receiver_id);
      if (!subs?.length) return json(req, { ok: true, sent: 0 });

      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
      const payload = JSON.stringify({
        type: "incoming_call",
        callId: call.id,
        room: call.room_id,
        callType: call.call_type ?? "video",
        caller: (profile?.full_name as string) ?? "Alguien",
      });

      let sent = 0;
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
            payload,
            { TTL: 30, urgency: "high" },
          );
          sent++;
        } catch (e) {
          // 404/410 = suscripción muerta (el navegador la revocó): la limpiamos.
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      }));
      return json(req, { ok: true, sent });
    }

    return json(req, { error: "acción desconocida" }, 400);
  } catch (e) {
    console.error("web-push error:", (e as Error).message);
    return json(req, { error: "Internal server error" }, 500);
  }
});
