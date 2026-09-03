import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCorsFor } from "../_shared/whatsapp.ts";

// wa-contact-avatar — devuelve la URL de la foto de perfil del CONTACTO de una
// conversación, pidiéndosela al gateway (/profile/picture). La apikey del gateway
// queda server-side. Auth propia: JWT (getUser) + permiso WhatsApp/Bandeja.
// Devuelve siempre { ok:true, url } (url=null si no hay foto o el contacto la ocultó).

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";


serve(async (req) => {
  // `json` vive DENTRO del handler para que los headers de CORS se resuelvan
  // por request (Maven vive en más de un dominio).
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status, headers: { ...whatsappCorsFor(req), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCorsFor(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const { data: allowed } = await sb.rpc("has_permission", {
    _user_id: userData.user.id, _module: "WhatsApp", _submodule: "Bandeja",
  });
  if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

  let payload: { conversation_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  if (!payload.conversation_id) return json({ ok: false, error: "missing_conversation_id" }, 400);

  // Resolver la conversación → wa_jid del contacto + instancia del canal.
  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("channel_id, channel_jid, wa_contacts(wa_jid)")
    .eq("id", payload.conversation_id)
    .maybeSingle();
  const waJid = conv?.wa_contacts?.wa_jid as string | undefined;
  if (!waJid) return json({ ok: true, url: null });

  let instance = (conv.channel_jid as string | null) || EVOLUTION_INSTANCE;
  if (conv.channel_id) {
    const { data: ch } = await (sb as any)
      .from("wa_channels").select("evolution_instance").eq("id", conv.channel_id).maybeSingle();
    if (ch?.evolution_instance) instance = ch.evolution_instance as string;
  }

  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return json({ ok: true, url: null });
  try {
    const resp = await fetch(
      `${EVOLUTION_URL.replace(/\/$/, "")}/profile/picture/${instance}?jid=${encodeURIComponent(waJid)}`,
      { headers: { apikey: EVOLUTION_API_KEY } },
    );
    if (!resp.ok) return json({ ok: true, url: null });
    const d = await resp.json() as { url?: string | null };
    return json({ ok: true, url: d?.url ?? null });
  } catch (e) {
    return json({ ok: true, url: null, error: (e as Error).message });
  }
});
