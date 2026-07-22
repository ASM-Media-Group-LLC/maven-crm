import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-instance-manage — Fase 4: proxy admin para gestionar LÍNEAS (instancias del
// Maven Baileys Gateway) desde la UI, SIN exponer la apikey al browser.
//
// El browser nunca toca el gateway directo (la apikey es secreta). Esta función
// valida el JWT del usuario + permiso (WhatsApp/Bandeja — admins pasan) y proxea
// al gateway con la apikey server-side. Acciones: list / state / connect (QR) /
// create / logout. Devuelve solo data segura (estado, QR base64, perfil) — nunca
// la apikey. Mismo patrón de auth + env que wa-inbox-send.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";

const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

// Proxea una request al gateway con la apikey. Devuelve {status, body}.
async function gw(method: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    return { status: 503, body: { error: "evolution_not_configured" } };
  }
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}${path}`;
  try {
    const resp = await fetch(url, { method, headers: { "apikey": EVOLUTION_API_KEY } });
    const text = await resp.text();
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    return { status: resp.status, body };
  } catch (e) {
    return { status: 502, body: { error: (e as Error).message } };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth: JWT del usuario ──────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  // ── Permiso server-side: WhatsApp / Canales (mismo que gatea la pantalla de
  // canales que llama a este proxy; has_permission devuelve true para admin). ──
  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "WhatsApp", _submodule: "Canales",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  // ── Input ──────────────────────────────────────────────────────────────────
  let payload: { action?: string; instance?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const action = String(payload.action ?? "");
  const inst = String(payload.instance ?? "").trim();

  // Las acciones por instancia validan el nombre (evita path traversal / basura).
  const instInvalid = !INSTANCE_RE.test(inst);
  const badInst = () => json({ ok: false, error: "invalid_instance", hint: "use [a-zA-Z0-9_-], 1-64 chars" }, 400);

  switch (action) {
    case "list": {
      const r = await gw("GET", "/instance/list");
      return json({ ok: r.status < 400, ...r.body }, r.status);
    }
    case "state": {
      if (instInvalid) return badInst();
      const r = await gw("GET", `/instance/connectionState/${inst}`);
      return json({ ok: r.status < 400, ...r.body }, r.status);
    }
    case "connect": {
      if (instInvalid) return badInst();
      const r = await gw("GET", `/instance/connect/${inst}`);
      return json({ ok: r.status < 400, ...r.body }, r.status);
    }
    case "create": {
      if (instInvalid) return badInst();
      const r = await gw("POST", `/instance/create/${inst}`);
      return json({ ok: r.status < 400, ...r.body }, r.status);
    }
    case "logout": {
      if (instInvalid) return badInst();
      const r = await gw("DELETE", `/instance/logout/${inst}`);
      return json({ ok: r.status < 400, ...r.body }, r.status);
    }
    default:
      return json({ ok: false, error: "unknown_action", actions: ["list", "state", "connect", "create", "logout"] }, 400);
  }
});
