import { corsFor } from "../_shared/cors.ts";
// scouter-embed-leads — compute embeddings (Gemini text-embedding-004,
// 768 dims) para los leads que se le pasen, los guarda en
// scouter_leads.embedding, y luego computa lookalike_score /
// lookalike_seed_handle vía RPC scouter_top_seed_match.
//
// Por qué Gemini: ya tenemos GEMINI_API_KEY configurada para el scoring
// del worker, así reusamos la misma cuenta/factura sin agregar OpenAI.
//
// Body: { lead_ids: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

const buildEmbeddingText = (lead: {
  instagram_handle: string;
  name: string | null;
  bio: string | null;
  followers: number | null;
  link_in_bio_platform: string | null;
  country: string | null;
  category: string | null;
}): string => {
  const followersBucket = (() => {
    const f = lead.followers ?? 0;
    if (f < 1000) return "menos de 1k seguidores";
    if (f < 10000) return "1k-10k seguidores";
    if (f < 50000) return "10k-50k seguidores";
    if (f < 100000) return "50k-100k seguidores";
    if (f < 500000) return "100k-500k seguidores";
    if (f < 1000000) return "500k-1M seguidores";
    return "más de 1M seguidores";
  })();
  const parts = [
    `Modelo de Instagram @${lead.instagram_handle}.`,
    lead.name ? `Nombre: ${lead.name}.` : null,
    lead.bio ? `Bio: ${lead.bio}` : null,
    lead.country ? `País: ${lead.country}.` : null,
    lead.category ? `Categoría: ${lead.category}.` : null,
    lead.link_in_bio_platform ? `Plataforma externa: ${lead.link_in_bio_platform}.` : null,
    followersBucket,
  ].filter(Boolean);
  return parts.join(" ");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, 401, { error: "Unauthorized" });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json(req, 500, { error: "GEMINI_API_KEY no configurada" });

    const body = (await req.json().catch(() => null)) as
      | { lead_ids?: unknown }
      | null;
    if (!body) return json(req, 400, { error: "Body inválido" });
    const leadIds = Array.isArray(body.lead_ids)
      ? (body.lead_ids as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (leadIds.length === 0) return json(req, 400, { error: "lead_ids vacío" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: leadsData, error: leadsErr } = await admin
      .from("scouter_leads")
      .select(
        "id, instagram_handle, name, bio, followers, link_in_bio_platform, country, category, company_id, discovery_source",
      )
      .in("id", leadIds);
    if (leadsErr) return json(req, 500, { error: leadsErr.message });
    const leads = (leadsData ?? []) as Array<{
      id: string;
      instagram_handle: string;
      name: string | null;
      bio: string | null;
      followers: number | null;
      link_in_bio_platform: string | null;
      country: string | null;
      category: string | null;
      company_id: string | null;
      discovery_source: string | null;
    }>;
    if (leads.length === 0) return json(req, 200, { embedded: 0 });

    // Gemini batchEmbedContents soporta hasta 100 inputs por request.
    // Si nos mandan más, los partimos en chunks.
    const CHUNK = 100;
    let totalEmbedded = 0;
    for (let start = 0; start < leads.length; start += CHUNK) {
      const slice = leads.slice(start, start + CHUNK);
      const requests = slice.map((lead) => ({
        model: "models/text-embedding-004",
        content: { parts: [{ text: buildEmbeddingText(lead) }] },
        taskType: "SEMANTIC_SIMILARITY",
      }));
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=" +
        encodeURIComponent(geminiKey);
      const embResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
      if (!embResp.ok) {
        const errTxt = await embResp.text().catch(() => "");
        return json(req, 502, {
          error: `Gemini ${embResp.status}: ${errTxt.slice(0, 300)}`,
        });
      }
      const embData = (await embResp.json()) as {
        embeddings?: Array<{ values: number[] }>;
      };
      const embeddings = embData.embeddings ?? [];
      if (embeddings.length !== slice.length) {
        return json(req, 502, {
          error: `Gemini devolvió ${embeddings.length} embeddings para ${slice.length} inputs`,
        });
      }
      for (let i = 0; i < slice.length; i++) {
        const vec = embeddings[i].values;
        if (!Array.isArray(vec) || vec.length === 0) continue;
        const { error: upErr } = await admin
          .from("scouter_leads")
          .update({ embedding: `[${vec.join(",")}]` })
          .eq("id", slice[i].id);
        if (upErr) {
          console.error(
            "[scouter-embed-leads] update embedding failed",
            slice[i].id,
            upErr.message,
          );
        } else {
          totalEmbedded += 1;
        }
      }
    }

    // Lookalike: para cada lead NO-seed con company_id, hallar el seed
    // más parecido en su compañía y guardar el score.
    let lookalikeComputed = 0;
    for (const lead of leads) {
      if (!lead.company_id) continue;
      if (lead.discovery_source?.startsWith("seed:")) continue;
      const { data: matchRows, error: matchErr } = await admin.rpc(
        "scouter_top_seed_match",
        { p_lead_id: lead.id },
      );
      if (matchErr) {
        console.warn(
          "[scouter-embed-leads] rpc scouter_top_seed_match failed",
          lead.id,
          matchErr.message,
        );
        continue;
      }
      const match = Array.isArray(matchRows) && matchRows.length > 0 ? matchRows[0] : null;
      if (match) {
        const m = match as { seed_handle: string; similarity: number };
        const { error: lookErr } = await admin
          .from("scouter_leads")
          .update({
            lookalike_score: m.similarity,
            lookalike_seed_handle: m.seed_handle,
          })
          .eq("id", lead.id);
        if (!lookErr) lookalikeComputed += 1;
      }
    }

    return json(req, 200, {
      embedded: totalEmbedded,
      lookalike_computed: lookalikeComputed,
    });
  } catch (err: unknown) {
    console.error("[scouter-embed-leads] error:", err);
    return json(req, 500, { error: (err as Error).message ?? "Internal error" });
  }
});
