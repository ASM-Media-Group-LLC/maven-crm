// Handler de enrich_profile — refresca followers/bio/etc. de un lead
// existente sin tocar su ai_score. Útil para keep-fresh: si un lead
// quedó en "candidate" hace meses, re-tirar este job antes de
// contactarlo para tener datos actuales.

import { sb } from "../db.ts";
import { checkBudget } from "../budget.ts";
import { runProfileScrape } from "../apify.ts";
import type { EnrichProfilePayload, JobResult, ScouterJob } from "../types.ts";

interface LeadRow {
  id: string;
  instagram_handle: string;
  tenant_id: string;
}

interface ProfileItem {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  verified?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  externalUrl?: string;
}

export async function handleEnrichProfile(
  job: ScouterJob,
  payload: EnrichProfilePayload,
): Promise<JobResult> {
  const leadId = payload.leadId;
  if (!leadId) return { ok: false, message: "payload.leadId requerido." };

  const { data: leadRaw, error: leadErr } = await sb
    .from("scouter_leads")
    .select("id, instagram_handle, tenant_id")
    .eq("id", leadId)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!leadRaw) return { ok: false, message: `Lead ${leadId} no encontrado.` };

  const lead = leadRaw as LeadRow;

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  const items = (await runProfileScrape([lead.instagram_handle], job.tenant_id)) as ProfileItem[];
  const item = items[0];
  if (!item) return { ok: false, message: `Apify no devolvió datos para ${lead.instagram_handle}.` };

  const photo = item.profilePicUrlHD ?? item.profilePicUrl ?? null;
  const { error: updateErr } = await sb
    .from("scouter_leads")
    .update({
      name: item.fullName ?? null,
      bio: item.biography ?? null,
      followers: item.followersCount ?? null,
      verified: item.verified ?? false,
      photo_data_url: photo,
    })
    .eq("id", lead.id);
  if (updateErr) throw updateErr;

  return {
    ok: true,
    message: `Lead ${lead.instagram_handle} enriquecido (${item.followersCount ?? "?"} followers).`,
    apifyItemsProcessed: items.length,
  };
}
