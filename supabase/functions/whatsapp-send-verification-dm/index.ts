import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-send-verification-dm — v2 INICIADA POR EL USUARIO: genera el código de
// verificación y lo DEVUELVE para que el front lo muestre con un botón wa.me.
// El USUARIO le manda el código al bot; el ingest lo matchea
// (claim_whatsapp_verification_code) y vincula LID+pushName al profile.
//
// ⚠️ YA NO ENVÍA NINGÚN DM. La v1 mandaba un mensaje EN FRÍO con el código al
// número recién cargado — el 2026-07-20 eso tumbó/flageó la línea del bot
// (anti-spam de WhatsApp: texto con código desde un número desconocido).
// Regla desde entonces: la línea del bot NUNCA inicia conversación con un
// número que no le escribió primero. (Frío de verdad → Cloud API oficial.)
//
// Por qué el código: WhatsApp moderno anonimiza los DMs entrantes con @lid —
// cuando el user escribe, el remoteJid no trae el teléfono. El código hace el
// match inequívoco user↔LID.

// Número de la línea del bot (para armar el link wa.me en el front).
const BOT_PHONE = (Deno.env.get("WHATSAPP_BOT_PHONE") ?? "573225218180").replace(/[^\d]/g, "");

interface RequestBody {
  user_id?: string;
  phone_e164?: string;
  force?: boolean;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone_e164: string | null;
  whatsapp_verified_at: string | null;
}

// Código de 6 chars sin caracteres confusos (sin O/0, I/1, B/8, etc). Debe
// mantenerse en sync con CODE_REGEX del ingest.
const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479";

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Inserta un código nuevo (invalidando los pendientes previos del user para no
// acumular códigos activos), retryando si hay colisión.
async function generateAndPersistCode(sb: SupabaseClient, userId: string, phone: string): Promise<string | null> {
  await sb.from("whatsapp_verification_codes")
    .delete()
    .eq("user_id", userId)
    .is("used_at", null);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const { error } = await sb.from("whatsapp_verification_codes").insert({
      user_id: userId,
      code,
      phone_e164: phone,
    });
    if (!error) return code;
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
      console.warn("generateAndPersistCode error:", error.message);
      return null;
    }
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const sb = adminClient();

  let profile: ProfileRow | null = null;
  if (body.user_id) {
    const { data } = await sb.from("profiles").select("id, full_name, phone_e164, whatsapp_verified_at")
      .eq("id", body.user_id).maybeSingle();
    profile = (data as ProfileRow | null) ?? null;
  } else if (body.phone_e164) {
    const { data } = await sb.from("profiles").select("id, full_name, phone_e164, whatsapp_verified_at")
      .eq("phone_e164", body.phone_e164).maybeSingle();
    profile = (data as ProfileRow | null) ?? null;
  } else {
    return json({ ok: false, error: "missing user_id or phone_e164" }, 400);
  }

  if (!profile) return json({ ok: false, error: "profile_not_found" }, 404);
  if (!profile.phone_e164) return json({ ok: false, error: "profile_has_no_phone" }, 400);
  if (profile.whatsapp_verified_at && !body.force) {
    return json({ ok: true, skipped: "already_verified" });
  }

  const code = await generateAndPersistCode(sb, profile.id, profile.phone_e164);
  if (!code) {
    await logEvent(sb, {
      tenantId: null,
      kind: "verification_code_failed",
      payload: { user_id: profile.id, error: "could_not_generate_code" },
    });
    return json({ ok: false, error: "could_not_generate_code" }, 500);
  }

  await logEvent(sb, {
    tenantId: null,
    kind: "verification_code_issued",
    payload: {
      user_id: profile.id,
      full_name: profile.full_name,
      phone_e164: profile.phone_e164,
      code,
      force: body.force ?? false,
      flow: "user_initiated",
    },
  });

  // El front arma el botón: el USUARIO le manda el código al bot (cero frío).
  return json({
    ok: true,
    code,
    bot_phone: BOT_PHONE,
    wa_link: `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(code)}`,
  });
});
