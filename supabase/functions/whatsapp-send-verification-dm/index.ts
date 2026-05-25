import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-send-verification-dm — manda un DM privado a un user que
// recién cargó su phone_e164 en Settings, pidiendo confirmación con "SI".
//
// Trigger:
//   - SQL trigger AFTER UPDATE OF phone_e164 ON profiles dispara esta
//     function via pg_net cuando el user guarda el número.
//   - También se puede invocar a mano desde el panel ("Reenviar DM")
//     o desde el backfill manual.
//
// Flujo end-to-end:
//   1. User carga phone_e164 en Settings → trigger SQL dispara esta function
//   2. Esta function manda DM a su WhatsApp via Evolution API
//   3. User responde "SI" al DM en privado
//   4. whatsapp-ingest detecta el DM (no es @g.us), busca profile por
//      phone, guarda pushName + setea verified_at
//   5. Cuando ese user escriba en cualquier grupo, su pushName matchea
//      con profiles.whatsapp_push_name → upsertMember setea user_id
//
// Idempotencia: si el user ya está verificado (whatsapp_verified_at IS
// NOT NULL), no mandamos otra vez salvo que force=true.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";

interface RequestBody {
  user_id?: string;
  phone_e164?: string;
  force?: boolean; // re-enviar aunque ya esté verificado
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone_e164: string | null;
  whatsapp_verified_at: string | null;
}

function buildMessage(fullName: string | null): string {
  const greeting = fullName ? `Hola ${fullName.split(" ")[0]} 👋` : "Hola 👋";
  return [
    greeting,
    "",
    "Soy *Maven Asistente*. Vi que vinculaste este número a tu cuenta en Maven CRM.",
    "",
    "Para confirmar que sos vos, respondé *SI* a este mensaje 🙏",
    "",
    "Una vez confirmado, te voy a poder reconocer cuando escribas en los grupos del equipo.",
  ].join("\n");
}

async function sendDm(phoneE164: string, text: string): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    return { ok: false, error: "evolution_not_configured" };
  }
  // Evolution acepta el número sin el `+`, solo dígitos.
  const numberDigits = phoneE164.replace(/^\+/, "");
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: numberDigits,
        options: { delay: 0, presence: "composing" },
        textMessage: { text },
      }),
    });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: `evolution ${resp.status}`, raw };
    }
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const sb = adminClient();

  // Resolver el profile: por user_id o por phone_e164.
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
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  if (!profile) {
    return new Response(JSON.stringify({ ok: false, error: "profile_not_found" }), {
      status: 404,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  if (!profile.phone_e164) {
    return new Response(JSON.stringify({ ok: false, error: "profile_has_no_phone" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  // Skip si ya está verificado y no es force=true.
  if (profile.whatsapp_verified_at && !body.force) {
    return new Response(JSON.stringify({ ok: true, skipped: "already_verified" }), {
      status: 200,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const text = buildMessage(profile.full_name);
  const result = await sendDm(profile.phone_e164, text);

  await logEvent(sb, {
    tenantId: null,
    kind: result.ok ? "verification_dm_sent" : "verification_dm_failed",
    payload: {
      user_id: profile.id,
      full_name: profile.full_name,
      phone_e164: profile.phone_e164,
      force: body.force ?? false,
      error: result.error,
    },
  });

  return new Response(JSON.stringify({ ok: result.ok, error: result.error }), {
    status: result.ok ? 200 : 500,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
});
