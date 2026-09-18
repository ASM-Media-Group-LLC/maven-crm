// EL ✓ DE "LE LLEGÓ AL TELÉFONO".
//
// Hasta ahora, cuando a alguien le sonaba el celular con un mensaje de Maven,
// el que lo mandó seguía viendo "Enviado · aún no le llegó" hasta que la persona
// abriera la aplicación. Le había llegado de verdad y la base no se enteraba.
//
// ── POR QUÉ HACE FALTA ESTA PUERTA ─────────────────────────────────────────
//
// El aviso push lo manda `web-push` CIFRADO y el MISMO para todos los
// destinatarios, así que el service worker que lo recibe no sabe a quién
// pertenece: no puede marcar el acuse por su cuenta. Y tampoco tiene la sesión
// del usuario — un service worker no ve el localStorage donde vive el token.
//
// Lo único que el service worker SÍ sabe es su PROPIA suscripción
// (`pushManager.getSubscription()`). Y esa dirección ya está en nuestra tabla
// junto a su dueño. O sea que la suscripción alcanza para identificar a la
// persona sin pedirle credenciales a nadie.
//
// ── POR QUÉ ES SEGURO, Y QUÉ SE ASUME ──────────────────────────────────────
//
//  · La dirección de suscripción es la credencial. Es una URL larga y aleatoria
//    que emite el servicio de push del navegador; no se adivina. Quien la tenga
//    ya podría mandarle avisos a esa persona, así que poder marcar un acuse no
//    le agrega poder.
//  · Se comprueba que esa persona sea PARTICIPANTE de la conversación del
//    mensaje. Sin esto, una dirección filtrada serviría para marcar como
//    entregado cualquier mensaje de cualquier chat.
//  · Solo se escribe `delivered_at`. NUNCA `read_at`: que el teléfono reciba
//    algo no significa que alguien lo haya leído, y decir lo contrario sería
//    mentirle al que mandó.
//  · `ignoreDuplicates`: si ya había acuse (porque la persona tenía Maven
//    abierto), no lo pisa. El primero que llega gana, que es lo correcto.
//  · Se contesta 200 aunque no se haya escrito nada. No es descuido: contestar
//    404 cuando la suscripción no existe convertiría esta puerta en un detector
//    de suscripciones válidas.
//
// verify_jwt = false en config.toml por lo de arriba: el service worker no tiene
// sesión que mandar. La autorización la da la suscripción, no un token.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers": "apikey, content-type, authorization",
  });

const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

/** Una dirección de push real mide cientos de caracteres. El tope evita que
 *  alguien mande un cuerpo enorme solo para hacernos trabajar. */
const MAX_LARGO_ENDPOINT = 2000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "método no permitido" }, 405);

  let cuerpo: { messageId?: unknown; endpoint?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return json(req, { error: "cuerpo inválido" }, 400);
  }

  const messageId = typeof cuerpo.messageId === "string" ? cuerpo.messageId.trim() : "";
  const endpoint = typeof cuerpo.endpoint === "string" ? cuerpo.endpoint.trim() : "";
  if (!messageId || !endpoint || endpoint.length > MAX_LARGO_ENDPOINT) {
    return json(req, { error: "faltan messageId o endpoint" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // 1. ¿De quién es esta suscripción? Acá se resuelve la identidad.
  const { data: sub } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  // Suscripción desconocida (revocada, de otro entorno, inventada): se contesta
  // como si todo hubiera ido bien, para no delatar cuáles existen.
  if (!sub?.user_id) return json(req, { ok: true, marcado: false });

  // 2. ¿Esa persona tiene algo que ver con este mensaje? Sin esta comprobación,
  //    una dirección filtrada marcaría mensajes de conversaciones ajenas.
  const { data: msg } = await admin
    .from("chat_messages")
    .select("id, conversation_id, sender_id, is_deleted")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.is_deleted) return json(req, { ok: true, marcado: false });
  // Uno no se "entrega" sus propios mensajes.
  if (msg.sender_id === sub.user_id) return json(req, { ok: true, marcado: false });

  const { data: parte } = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("conversation_id", msg.conversation_id)
    .eq("user_id", sub.user_id)
    .maybeSingle();
  if (!parte) return json(req, { ok: true, marcado: false });

  // 3. Recién ahora se escribe, y solo el "entregado".
  const { error } = await admin
    .from("chat_read_receipts")
    .upsert(
      [{ message_id: messageId, user_id: sub.user_id, delivered_at: new Date().toISOString() }],
      { onConflict: "message_id,user_id", ignoreDuplicates: true },
    );
  if (error) {
    console.warn("push-entregado: no se pudo marcar", error.message);
    return json(req, { ok: false }, 500);
  }
  return json(req, { ok: true, marcado: true });
});
