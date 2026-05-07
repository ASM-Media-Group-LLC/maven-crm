// Handler de score_lead — toma un lead existente, lo manda al scorer LLM,
// escribe ai_score / ai_status / ai_reason. No hace network/Apify; solo
// LLM call. Si el resultado es high_fit, también inserta una notificación
// en scouter_notifications para que la UI alerte al equipo.

import { sb } from "../db.ts";
import { scoreLead, type ScoreLeadInput } from "../llm.ts";
import { analyzeLook } from "../vision.ts";
import type { JobResult, ScoreLeadPayload, ScouterJob } from "../types.ts";

// Rango "borderline" — leads que por followers solos no pasarían
// pero podrían entrar si tienen buen look. Default 5k-15k para
// agencias de fichaje agresivo. Override por env y eventualmente
// por tenant via scouter_companies.search_config.
//
// Por debajo de MIN no gastamos tokens de vision (descarte hard).
// Por encima de MAX el score por texto ya alcanza, no hace falta foto.
const BORDERLINE_MIN_FOLLOWERS = parseInt(
  process.env.BORDERLINE_MIN_FOLLOWERS ?? "5000",
  10,
);
const BORDERLINE_MAX_FOLLOWERS = parseInt(
  process.env.BORDERLINE_MAX_FOLLOWERS ?? "15000",
  10,
);
// Si la vision tira ≥ este threshold, upgradeamos un low_fit a
// medium_fit (compensa pocos followers con buen look).
const LOOK_UPGRADE_THRESHOLD = parseFloat(
  process.env.LOOK_UPGRADE_THRESHOLD ?? "7.0",
);
// Si la vision tira < este threshold, NO upgradeamos (look débil
// no compensa los pocos followers).
const LOOK_KEEP_THRESHOLD = parseFloat(
  process.env.LOOK_KEEP_THRESHOLD ?? "5.0",
);

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
  photo_data_url: string | null;
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
      "id, instagram_handle, name, bio, followers, verified, category, link_in_bio_platform, country, tenant_id, photo_data_url",
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
  let finalScore = result.score;
  let finalStatus = result.status;
  let finalReason = result.reason;
  let lookScore: number | null = null;

  // ─── Vision step (solo borderline 5k-15k followers) ────────────────────
  // Si el lead cae en la franja borderline Y tenemos foto, corremos
  // analyzeLook. Si el look es alto, podemos rescatarlo de low_fit.
  // Si es bajo, mantenemos el score de texto sin tocar.
  const followers = lead.followers ?? 0;
  const isBorderline =
    followers >= BORDERLINE_MIN_FOLLOWERS &&
    followers <= BORDERLINE_MAX_FOLLOWERS;

  if (isBorderline && lead.photo_data_url) {
    const vision = await analyzeLook(lead.photo_data_url);
    lookScore = vision.look_score;

    if (
      result.status === "low_fit" &&
      lookScore !== null &&
      lookScore >= LOOK_UPGRADE_THRESHOLD
    ) {
      finalStatus = "medium_fit";
      finalScore = Math.max(result.score, 5.0); // bump al mínimo de medium
      finalReason = `${result.reason} | look_score ${lookScore.toFixed(1)} compensa followers — upgrade a medium_fit (${vision.reason})`;
    } else if (lookScore !== null && lookScore < LOOK_KEEP_THRESHOLD) {
      finalReason = `${result.reason} | look_score ${lookScore.toFixed(1)} (look débil, no upgrade)`;
    } else if (lookScore !== null) {
      finalReason = `${result.reason} | look_score ${lookScore.toFixed(1)}`;
    }
  }

  const { error: updateErr } = await sb
    .from("scouter_leads")
    .update({
      ai_score: finalScore,
      ai_status: finalStatus,
      ai_reason: finalReason,
      look_score: lookScore,
    })
    .eq("id", lead.id);
  if (updateErr) throw updateErr;

  // Side effect: si quedó high_fit (post-vision), broadcast a la inbox
  // del tenant y encolamos un refresh_posts para enriquecer recent_posts.
  if (finalStatus === "high_fit") {
    const { error: notifErr } = await sb.from("scouter_notifications").insert({
      kind: "lead_high_fit",
      tenant_id: lead.tenant_id,
      payload: {
        lead_id: lead.id,
        instagram_handle: lead.instagram_handle,
        score: finalScore,
        reason: finalReason,
      },
    });
    if (notifErr) console.error("notif insert error", notifErr);

    const { error: enqueueErr } = await sb.from("scouter_jobs").insert({
      kind: "refresh_posts",
      tenant_id: lead.tenant_id,
      payload: { leadId: lead.id },
      priority: 3,
    });
    if (enqueueErr) console.error("refresh_posts enqueue error", enqueueErr);
  }

  const visionInfo = lookScore !== null ? ` look=${lookScore.toFixed(1)}` : "";
  return {
    ok: true,
    message: `Lead ${lead.instagram_handle} scoreado ${finalScore.toFixed(1)}/10 (${finalStatus})${visionInfo}.`,
    data: {
      score: finalScore,
      status: finalStatus,
      reason: finalReason,
      look_score: lookScore,
    },
  };
}
