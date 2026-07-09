import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// creators-avatar-sync — trae la FOTO DE PERFIL de IG de las creadoras activas y la
// guarda DURABLE en el bucket `creator-avatars` (público), seteando
// creators.profile_photo_url. Usa el actor de PERFIL de Apify (proxies suyos → CERO
// riesgo de ban para nuestras cuentas). La URL de IG (cdninstagram) caduca, por eso
// BAJAMOS la imagen y la subimos al bucket (no guardamos el link de IG).
//
// Body: { refresh?:bool (re-baja TODAS), limit?:int, only_handles?:[...] }.
// Default (body vacío, como lo llama el cron): solo las activas SIN foto → idempotente
// y barato (los días sin altas nuevas procesa 0). Deploy --no-verify-jwt.

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const BUCKET = "creator-avatars";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const BATCH = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}
const norm = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

async function persistAvatar(sb: any, imageUrl: string, creatorId: string): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const resp = await fetch(imageUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0];
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const path = `${TENANT_ID}/${creatorId}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (error) { console.error("upload avatar:", error.message); return null; }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (e) { console.error("persistAvatar:", (e as Error).message); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return json({ ok: false, error: "APIFY_TOKEN no configurado" }, 500);
  const body = await req.json().catch(() => ({})) as { refresh?: boolean; limit?: number; only_handles?: string[] };
  const sb = adminClient();

  const { data: creators, error } = await sb.from("creators")
    .select("id, instagram_handle, profile_photo_url")
    .eq("status", "active")
    .not("instagram_handle", "is", null).neq("instagram_handle", "");
  if (error) return json({ ok: false, error: error.message }, 500);

  let list = (creators ?? []).filter((c: any) => norm(c.instagram_handle));
  if (body.only_handles?.length) {
    const want = new Set(body.only_handles.map(norm));
    list = list.filter((c: any) => want.has(norm(c.instagram_handle)));
  } else if (!body.refresh) {
    // DEFAULT: solo las que NO tienen foto (o quedó vacía). Idempotente.
    list = list.filter((c: any) => !String(c.profile_photo_url ?? "").trim());
  }
  const limit = Number(body.limit ?? 40);
  list = list.slice(0, limit);
  if (!list.length) return json({ ok: true, processed: 0, note: "nada que actualizar" });

  // handle → creator (dedup por handle)
  const byHandle = new Map<string, { id: string }>();
  for (const c of list) { const h = norm(c.instagram_handle); if (h && !byHandle.has(h)) byHandle.set(h, { id: c.id }); }
  const handles = [...byHandle.keys()];

  // Resolver perfiles (con foto) por lotes vía el actor de PERFIL de Apify.
  const picByHandle = new Map<string, string>();
  const broken: string[] = [];
  for (let i = 0; i < handles.length; i += BATCH) {
    const batch = handles.slice(i, i + BATCH);
    try {
      const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: batch, resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
      });
      if (!resp.ok) continue;
      const items = await resp.json().catch(() => []) as any[];
      for (const it of (Array.isArray(items) ? items : [])) {
        const u = norm(it?.username ?? it?.inputUrl ?? it?.url ?? "");
        if (!u) continue;
        if (it?.error === "not_found") { broken.push(u); continue; }
        const pic = it?.profilePicUrlHD ?? it?.profilePicUrl ?? null;
        if (pic) picByHandle.set(u, String(pic));
      }
    } catch (e) { console.error("apify batch:", (e as Error).message); }
  }

  // Bajar + guardar + setear profile_photo_url por creadora.
  let updated = 0, noPic = 0, dlFail = 0;
  const results: unknown[] = [];
  for (const [handle, c] of byHandle) {
    const pic = picByHandle.get(handle);
    if (!pic) { noPic++; results.push({ handle, outcome: broken.includes(handle) ? "handle_roto" : "sin_foto" }); continue; }
    const durable = await persistAvatar(sb, pic, c.id);
    if (!durable) { dlFail++; results.push({ handle, outcome: "descarga_fallo" }); continue; }
    const { error: uErr } = await sb.from("creators").update({ profile_photo_url: durable }).eq("id", c.id);
    if (uErr) { results.push({ handle, outcome: "update_fallo", error: uErr.message }); continue; }
    updated++; results.push({ handle, outcome: "ok" });
  }

  return json({ ok: true, candidates: list.length, updated, no_pic: noPic, download_failed: dlFail, results: results.slice(0, 60) });
});
