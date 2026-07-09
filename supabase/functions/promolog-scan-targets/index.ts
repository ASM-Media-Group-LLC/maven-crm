// promolog-scan-targets — le da a la extensión la lista de creadoras activas a
// escanear en IG: handle + (si está cacheado) el user-id numérico. Si no hay id, la
// extensión lo resuelve sola desde el navegador (web_profile_info). Read-only.
// Auth: header `x-ext-token` == secret PROMOLOG_EXT_TOKEN. Deploy --no-verify-jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ext-token",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const EXT_TOKEN = Deno.env.get("PROMOLOG_EXT_TOKEN");
  if (!EXT_TOKEN || req.headers.get("x-ext-token") !== EXT_TOKEN) return json({ error: "unauthorized" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Activas elegibles (misma vista que el resto de Promolog).
  const { data: creators, error } = await (sb as any)
    .from("v_promolog_eligible_creators").select("id, instagram_handle, name, artistic_name");
  if (error) return json({ error: error.message }, 500);

  // ids cacheados (para que la extensión no tenga que resolverlos).
  const ids = (creators ?? []).map((c: any) => c.id);
  const idByCreator = new Map<string, string>();
  if (ids.length) {
    const { data: cached } = await (sb as any).from("promolog_ig_identity").select("creator_id, ig_user_id").in("creator_id", ids);
    for (const r of (cached ?? [])) idByCreator.set(r.creator_id, r.ig_user_id);
  }

  const targets = (creators ?? [])
    .map((c: any) => ({ creator_id: c.id, handle: norm(c.instagram_handle), ig_user_id: idByCreator.get(c.id) ?? null,
      name: c.artistic_name || c.name }))
    .filter((t: any) => t.handle);

  return json({ ok: true, count: targets.length, targets });
});
