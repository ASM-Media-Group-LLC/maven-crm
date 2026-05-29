// Handler de enrich_handle — descarga avatar IG (+ name/bio/followers)
// y lo escribe directo a `models.avatar_url`. A diferencia de
// enrich_profile (que actualiza scouter_leads), este job opera sobre
// el catálogo canónico `models` y se dispara cada vez que un handle
// NUEVO entra al sistema (LeadGen / Scouter manual / NuevoContacto).
//
// Idempotente: si el model ya tiene `avatar_url`, no rescrapea — la
// regla del producto es "una sola foto por modelo, primera vez gana"
// (Sprint 2026-05). Si hace falta refrescar, se hace manualmente.

import { sb } from "../db.ts";
import { checkBudget } from "../budget.ts";
import { runProfileScrape } from "../scrapecreators.ts";
import { persistIgPhoto } from "../storage.ts";
import type { EnrichHandlePayload, JobResult, ScouterJob } from "../types.ts";

// Limpia un input que puede venir como URL completa o con @ — devuelve
// el handle válido (alfanuméricos + . + _) o null si no se pudo extraer.
//
// MIN 3 chars: handles tipo "p", "a", "x" son spam o errores del LLG
// cargando datos. Antes pasaban a ScrapeCreators que los devolvía como
// "no encontrado" y consumían crédito. Filtramos antes.
function normalizeHandle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?(instagram|ig)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[^a-z0-9._].*$/, "");
  if (!/^[a-z0-9._]{3,30}$/.test(cleaned)) return null;
  return cleaned;
}

interface ModelRow {
  id: string;
  avatar_url: string | null;
}

export async function handleEnrichHandle(
  job: ScouterJob,
  payload: EnrichHandlePayload,
): Promise<JobResult> {
  const handle = normalizeHandle(payload.handle);
  if (!handle) {
    return { ok: false, message: `payload.handle inválido: "${payload.handle}"` };
  }
  const tenantId = payload.tenantId ?? job.tenant_id;

  // Buscar el model existente. Si no existe, lo creamos abajo después
  // del scrape — pero solo si el scrape devuelve datos (no queremos
  // crear models fantasma para handles que no existen en IG).
  const { data: existingRaw, error: lookupErr } = await sb
    .from("models")
    .select("id, avatar_url")
    .eq("tenant_id", tenantId)
    .eq("instagram_handle", handle)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  const existing = existingRaw as ModelRow | null;

  // Idempotencia: una sola foto por modelo. Si ya tiene avatar, skip.
  if (existing?.avatar_url) {
    return {
      ok: true,
      message: `Handle "${handle}" ya tiene avatar — skip (idempotent).`,
      data: { skipped: true, model_id: existing.id },
    };
  }

  const budget = await checkBudget(tenantId);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  const items = await runProfileScrape([handle], tenantId);
  const item = items[0];
  if (!item) {
    return {
      ok: false,
      message: `ScrapeCreators no devolvió datos para "${handle}" (cuenta privada / inexistente).`,
    };
  }

  // URL cruda de IG CDN expira en ~24-48h. Persistimos en nuestro
  // bucket scouter-avatars así models.avatar_url no caduca.
  const rawPhoto = item.profilePicUrlHD ?? item.profilePicUrl ?? null;
  const photo = await persistIgPhoto(rawPhoto, handle);
  const name = item.fullName ?? null;
  const bio = item.biography ?? null;
  const followers = item.followersCount ?? null;
  const verified = item.verified ?? null;
  const now = new Date().toISOString();

  if (existing) {
    // UPSERT por gap-fill — no pisamos data ya cargada por otros módulos,
    // solo llenamos campos que estén null.
    const patch: Record<string, unknown> = { last_scraped_at: now };
    if (photo) patch.avatar_url = photo; // SIEMPRE seteamos avatar — el guard arriba garantiza que no había uno.
    if (name) patch.display_name = name;
    if (bio) patch.bio = bio;
    if (followers != null) patch.followers_count = followers;
    if (verified != null) patch.is_verified = verified;
    const { error: updateErr } = await sb
      .from("models")
      .update(patch)
      .eq("id", existing.id);
    if (updateErr) throw updateErr;
    return {
      ok: true,
      message: `Avatar bajado para "${handle}" (${followers ?? "?"} followers).`,
      data: { model_id: existing.id, updated: true },
      apifyItemsProcessed: 1,
    };
  }

  // No existe model todavía — el cron sync_models_recent lo crea
  // después desde scouter_leads / leadgen / etc. Pero como ya scrapeamos
  // y tenemos avatar fresco, vale la pena adelantar la creación.
  const { data: created, error: insertErr } = await sb
    .from("models")
    .insert({
      tenant_id: tenantId,
      instagram_handle: handle,
      display_name: name,
      avatar_url: photo,
      bio: bio,
      is_verified: verified,
      followers_count: followers,
      last_scraped_at: now,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  return {
    ok: true,
    message: `Model "${handle}" creado con avatar (${followers ?? "?"} followers).`,
    data: { model_id: (created as { id: string }).id, inserted: true },
    apifyItemsProcessed: 1,
  };
}
