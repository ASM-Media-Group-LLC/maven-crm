// Handlers de discovery: discover_seed (lista explícita de @handles) y
// discover_hashtag (autores que postean con un hashtag). Ambos terminan
// llamando a runProfileScrape para enriquecer y luego upsert a
// scouter_leads. Cada lead nuevo enqueua automáticamente un score_lead
// para que el LLM lo califique.

import { sb } from "../db.ts";
import { checkBudget } from "../budget.ts";
import { runHashtagDiscovery, runProfileScrape } from "../apify.ts";
import type {
  DiscoverHashtagPayload,
  DiscoverSeedPayload,
  JobResult,
  ScouterJob,
} from "../types.ts";

interface ProfileItem {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  verified?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  externalUrl?: string;
}

const DEFAULT_MAX_LEADS = 30;

// Heurística rápida para detectar la plataforma del link in bio.
// Mismo patrón que kash usaba para pre-rank antes del scorer LLM.
function detectLinkInBio(externalUrl?: string | null): string | null {
  if (!externalUrl) return null;
  const u = externalUrl.toLowerCase();
  if (u.includes("linktr.ee")) return "Linktree";
  if (u.includes("beacons.")) return "Beacons";
  if (u.includes("stan.store") || u.includes("stanstore.")) return "Stan";
  if (u.includes("allmylinks")) return "AllMyLinks";
  if (u.includes("koji.to") || u.includes("withkoji")) return "Koji";
  if (u.includes("onlyfans.com")) return "Direct OF";
  return "Other";
}

async function persistProfilesAsLeads(
  items: ProfileItem[],
  tenantId: string,
  companyId: string | null,
  discoverySource: string,
): Promise<{ inserted: number; updated: number; leadIds: string[] }> {
  const leadIds: string[] = [];
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const handle = item.username?.trim().toLowerCase();
    if (!handle) continue;

    const linkPlatform = detectLinkInBio(item.externalUrl);
    const photo = item.profilePicUrlHD ?? item.profilePicUrl ?? null;

    // Upsert por (company_id, instagram_handle) — UNIQUE constraint.
    // Si ya existía, refrescamos followers/bio/etc. pero NO pisamos
    // ai_score / status — esos los maneja score_lead.
    const upsertPayload = {
      company_id: companyId,
      instagram_handle: handle,
      instagram_url: item.url ?? `https://www.instagram.com/${handle}/`,
      name: item.fullName ?? null,
      bio: item.biography ?? null,
      followers: item.followersCount ?? null,
      verified: item.verified ?? false,
      photo_data_url: photo,
      link_in_bio_platform: linkPlatform,
      discovery_source: discoverySource,
      tenant_id: tenantId,
    };

    const { data, error } = await sb
      .from("scouter_leads")
      .upsert(upsertPayload, { onConflict: "company_id,instagram_handle" })
      .select("id, ai_score")
      .single();

    if (error) {
      console.error("upsert lead error", handle, error);
      continue;
    }
    const row = data as { id: string; ai_score: number | null };
    leadIds.push(row.id);
    if (row.ai_score == null) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated, leadIds };
}

async function enqueueScoreJobs(leadIds: string[], tenantId: string): Promise<void> {
  if (leadIds.length === 0) return;
  const rows = leadIds.map((leadId) => ({
    kind: "score_lead",
    status: "queued",
    tenant_id: tenantId,
    payload: { leadId },
    priority: 5, // por encima del default — queremos scorear leads frescos
  }));
  const { error } = await sb.from("scouter_jobs").insert(rows);
  if (error) console.error("enqueueScoreJobs error", error);
}

export async function handleDiscoverSeed(
  job: ScouterJob,
  payload: DiscoverSeedPayload,
): Promise<JobResult> {
  const seeds = (payload.seeds ?? []).filter((s) => typeof s === "string" && s.trim());
  if (seeds.length === 0) {
    return { ok: false, message: "payload.seeds vacío." };
  }
  const max = Math.min(payload.maxLeads ?? DEFAULT_MAX_LEADS, seeds.length);

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  const items = (await runProfileScrape(seeds.slice(0, max), job.tenant_id)) as ProfileItem[];
  const { inserted, updated, leadIds } = await persistProfilesAsLeads(
    items,
    job.tenant_id,
    job.company_id,
    "seed",
  );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  return {
    ok: true,
    message: `discover_seed: ${inserted} nuevos, ${updated} actualizados.`,
    data: { inserted, updated, leadIds },
    apifyItemsProcessed: items.length,
  };
}

export async function handleDiscoverHashtag(
  job: ScouterJob,
  payload: DiscoverHashtagPayload,
): Promise<JobResult> {
  const hashtag = payload.hashtag?.trim().replace(/^#/, "");
  if (!hashtag) return { ok: false, message: "payload.hashtag requerido." };
  const max = payload.maxLeads ?? DEFAULT_MAX_LEADS;

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  // 1) Descubrir autores del hashtag.
  const authors = await runHashtagDiscovery(hashtag, job.tenant_id, max);
  if (authors.length === 0) {
    return { ok: true, message: `hashtag #${hashtag}: 0 autores`, data: { authors: 0 } };
  }

  // 2) Re-checar budget — el hashtag run consumió crédito ya.
  const budget2 = await checkBudget(job.tenant_id);
  if (!budget2.ok) {
    return {
      ok: true,
      message: `discover_hashtag #${hashtag}: ${authors.length} autores encontrados, profile scrape pospuesto (${budget2.reason}).`,
      data: { authorsFound: authors.length, leadsPersisted: 0 },
    };
  }

  // 3) Enriquecer perfiles + persistir.
  const usernames = authors.map((a) => a.username);
  const items = (await runProfileScrape(usernames, job.tenant_id)) as ProfileItem[];
  const { inserted, updated, leadIds } = await persistProfilesAsLeads(
    items,
    job.tenant_id,
    job.company_id,
    `hashtag:${hashtag}`,
  );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  return {
    ok: true,
    message: `discover_hashtag #${hashtag}: ${inserted} nuevos, ${updated} actualizados.`,
    data: { authorsFound: authors.length, inserted, updated },
    apifyItemsProcessed: authors.length + items.length,
  };
}
