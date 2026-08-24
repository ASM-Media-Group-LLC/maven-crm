import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-sync-channels (S4) — trae las cuentas vinculadas del gateway (GET /accounts, apikey)
// y las upsertea en tg_channels, para que TODAS las líneas aparezcan como "canales"
// (filtro + etiqueta por fila + selector de línea del botón) aunque no hayan recibido un
// DM todavía. Preserva default_assignees y el label si Maven ya lo editó (solo backfillea
// el label cuando está vacío/igual al account_id). Auth: usuario + permiso Telegram/Cuentas.

const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");
const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (inbox v1 mono-tenant)

const cors = (req: Request) => corsFor(req);
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(req, { ok: false, error: "missing_auth" }, 401);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !userData?.user) return json(req, { ok: false, error: "invalid_token" }, 401);
  const { data: allowed } = await sb.rpc("has_permission", {
    _user_id: userData.user.id, _module: "Telegram", _submodule: "Cuentas",
  });
  if (!allowed) return json(req, { ok: false, error: "forbidden" }, 403);

  if (!GW_API_KEY) return json(req, { ok: false, error: "gateway_not_configured" }, 500);
  let accounts: { id: string; label?: string; username?: string }[] = [];
  try {
    const r = await fetch(`${GW_URL}/accounts`, { headers: { apikey: GW_API_KEY } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !(j as any)?.ok) return json(req, { ok: false, error: (j as any)?.error || `gateway ${r.status}` }, 200);
    accounts = (j as any).accounts ?? [];
  } catch (e) {
    return json(req, { ok: false, error: "gateway_unreachable: " + (e as Error).message }, 200);
  }

  // Upsert por account_id: NO piso default_assignees; el label solo lo backfilleo si el que
  // hay está vacío o es igual al account_id (así respeto un label editado a mano en Maven).
  const { data: existing } = await sb.from("tg_channels").select("account_id, label");
  const byId = new Map((existing ?? []).map((c: any) => [c.account_id, c.label as string | null]));
  let synced = 0;
  for (const a of accounts) {
    const id = String(a.id);
    const gwLabel = a.label || a.username || id;
    const cur = byId.get(id);
    if (cur === undefined) {
      await sb.from("tg_channels").insert({ tenant_id: TENANT_ID, account_id: id, label: gwLabel });
      synced++;
    } else if (!cur || cur === id) {
      await sb.from("tg_channels").update({ label: gwLabel, updated_at: new Date().toISOString() }).eq("account_id", id);
      synced++;
    }
  }
  return json(req, { ok: true, accounts: accounts.length, synced });
});
