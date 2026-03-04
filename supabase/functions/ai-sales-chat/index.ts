import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const computeEffectiveDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 0 && minutes <= 55) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return format(prev, "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
};

interface EarningRow {
  id: string;
  date: string;
  creator_id: string | null;
  pending_creator: string | null;
  total_earnings_gross: number | null;
  subscription_gross: number | null;
  new_subscriptions_sub_gross: number | null;
  recurring_sub_gross: number | null;
  message_gross: number | null;
  tips_gross: number | null;
  active_fans: number | null;
  new_fans: number | null;
  following: number | null;
  of_ranking: number | null;
  contribution: number | null;
  effective_date?: string;
}

const deduplicateByCreatorDay = (rows: EarningRow[]): EarningRow[] => {
  const grouped = new Map<string, EarningRow>();
  for (const row of rows) {
    const creatorKey = row.creator_id || row.pending_creator || row.id;
    const key = `${creatorKey}__${row.effective_date}`;
    const existing = grouped.get(key);
    if (!existing || new Date(row.date) > new Date(existing.date)) {
      grouped.set(key, row);
    }
  }
  return Array.from(grouped.values());
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== AUTH VALIDATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify user JWT
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido o expirado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== END AUTH VALIDATION =====

    const { messages, config } = await req.json();
    const userModel = config?.model || "google/gemini-3-flash-preview";
    const userTone = config?.tone || "default";
    const userInstructions = config?.customInstructions || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch creators
    const { data: creators } = await supabase
      .from("creators")
      .select("id, name, artistic_name, status, category, country, city");

    // Fetch earnings
    const { data: earnings } = await supabase
      .from("of_gross_earnings")
      .select(
        "id, date, total_earnings_gross, subscription_gross, new_subscriptions_sub_gross, recurring_sub_gross, message_gross, tips_gross, active_fans, new_fans, following, of_ranking, contribution, creator_id, pending_creator"
      )
      .order("date", { ascending: false })
      .limit(1000);

    // Apply effective date + dedup
    const mapped = (earnings ?? []).map((e: any) => ({
      ...e,
      effective_date: computeEffectiveDate(e.date),
    }));
    const deduped = deduplicateByCreatorDay(mapped);

    // Build creator name map
    const creatorMap: Record<string, string> = {};
    for (const c of creators ?? []) {
      creatorMap[c.id] = c.artistic_name || c.name;
    }

    // Build context string
    const creatorsJson = JSON.stringify(
      (creators ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        artistic_name: c.artistic_name,
        status: c.status,
        category: c.category,
        country: c.country,
        city: c.city,
      }))
    );

    const earningsJson = JSON.stringify(
      deduped.slice(0, 200).map((e) => ({
        creator: e.creator_id ? creatorMap[e.creator_id] || e.creator_id : e.pending_creator,
        date: e.effective_date,
        total: e.total_earnings_gross,
        subs: e.subscription_gross,
        new_subs: e.new_subscriptions_sub_gross,
        recurring: e.recurring_sub_gross,
        messages: e.message_gross,
        tips: e.tips_gross,
        active_fans: e.active_fans,
        new_fans: e.new_fans,
        following: e.following,
        ranking: e.of_ranking,
      }))
    );

    const toneInstructions: Record<string, string> = {
      formal: "Responde de manera profesional y estructurada. Usa un lenguaje corporativo.",
      casual: "Responde de manera amigable y conversacional, como un compañero de trabajo.",
      directo: "Responde con la menor cantidad de palabras posible. Ve al grano.",
      detallado: "Da explicaciones amplias con contexto y ejemplos cuando sea relevante.",
    };

    const toneExtra = toneInstructions[userTone] || "";

    const systemPrompt = `Eres un asistente de ventas. Tu audiencia son vendedores, NO analistas. Responde siempre en español.

REGLAS DE FORMATO OBLIGATORIAS:
- TABLAS: Cuando presentes datos comparativos, rankings o listas, SIEMPRE usa tablas markdown con formato correcto:
  * Primera fila: encabezados separados por |
  * Segunda fila: separadores con guiones | --- | --- |
  * Filas de datos separadas por |
  * Ejemplo correcto:
    | Creadora | Ganancias | Fans |
    | --- | --- | --- |
    | María | $1,234 | 5,678 |
    | Ana | $987 | 3,456 |
- NUNCA pongas los datos de tabla en una sola línea. Cada fila DEBE estar en su propia línea.
- Usa números redondeados y con formato: $1,234 en vez de 1234.56
- NO uses párrafos largos. Usa bullets cortos y directos.
- NO uses lenguaje técnico. Habla como si le explicaras a un vendedor.
- Usa emojis para indicar tendencia: 📈 subió, 📉 bajó, ➡️ igual
- Deja una línea en blanco antes y después de cada tabla.
- Separa secciones con líneas en blanco para que sea fácil de escanear.
${toneExtra ? `\nTONO: ${toneExtra}` : ""}
${userInstructions ? `\nINSTRUCCIONES ADICIONALES DEL USUARIO:\n${userInstructions}` : ""}

DATOS DE CREADORAS:
${creatorsJson}

DATOS DE GANANCIAS (últimos registros, deduplicados por creadora/día, fecha efectiva aplicada):
${earningsJson}

Campos: total, subs, new_subs, recurring, messages, tips, active_fans, new_fans, following, ranking.
Montos en USD bruto. La "fecha efectiva" ajusta registros entre 00:00-00:55 al día anterior.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: userModel,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de solicitudes excedido. Intenta de nuevo en unos momentos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos agotados. Agrega fondos en Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", response.status);
      return new Response(
        JSON.stringify({ error: "Error del servicio AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-sales-chat error:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
