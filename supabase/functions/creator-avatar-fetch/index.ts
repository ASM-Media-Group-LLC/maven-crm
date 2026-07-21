import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// creator-avatar-fetch — foto de perfil de UNA creadora, ON-DEMAND desde el perfil.
// Dos modos (el frontend elige):
//
//   1) INSTAGRAM  (JSON: { creator_id })
//      Trae la foto de IG vía el actor de PERFIL de Apify (proxies suyos → CERO riesgo
//      de ban para nuestras cuentas), IGUAL que el cron creators-avatar-sync.
//
//   2) SUBIDA MANUAL  (multipart/form-data: creator_id + file)
//      Sube la imagen que eligió el usuario (JPG/PNG/WebP, ≤5 MB).
//
// En ambos: la imagen se guarda DURABLE en el bucket público `creator-avatars` y se
// setea creators.profile_photo_url. La escritura al bucket va por service_role (el
// bucket sigue cerrado a escritura pública), y la función devuelve la URL final para
// refrescar la UI al instante. verify_jwt = true (default): sólo usuarios logueados.

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const BUCKET = "creator-avatars";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const norm = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

const extFor = (mime: string): string => mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";

// Sube bytes al bucket, setea profile_photo_url y devuelve la URL final (con
// cache-buster). El path es estable por creadora → un re-upload pisa el anterior;
// el ?t= evita que el CDN/navegador sirva la foto vieja cacheada.
async function saveAvatar(sb: any, creatorId: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const path = `${TENANT_ID}/${creatorId}.${extFor(mime)}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (error) { console.error("upload avatar:", error.message); return null; }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return null;
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: uErr } = await sb.from("creators").update({ profile_photo_url: url }).eq("id", creatorId);
  if (uErr) { console.error("update creator:", uErr.message); return null; }
  return url;
}

async function fetchIgBytes(handle: string): Promise<{ bytes: Uint8Array; mime: string } | { error: string; status: number }> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return { error: "APIFY_TOKEN no configurado", status: 500 };

  const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [handle], resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
  });
  if (!resp.ok) return { error: `Apify respondió ${resp.status}`, status: 502 };

  const items = await resp.json().catch(() => []) as any[];
  let pic: string | null = null;
  for (const it of (Array.isArray(items) ? items : [])) {
    if (it?.error === "not_found") return { error: `La cuenta @${handle} no existe o está rota en Instagram`, status: 404 };
    const p = it?.profilePicUrlHD ?? it?.profilePicUrl ?? null;
    if (p) { pic = String(p); break; }
  }
  if (!pic) return { error: "No se pudo obtener la foto (cuenta privada o sin foto de perfil)", status: 502 };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  const img = await fetch(pic, { signal: ac.signal }).catch(() => null);
  clearTimeout(t);
  if (!img || !img.ok) return { error: "No se pudo descargar la imagen de Instagram", status: 502 };
  const mime = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  const bytes = new Uint8Array(await img.arrayBuffer());
  return { bytes, mime };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const contentType = req.headers.get("content-type") || "";

    // ── Modo SUBIDA MANUAL (multipart) ──────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const creatorId = String(form.get("creator_id") ?? "").trim();
      const file = form.get("file");
      if (!creatorId) return json({ ok: false, error: "creator_id requerido" }, 400);
      if (!(file instanceof File)) return json({ ok: false, error: "Archivo requerido" }, 400);
      const mime = (file.type || "").split(";")[0];
      if (!ALLOWED_MIME.includes(mime)) return json({ ok: false, error: "Formato no válido (usá JPG, PNG o WebP)" }, 400);
      if (file.size > MAX_BYTES) return json({ ok: false, error: "La imagen supera los 5 MB" }, 400);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = await saveAvatar(sb, creatorId, bytes, mime);
      if (!url) return json({ ok: false, error: "No se pudo guardar la imagen" }, 502);
      return json({ ok: true, profile_photo_url: url });
    }

    // ── Modo INSTAGRAM (JSON) ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as { creator_id?: string };
    const creatorId = String(body.creator_id ?? "").trim();
    if (!creatorId) return json({ ok: false, error: "creator_id requerido" }, 400);

    const { data: creator, error } = await sb.from("creators")
      .select("id, instagram_handle").eq("id", creatorId).maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!creator) return json({ ok: false, error: "Creadora no encontrada" }, 404);

    const handle = norm(creator.instagram_handle);
    if (!handle) return json({ ok: false, error: "Esta creadora no tiene Instagram configurado" }, 400);

    const ig = await fetchIgBytes(handle);
    if ("error" in ig) return json({ ok: false, error: ig.error }, ig.status);

    const url = await saveAvatar(sb, creatorId, ig.bytes, ig.mime);
    if (!url) return json({ ok: false, error: "No se pudo guardar la imagen" }, 502);
    return json({ ok: true, profile_photo_url: url, handle });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "Error interno" }, 500);
  }
});
