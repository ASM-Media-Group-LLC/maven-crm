// Handler de score_lead — toma un lead existente, lo manda al scorer LLM,
// escribe ai_score / ai_status / ai_reason. No hace network/Apify; solo
// LLM call. Si el resultado es high_fit, también inserta una notificación
// en scouter_notifications para que la UI alerte al equipo.

import { sb } from "../db.ts";
import { scoreLead, type ScoreLeadInput } from "../llm.ts";
import type { JobResult, ScoreLeadPayload, ScouterJob } from "../types.ts";

interface LeadRow {
  id: string;
  instagram_handle: string;
  name: string | null;
  bio: string | null;
  followers: number | null;
  verified: boolean;
  category: string | null;
  link_in_bio_platform: string | null;
  country: string | null;
  tenant_id: string;
}

export async function handleScoreLead(
  job: ScouterJob,
  payload: ScoreLeadPayload,
): Promise<JobResult> {
  const leadId = payload.leadId;
  if (!leadId) {
    return { ok: false, message: "payload.leadId requerido." };
  }

  const { data: leadRaw, error: leadErr } = await sb
    .from("scouter_leads")
    .select(
      "id, instagram_handle, name, bio, followers, verified, category, link_in_bio_platform, country, tenant_id",
    )
    .eq("id", leadId)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();

  if (leadErr) throw leadErr;
  if (!leadRaw) return { ok: false, message: `Lead ${leadId} no encontrado en tenant.` };

  const lead = leadRaw as LeadRow;
  const input: ScoreLeadInput = {
    username: lead.instagram_handle,
    fullName: lead.name,
    bio: lead.bio,
    followers: lead.followers,
    verified: lead.verified,
    category: lead.category,
    linkInBioPlatform: lead.link_in_bio_platform,
    country: lead.country,
  };

  const result = await scoreLead(input);

  const { error: updateErr } = await sb
    .from("scouter_leads")
    .update({
      ai_score: result.score,
      ai_status: result.status,
      ai_reason: result.reason,
    })
    .eq("id", lead.id);
  if (updateErr) throw updateErr;

  // Side effect: si quedó high_fit, broadcast a la inbox del tenant
  // y encolamos un refresh_posts para enriquecer recent_posts via
  // Apify. El handler refresh_posts se asegura de skip si el lead
  // perdió el status high_fit antes de que se ejecute.
  if (result.status === "high_fit") {
    const { error: notifErr } = await sb.from("scouter_notifications").insert({
      kind: "lead_high_fit",
      tenant_id: lead.tenant_id,
      payload: {
        lead_id: lead.id,
        instagram_handle: lead.instagram_handle,
        score: result.score,
        reason: result.reason,
      },
    });
    if (notifErr) console.error("notif insert error", notifErr);

    const { error: enqueueErr } = await sb.from("scouter_jobs").insert({
      kind: "refresh_posts",
      tenant_id: lead.tenant_id,
      payload: { leadId: lead.id },
      // Prioridad media — no urgente como un score nuevo, pero antes
      // que un discovery batch.
      priority: 3,
    });
    if (enqueueErr) console.error("refresh_posts enqueue error", enqueueErr);
  }

  return {
    ok: true,
    message: `Lead ${lead.instagram_handle} scoreado ${result.score}/10 (${result.status}).`,
    data: { ...result },
  };
}
