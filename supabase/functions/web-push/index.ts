import { corsFor } from "../_shared/cors.ts";
// Web Push de Maven. Dos familias de acciones:
//
//  · De USUARIO (Bearer propio): `public_key`, `subscribe`, `unsubscribe` y
//    `notify_call` (quien llama avisa al destinatario aunque tenga Maven cerrado).
//
//  · De SERVIDOR (`X-Cron-Token` del vault o service_role): `notify`. La dispara
//    un trigger de Postgres vía pg_net con la lista de destinatarios candidatos:
//      - kind "chat_message": espera 2,5 s, relee el mensaje y descarta a quien
//        ya lo leyó, lo silenció, está en "solo menciones" sin mención, o tiene
//        No-molestar. Título y cuerpo se arman acá (paridad con la app).
//      - kinds genéricos ("cowork_llamado", "inbox_asignacion"): título, cuerpo
//        y url vienen en el body; solo se filtra opt-in y No-molestar.
//    Nunca acepta Bearer de usuario: nadie puede empujar avisos a otros.
//
//  Todo respeta notification_settings.push_enabled (opt-in por usuario, default
//  false) salvo `notify_call`, que sigue como siempre.
//
// La criptografía del push (VAPID JWT + payload cifrado, RFC 8291/8292) la hace
// la librería `web-push`; acá solo orquestamos. Claves en secrets:
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. Token del trigger:
// CRON_INTERNAL_TOKEN (mismo valor que el vault `cron_internal_token`).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  type AjustesUsuario,
  type Candidato,
  type Participacion,
  type Prioridad,
  armarTituloYCuerpo,
  decidirDestinatarios,
  minutosEnBogota,
  previewDeMensaje,
} from "../_shared/push-notify.ts";

/** Margen para que el cliente de quien está mirando el chat marque last_read_at
 *  (lo hace al recibir el mensaje con la ventana en foco). */
const ESPERA_LECTURA_MS = 2500;
const TOPE_DESTINATARIOS = 200;
const TAMANO_LOTE = 20;
/** Un mensaje puede esperar al celular hasta un día; una llamada, 30 s. */
const TTL_AVISOS_S = 86400;
const TTL_LLAMADA_S = 30;

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;
type Vapid = { subject: string; publicKey: string; privateKey: string };
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type NotifyBody = {
  kind?: unknown;
  recipient_ids?: unknown;
  ref?: Record<string, unknown>;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  priority?: unknown;
};

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-token",
  });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Credencial de servidor en el Authorization: la key del runtime (igualdad) o
 *  un JWT legacy con role=service_role. Mismo criterio que send-notification-email. */
function esLlamadaDeServicio(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return true;
  try {
    const b64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(b64)) as { role?: string };
    return claims?.role === "service_role";
  } catch {
    return false;
  }
}

/** Manda el mismo payload a todas las suscripciones, en lotes, y purga las que
 *  el navegador ya revocó (404/410). */
async function enviarATodas(
  admin: Admin,
  subs: Sub[],
  payload: string,
  opts: { TTL: number; urgency: "high" | "normal" | "low" },
  vapid: Vapid,
): Promise<{ sent: number; purged: number }> {
  if (!subs.length) return { sent: 0, purged: 0 };
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let sent = 0;
  let purged = 0;
  for (let i = 0; i < subs.length; i += TAMANO_LOTE) {
    const lote = subs.slice(i, i + TAMANO_LOTE);
    await Promise.all(lote.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          opts,
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          purged++;
        } else {
          console.warn("web-push: envío falló", code ?? (e as Error).message);
        }
      }
    }));
  }
  return { sent, purged };
}

async function cargarAjustes(admin: Admin, ids: string[]): Promise<Map<string, AjustesUsuario>> {
  const mapa = new Map<string, AjustesUsuario>();
  if (!ids.length) return mapa;
  const { data } = await admin
    .from("notification_settings")
    .select("user_id, push_enabled, notifications_enabled, dnd_enabled, dnd_start_time, dnd_end_time, dnd_allow_critical")
    .in("user_id", ids);
  for (const r of (data ?? []) as Array<AjustesUsuario & { user_id: string }>) mapa.set(r.user_id, r);
  return mapa;
}

