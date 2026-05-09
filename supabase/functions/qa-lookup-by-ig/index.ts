import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// qa-lookup-by-ig — al subir un QA y entrar el Instagram de la modelo,
// el frontend llama acá con el texto crudo del input. Normalizamos a
// handle canónico (lowercase, sin @, sin dominio, sin path) y buscamos
// en 5 tablas para detectar si la modelo ya existe en otros módulos:
// - scouter_leads (descubrimiento Apify)
// - closer_creators (modelos contratadas)
// - creator_prospects (prospectos)
// - leadgen_entries (lista vieja de prospects)
// - qa_models (otra QA previa de la misma modelo)
//
// Devuelve los matches agrupados por fuente con id + label + extra
// info por fuente para que el frontend pueda renderizar links útiles.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LookupRequest {
  instagram_input?: string;
}

interface Match {
  id: string;
  label: string;
  detail?: string | null;
}

interface LookupResponse {
  ok: true;
  normalized_handle: string | null;
  matches: {
    qa_models: Match[];
    scouter_leads: Match[];
    closer_creators: Match[];
    creator_prospects: Match[];
    leadgen_entries: Match[];
  };
  total: number;
}

// Normaliza un input de Instagram a handle canónico (lowercase, sin @,
// sin dominio, sin trailing slash, sin query string). Retorna null si
// no se puede extraer nada útil. Casos cubiertos:
//   "@maria"               → "maria"
//   "Maria"                → "maria"
//   "instagram.com/maria"  → "maria"
//   "https://www.instagram.com/maria/" → "maria"
//   "https://instagram.com/maria?hl=es" → "maria"
const normalizeHandle = (raw: string): string | null => {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  // Strip protocol
  s = s.replace(/^https?:\/\//i, "");
  // Strip www.
  s = s.replace(/^www\./i, "");
  // Strip instagram.com/ prefix
  s = s.replace(/^instagram\.com\//i, "");
  // Strip leading @
  s = s.replace(/^@+/, "");
  // Strip query string
  s = s.split("?")[0];
  // Strip trailing slash + path
  s = s.split("/")[0];
  // Lowercase
  s = s.toLowerCase().trim();
  if (!s) return null;
  // IG handles only allow letters, numbers, dots, underscores
  if (!/^[a-z0-9._]+$/.test(s)) return null;
  return s;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: LookupRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido.", 400);
    }

    const handle = normalizeHandle(body.instagram_input ?? "");
    if (!handle) {
      // No handle válido — devolvemos vacío sin error para no romper el
      // flujo del frontend mientras el usuario tipea.
      return jsonResponse({
        ok: true,
        normalized_handle: null,
        matches: {
          qa_models: [],
          scouter_leads: [],
          closer_creators: [],
          creator_prospects: [],
          leadgen_entries: [],
        },
        total: 0,
      } satisfies LookupResponse);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Patrón de búsqueda: ilike '%handle%' contra columnas de URL para
    // capturar cualquier formato (con/sin @, con/sin dominio). Para las
    // columnas que ya guardan handle limpio usamos ilike directo.
    const handlePattern = `%${handle}%`;

    const [qaModels, scouterLeads, closerCreators, creatorProspects, leadgenEntries] =
      await Promise.all([
        sb.from("qa_models").select("id, name, ig_url, category, country").ilike("ig_url", handlePattern).limit(5),
        sb.from("scouter_leads").select("id, name, instagram_handle, instagram_url, status").or(`instagram_handle.ilike.${handlePattern},instagram_url.ilike.${handlePattern}`).limit(5),
        sb.from("closer_creators").select("id, name, instagram_handle, status").ilike("instagram_handle", handlePattern).limit(5),
        sb.from("creator_prospects").select("id, name, instagram, status").ilike("instagram", handlePattern).limit(5),
        sb.from("leadgen_entries").select("id, model_handle, status").ilike("model_handle", handlePattern).limit(5),
      ]);

    const safeRows = <T>(r: { data: T[] | null; error: unknown }): T[] => {
      if (r.error) {
        console.warn("qa-lookup-by-ig table error:", r.error);
        return [];
      }
      return r.data ?? [];
    };

    const response: LookupResponse = {
      ok: true,
      normalized_handle: handle,
      matches: {
        qa_models: safeRows(qaModels).map((r: { id: string; name: string; category: string | null; country: string | null }) => ({
          id: r.id,
          label: r.name,
          detail: [r.category, r.country].filter(Boolean).join(" · ") || null,
        })),
        scouter_leads: safeRows(scouterLeads).map((r: { id: string; name: string | null; instagram_handle: string | null; status: string | null }) => ({
          id: r.id,
          label: r.name ?? r.instagram_handle ?? "(sin nombre)",
          detail: r.status,
        })),
        closer_creators: safeRows(closerCreators).map((r: { id: string; name: string | null; status: string | null }) => ({
          id: r.id,
          label: r.name ?? "(sin nombre)",
          detail: r.status,
        })),
        creator_prospects: safeRows(creatorProspects).map((r: { id: string; name: string | null; status: string | null }) => ({
          id: r.id,
          label: r.name ?? "(sin nombre)",
          detail: r.status,
        })),
        leadgen_entries: safeRows(leadgenEntries).map((r: { id: string; model_handle: string | null; status: string | null }) => ({
          id: r.id,
          label: r.model_handle ?? "(sin handle)",
          detail: r.status,
        })),
      },
      total: 0,
    };
    response.total =
      response.matches.qa_models.length +
      response.matches.scouter_leads.length +
      response.matches.closer_creators.length +
      response.matches.creator_prospects.length +
      response.matches.leadgen_entries.length;

    return jsonResponse(response);
  } catch (e) {
    console.error("qa-lookup-by-ig error:", e);
    return jsonError((e as Error).message ?? "Error interno.", 500);
  }
});

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
