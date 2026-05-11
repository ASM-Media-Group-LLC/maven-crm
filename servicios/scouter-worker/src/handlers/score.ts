// Handler de score_lead — toma un lead existente, lo manda al scorer LLM,
// escribe ai_score / ai_status / ai_reason. No hace network/Apify; solo
// LLM call. Si el resultado es high_fit, también inserta una notificación
// en scouter_notifications para que la UI alerte al equipo.

import { sb } from "../db.ts";
import { scoreLead, type ScoreLeadInput, type ScoreLeadCompanyConfig } from "../llm.ts";
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
  company_id: string | null;
  photo_data_url: string | null;
}

interface CompanyRow {
  id: string;
  search_config: {
    target_countries?: string[];
    target_gender?: "male" | "female" | "any";
    profile_tier?: string | null;
    followers_max?: number | null;
    followers_min?: number | null;
    geo_targets?: string[];
    bio_keywords?: string[];
    exclude_keywords?: string[];
    content_type?: string | null;
    scoring_notes?: string | null;
  } | null;
}

// Lee TODA la config de scoring de la compañía y la pasa al LLM. La
// idea: el user puso esos filtros expresamente, el scorer tiene que
// aplicarlos. Antes solo le pasábamos 4 campos y el LLM ignoraba
// exclude_keywords / bio_keywords / followers_max — que son donde
// el user gastó tiempo configurando lo que quiere.
async function fetchScoringConfig(
  companyId: string | null,
): Promise<ScoreLeadCompanyConfig | null> {
  if (!companyId) return null;
  const { data, error } = await sb
    .from("scouter_companies")
    .select("id, search_config")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as CompanyRow;
  const cfg = row.search_config ?? {};
  return {
    target_countries: cfg.target_countries ?? null,
    target_gender: cfg.target_gender ?? null,
    profile_tier: cfg.profile_tier ?? null,
    followers_max: typeof cfg.followers_max === "number" ? cfg.followers_max : null,
    followers_min: typeof cfg.followers_min === "number" ? cfg.followers_min : null,
    geo_targets: cfg.geo_targets ?? null,
    bio_keywords: cfg.bio_keywords ?? null,
    exclude_keywords: cfg.exclude_keywords ?? null,
    content_type: cfg.content_type ?? null,
    scoring_notes: cfg.scoring_notes ?? null,
  };
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
      "id, instagram_handle, name, bio, followers, verified, category, link_in_bio_platform, country, tenant_id, company_id, photo_data_url",
    )
    .eq("id", leadId)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();

  if (leadErr) throw leadErr;
  if (!leadRaw) return { ok: false, message: `Lead ${leadId} no encontrado en tenant.` };

  const lead = leadRaw as LeadRow;
  // Fetcheamos los filtros de la compañía para que el scorer pueda
  // aplicar deal-breakers (sin país, género opuesto, brand-no-humano).
  const companyConfig = await fetchScoringConfig(lead.company_id);

  const input: ScoreLeadInput = {
    username: lead.instagram_handle,
    fullName: lead.name,
    bio: lead.bio,
    followers: lead.followers,
    verified: lead.verified,
    category: lead.category,
    linkInBioPlatform: lead.link_in_bio_platform,
    country: lead.country,
    companyConfig,
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

  // Embedding + lookalike (fire-and-forget). Después del embed, corremos
  // el router cross-compañía: el RPC scouter_route_lead rankea TODAS las
  // compañías activas del tenant por fit (embedding cosine + heurística
  // bio_keywords/exclude/followers_max/target_countries) y reasignamos
  // company_id + target_companies según el resultado.
  void (async () => {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) return;

      // 1) Embed
      const embedRes = await fetch(`${supabaseUrl}/functions/v1/scouter-embed-leads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lead_ids: [lead.id] }),
      });
      if (!embedRes.ok) {
        const txt = await embedRes.text().catch(() => "");
        console.warn("[score-lead] embed-leads failed", embedRes.status, txt.slice(0, 200));
        // No bloqueamos el router — el RPC tiene fallback heurístico si
        // el lead no tiene embedding.
      }

      // 2) Router cross-compañía
      const { data: routes, error: routeErr } = await sb.rpc("scouter_route_lead", {
        p_lead_id: lead.id,
      });
      if (routeErr) {
        console.warn("[score-lead] route_lead RPC failed:", routeErr.message);
        return;
      }
      const ranking = (routes ?? []) as Array<{
        company_id: string;
        company_slug: string;
        score: number;
        method: string;
      }>;
      if (ranking.length === 0) return;

      // Threshold para entrar a target_companies. 0.55 funciona bien para
      // similarity de embeddings (rangos típicos 0.5-0.9) y para keywords
      // normalizado (0-1). Por encima → la compañía es candidata real.
      const SECONDARY_THRESHOLD = 0.55;
      const best = ranking[0];
      if (!best) return;
      // Si TODAS las compañías candidatas tienen score 0 (caso típico
      // cuando las otras compañías no tienen search_config), mantenemos
      // el company_id actual del discovery — no movemos al lead.
      if (best.score <= 0) {
        console.log(`[score-lead] router: ${lead.instagram_handle} sin matches >0, mantengo company actual`);
        return;
      }

      const targetSlugs = ranking
        .filter((r) => r.score >= SECONDARY_THRESHOLD)
        .map((r) => r.company_slug);

      // Update solo si la mejor compañía cambia respecto a la actual.
      // Eso evita escrituras innecesarias cuando el discovery ya
      // asignó la correcta.
      const { error: upErr } = await sb
        .from("scouter_leads")
        .update({
          company_id: best.company_id,
          target_companies: targetSlugs,
        })
        .eq("id", lead.id);
      if (upErr) {
        console.warn("[score-lead] router update failed:", upErr.message);
      } else {
        console.log(
          `[score-lead] router: ${lead.instagram_handle} → ${best.company_slug} (${best.score.toFixed(2)}, ${best.method}), targets=${targetSlugs.join(",") || "—"}`,
        );
      }
    } catch (e) {
      console.warn("[score-lead] router exception:", (e as Error).message);
    }
  })();

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
