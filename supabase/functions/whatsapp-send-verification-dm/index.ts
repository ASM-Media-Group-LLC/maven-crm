import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-send-verification-dm — manda un DM privado a un user que recién
// cargó su phone_e164 en Settings, con un código de verificación único.
//
// Por qué el código: WhatsApp moderno (post-2025) anonimiza los DMs
// entrantes con @lid igual que en grupos. Cuando el user responde, el
// remoteJid NO trae el teléfono — solo el LID anónimo. Sin código, no
// podemos saber qué profile responde. Con código, hacemos el match
// inequívoco por la tabla whatsapp_verification_codes.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
// v1: { number, options, textMessage:{text} } ; v2: { number, text }
const EVOLUTION_API_VERSION = Deno.env.get("WHATSAPP_EVOLUTION_API_VERSION") ?? "v1";

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

// Genera un código de 6 chars sin caracteres confusos (sin O/0, I/1, B/8, etc).
// Alphabet de 28 chars × 6 positions = 481M combos — colisión casi imposible.
const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479";

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Inserta un código nuevo, retryando si hay colisión con un código activo.
// El unique partial index nos protege de duplicados; si una inserción falla
// por colisión, generamos otro.
async function generateAndPersistCode(sb: SupabaseClient, userId: string, phone: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const { error } = await sb.from("whatsapp_verification_codes").insert({
      user_id: userId,
      code,
      phone_e164: phone,
    });
    if (!error) return code;
    // Si es violación de unique, retryar. Cualquier otro error → fail.
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
      console.warn("generateAndPersistCode error:", error.message);
      return null;
    }
  }
  return null;
}

function buildMessage(fullName: string | null, code: string): string {
  const greeting = fullName ? `Hola ${fullName.split(" ")[0]} 👋` : "Hola 👋";
  return [
    greeting,
    "",
    "Soy *Maven Asistente*. Vi que vinculaste este número a tu cuenta en Maven CRM.",
    "",
    "Para confirmar que sos vos, respondé este mensaje con el código:",
    "",
    `*${code}*`,
    "",
    "Una vez confirmado, te voy a poder reconocer cuando escribas en los grupos del equipo.",
  ].join("\n");
}

async function sendDm(phoneE164: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    return { ok: false, error: "evolution_not_configured" };
  }
  const numberDigits = phoneE164.replace(/^\+/, "");
  // v1 wrapper vs v2 plano según EVOLUTION_API_VERSION.
  const payload = EVOLUTION_API_VERSION === "v2"
    ? { number: numberDigits, text }
    : { number: numberDigits, options: { delay: 0, presence: "composing" }, textMessage: { text } };
  try {
    const resp = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { ok: false, error: `evolution ${resp.status}: ${errText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

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
    return new Response(JSON.stringify({ ok: false, error: "missing user_id or phone_e164" }), {
      status: 400, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  if (!profile) {
    return new Response(JSON.stringify({ ok: false, error: "profile_not_found" }), {
      status: 404, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
  if (!profile.phone_e164) {
    return new Response(JSON.stringify({ ok: false, error: "profile_has_no_phone" }), {
      status: 400, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
  if (profile.whatsapp_verified_at && !body.force) {
    return new Response(JSON.stringify({ ok: true, skipped: "already_verified" }), {
      status: 200, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  // Generar y guardar código único.
  const code = await generateAndPersistCode(sb, profile.id, profile.phone_e164);
  if (!code) {
    await logEvent(sb, {
      tenantId: null,
      kind: "verification_dm_failed",
      payload: { user_id: profile.id, error: "could_not_generate_code" },
    });
    return new Response(JSON.stringify({ ok: false, error: "could_not_generate_code" }), {
      status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const text = buildMessage(profile.full_name, code);
  const result = await sendDm(profile.phone_e164, text);

  await logEvent(sb, {
    tenantId: null,
    kind: result.ok ? "verification_dm_sent" : "verification_dm_failed",
    payload: {
      user_id: profile.id,
      full_name: profile.full_name,
      phone_e164: profile.phone_e164,
      code,
      force: body.force ?? false,
      error: result.error,
    },
  });

  return new Response(JSON.stringify({ ok: result.ok, error: result.error, code }), {
    status: result.ok ? 200 : 500,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
});
