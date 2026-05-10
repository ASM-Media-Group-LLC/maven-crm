// Handler de refresh_posts — agarra el handle del lead, scrapea sus
// últimos N posts via Apify, y guarda el resultado en
// scouter_leads.recent_posts. Solo se llama para leads high_fit
// (lo enquea score.ts cuando un lead se vuelve high_fit, y el cron
// semanal lo encola para refrescar los high_fit del pool).

import { sb } from "../db.ts";
import { runPostScrape } from "../scrapecreators.ts";
import type { JobResult, RefreshPostsPayload, ScouterJob } from "../types.ts";

interface LeadRow {
  id: string;
  instagram_handle: string;
  ai_status: string | null;
  tenant_id: string;
}

export async function handleRefreshPosts(
  job: ScouterJob,
  payload: RefreshPostsPayload,
): Promise<JobResult> {
  const leadId = payload.leadId;
  if (!leadId) {
    return { ok: false, message: "payload.leadId requerido." };
  }

  const { data: leadRaw, error: leadErr } = await sb
    .from("scouter_leads")
    .select("id, instagram_handle, ai_status, tenant_id")
    .eq("id", leadId)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();

  if (leadErr) throw leadErr;
  if (!leadRaw) return { ok: false, message: `Lead ${leadId} no encontrado en tenant.` };
  const lead = leadRaw as LeadRow;

  // Defensa: si el lead bajó de high_fit entre el momento que se
  // enqueó este job y ahora, no gastamos Apify.
  if (lead.ai_status !== "high_fit") {
    return {
      ok: true,
      message: `Lead ${lead.instagram_handle} ya no es high_fit (ai_status=${lead.ai_status}), skip.`,
      data: { skipped: true },
    };
  }

  let posts;
  try {
    posts = await runPostScrape(lead.instagram_handle, lead.tenant_id);
  } catch (e) {
    const msg = (e as Error).message ?? "Error desconocido";
    // Errores de quota/rate-limit los dejamos burbujear para que el
    // dispatcher haga retry/quota-handling como en otros jobs Apify.
    throw new Error(`ScrapeCreators post scrape falló: ${msg}`);
  }

  // Aunque vengan 0 posts (cuenta privada / borró todo), guardamos []
  // para marcar que ya intentamos. El consumer (scouter-generate-tasks)
  // trata array vacío igual que NULL → fallback a bio.
  const { error: updateErr } = await sb
    .from("scouter_leads")
    .update({ recent_posts: posts })
    .eq("id", lead.id);
  if (updateErr) throw updateErr;

  return {
    ok: true,
    message: `${posts.length} posts guardados para ${lead.instagram_handle}.`,
    data: { posts_count: posts.length },
    apifyItemsProcessed: posts.length,
  };
}