async function cargarSubs(admin: Admin, ids: string[]): Promise<Sub[]> {
  if (!ids.length) return [];
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", ids);
  return (data ?? []) as Sub[];
}

function leerIds(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

async function notificar(req: Request, admin: Admin, b: NotifyBody, vapid: Vapid): Promise<Response> {
  const kind = typeof b.kind === "string" ? b.kind : "";
  if (!kind) return json(req, { error: "falta kind" }, 400);

  let ids = leerIds(b.recipient_ids);
  if (ids.length > TOPE_DESTINATARIOS) {
    console.warn(`web-push notify ${kind}: ${ids.length} destinatarios, se cortan a ${TOPE_DESTINATARIOS}`);
    ids = ids.slice(0, TOPE_DESTINATARIOS);
  }
  const prioridad: Prioridad = b.priority === "critical" || b.priority === "normal" ? b.priority : "low";
  const ahoraMin = minutosEnBogota(new Date());

  if (kind === "chat_message") {
    const messageId = typeof b.ref?.message_id === "string" ? b.ref.message_id : "";
    if (!messageId) return json(req, { error: "falta ref.message_id" }, 400);
    if (!ids.length) return json(req, { ok: true, kind, candidates: 0, sent: 0 });

    await new Promise((r) => setTimeout(r, ESPERA_LECTURA_MS));

    const { data: msg } = await admin
      .from("chat_messages")
      .select("id, conversation_id, sender_id, content, type, file_name, is_deleted, is_thread_reply, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) return json(req, { ok: true, kind, sent: 0, reason: "message_not_found" });
    if (msg.is_deleted) return json(req, { ok: true, kind, sent: 0, reason: "deleted" });
    if (msg.type === "system") return json(req, { ok: true, kind, sent: 0, reason: "system" });

    const destinatarios = ids.filter((id) => id !== msg.sender_id);
    const [conv, emisor, parts, ajustes, perfiles, subs] = await Promise.all([
      admin.from("chat_conversations").select("type, name").eq("id", msg.conversation_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", msg.sender_id).maybeSingle(),
      admin.from("chat_participants").select("user_id, is_muted, notifications_mode, last_read_at")
        .eq("conversation_id", msg.conversation_id).in("user_id", destinatarios),
      cargarAjustes(admin, destinatarios),
      admin.from("profiles").select("id, full_name").in("id", destinatarios),
      cargarSubs(admin, destinatarios),
    ]);

    const participacion = new Map<string, Participacion>();
    for (const p of (parts.data ?? []) as Array<Participacion & { user_id: string }>) participacion.set(p.user_id, p);
    const nombres = new Map<string, string | null>();
    for (const p of (perfiles.data ?? []) as Array<{ id: string; full_name: string | null }>) nombres.set(p.id, p.full_name);

    const candidatos: Candidato[] = destinatarios.map((id) => ({
      userId: id,
      nombre: nombres.get(id) ?? null,
      ajustes: ajustes.get(id) ?? null,
      participacion: participacion.get(id) ?? null,
      suscripciones: subs.filter((s) => s.user_id === id).length,
    }));
    const { enviar, skipped } = decidirDestinatarios({
      candidatos,
      esChat: true,
      mensaje: { content: msg.content ?? null, created_at: msg.created_at },
      prioridad,
      ahoraMin,
    });

    const { title, body } = armarTituloYCuerpo({
      esGrupo: conv.data?.type === "group",
      nombreGrupo: conv.data?.name ?? null,
      emisor: (emisor.data?.full_name as string | null) || "Alguien",
      preview: previewDeMensaje(msg.content ?? null, msg.type ?? "text", msg.file_name ?? null),
      enHilo: msg.is_thread_reply === true,
    });
    const payload = JSON.stringify({
      type: "chat_message",
      title,
      body,
      tag: `chat-${msg.conversation_id}`,
      url: `/messenger?c=${msg.conversation_id}`,
      conversationId: msg.conversation_id,
      messageId: msg.id,
    });
    const r = await enviarATodas(
      admin,
      subs.filter((s) => enviar.includes(s.user_id)),
      payload,
      { TTL: TTL_AVISOS_S, urgency: "high" },
      vapid,
    );
    const res = { ok: true, kind, candidates: destinatarios.length, ...r, skipped };
    console.log("web-push notify", JSON.stringify(res));
    return json(req, res);
  }

  // Kinds genéricos: el trigger ya armó el texto y la ruta.
  const title = typeof b.title === "string" ? b.title : "";
  const url = typeof b.url === "string" ? b.url : "";
  if (!title || !url) return json(req, { error: "kinds genéricos requieren title y url" }, 400);
  if (!ids.length) return json(req, { ok: true, kind, candidates: 0, sent: 0 });

  const [ajustes, subs] = await Promise.all([cargarAjustes(admin, ids), cargarSubs(admin, ids)]);
  const candidatos: Candidato[] = ids.map((id) => ({
    userId: id,
    nombre: null,
    ajustes: ajustes.get(id) ?? null,
    participacion: null,
    suscripciones: subs.filter((s) => s.user_id === id).length,
  }));
  const { enviar, skipped } = decidirDestinatarios({ candidatos, esChat: false, mensaje: null, prioridad, ahoraMin });
  const payload = JSON.stringify({
    type: kind,
    title,
    body: typeof b.body === "string" ? b.body : "",
    tag: typeof b.tag === "string" && b.tag ? b.tag : kind,
    url,
    ref: b.ref ?? null,
  });
  const r = await enviarATodas(
    admin,
    subs.filter((s) => enviar.includes(s.user_id)),
    payload,
    { TTL: TTL_AVISOS_S, urgency: "high" },
    vapid,
  );
  const res = { ok: true, kind, candidates: ids.length, ...r, skipped };
  console.log("web-push notify", JSON.stringify(res));
  return json(req, res);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const vapid: Vapid = {
      publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
      privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
      subject: Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@unlok.me",
    };
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // El body se lee ANTES de la auth: la acción decide qué credencial vale.
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    // --- Acción de SERVIDOR: la dispara un trigger (pg_net) o otra edge. ---
    if (action === "notify") {
      const cronExpected = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
      const isCron = !!cronExpected && req.headers.get("X-Cron-Token") === cronExpected;
      if (!isCron && !esLlamadaDeServicio(req.headers.get("Authorization"))) {
        return json(req, { error: "Unauthorized" }, 401);
      }
      if (!vapid.publicKey || !vapid.privateKey) return json(req, { error: "push no configurado" }, 503);
      return await notificar(req, admin, body as NotifyBody, vapid);
    }

    // --- Acciones de USUARIO: Bearer propio. ---
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

    // La public key la pide el frontend para suscribirse. No es secreta.
    if (action === "public_key") {
      if (!vapid.publicKey) return json(req, { error: "push no configurado" }, 503);
      return json(req, { publicKey: vapid.publicKey });
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
    // QUIEN LLAMA justo después de crear el "ringing". No pasa por push_enabled.
    if (action === "notify_call") {
      if (!vapid.publicKey || !vapid.privateKey) return json(req, { error: "push no configurado" }, 503);
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

      const subs = await cargarSubs(admin, [call.receiver_id as string]);
      if (!subs.length) return json(req, { ok: true, sent: 0 });

      const payload = JSON.stringify({
        type: "incoming_call",
        callId: call.id,
        room: call.room_id,
        callType: call.call_type ?? "video",
        caller: (profile?.full_name as string) ?? "Alguien",
      });
      const { sent } = await enviarATodas(admin, subs, payload, { TTL: TTL_LLAMADA_S, urgency: "high" }, vapid);
      return json(req, { ok: true, sent });
    }

    return json(req, { error: "acción desconocida" }, 400);
  } catch (e) {
    console.error("web-push error:", (e as Error).message);
    return json(req, { error: "Internal server error" }, 500);
  }
});
