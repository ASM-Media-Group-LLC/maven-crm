import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
    if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY is not configured");
    const MINIMAX_URL =
      Deno.env.get("MINIMAX_BASE_URL") ||
      "https://api.minimaxi.chat/v1/text/chatcompletion_v2";
    const MINIMAX_MODEL = Deno.env.get("MINIMAX_MODEL") || "MiniMax-Text-01";

    const { action, contactId, messages, imageBase64, brand, brandOutreach } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch contact data for context
    const { data: contact } = await supabase
      .from("super_contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    const { data: outreach } = await supabase
      .from("super_contact_outreach")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: interactions } = await supabase
      .from("super_contact_interactions")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);

    const contactContext = contact
      ? `Datos de la modelo/contacto:
- Handle: @${contact.instagram_handle}
- Nombre: ${contact.full_name || "No especificado"}
- Estado: ${contact.status}
- Seguidores: ${contact.followers_count || "Desconocido"}
- País: ${contact.country || "Desconocido"}, Ciudad: ${contact.city || "Desconocida"}
- Categoría: ${contact.category || "Sin categoría"}
- Bio: ${contact.bio || "Sin bio"}
- Notas: ${contact.notes || "Sin notas"}
- Frecuencia de chequeo: ${contact.check_frequency || "No configurada"}
- Último chequeo: ${contact.last_checked_at || "Nunca"}

Historial de alcance (${outreach?.length || 0} registros):
${outreach?.map((o: any) => `  - ${o.brand} via ${o.message_type} | Estado: ${o.response_status} | desde @${o.instagram_account || "?"} | ${o.notes || ""} ${o.response ? "→ " + o.response : ""}`).join("\n") || "Sin registros"}

Interacciones/Notas (${interactions?.length || 0}):
${interactions?.map((i: any) => `  - [${i.type}] ${i.notes}`).join("\n") || "Sin interacciones"}`
      : "No se encontró información del contacto.";

    const systemPrompt = `Eres un asistente de análisis para una agencia de management de modelos/creadoras de contenido. Tu trabajo es ayudar a analizar prospectos y dar insights para la venta y reclutamiento.

${contactContext}

Instrucciones:
- Responde siempre en español
- Sé directo y útil
- Cuando analices imágenes (screenshots de perfil, capturas de conversación, etc.), da insights detallados sobre la modelo: engagement potencial, audiencia, oportunidades de monetización
- Sugiere estrategias de acercamiento basadas en el perfil
- Si te comparten screenshots, analiza el contenido y sugiere acciones concretas
- Guarda un tono profesional pero cercano`;

    // Handle brand_summary
    if (action === "brand_summary" && brand && brandOutreach) {
      const brandPrompt = `Analiza el historial de contacto con la marca "${brand}" para esta creadora.

Datos de contacto por marca:
${brandOutreach.map((o: any) => `- Vía: ${o.message_type} | Cuenta IG: @${o.instagram_account || "?"} | Estado: ${o.response_status} | Lo que se dijo: "${o.notes || "N/A"}" | Respuesta: "${o.response || "Sin respuesta"}" | Fecha: ${o.created_at}`).join("\n")}

Dame:
1. **Resumen**: Qué se ha hecho hasta ahora con esta marca
2. **Cuentas usadas**: Cuántas y cuáles cuentas de IG se usaron
3. **Análisis de respuestas**: Patrón de respuestas (positivas, negativas, sin respuesta)
4. **Recomendación**: Qué hacer ahora, siguiente paso concreto
5. **Estrategia sugerida**: Cómo mejorar el approach con esta marca

Sé específico y práctico.`;

      const aiMessages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: brandPrompt },
      ];

      const response = await fetch(MINIMAX_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MINIMAX_MODEL, messages: aiMessages }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402 || status === 401) return new Response(JSON.stringify({ error: "MiniMax: cuota agotada o key inválida" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`MiniMax error: ${status}`);
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || "No se pudo generar el resumen.";

      return new Response(JSON.stringify({ summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle image analysis
    if (action === "analyze_image" && imageBase64) {
      const aiMessages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analiza esta imagen del perfil/contenido de la modelo. Dame insights detallados sobre lo que ves, potencial de monetización, engagement, y sugerencias de estrategia. Sé específico y práctico." },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        },
      ];

      const response = await fetch(MINIMAX_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MINIMAX_MODEL, messages: aiMessages }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402 || status === 401) return new Response(JSON.stringify({ error: "MiniMax: cuota agotada o key inválida" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`MiniMax error: ${status}`);
      }

      const data = await response.json();
      const analysis = data.choices?.[0]?.message?.content || "No se pudo analizar la imagen.";

      // Auto-save to interactions
      await supabase.from("super_contact_interactions").insert({
        contact_id: contactId,
        type: "nota",
        notes: `🤖 Análisis IA de imagen:\n${analysis}`,
      });

      return new Response(JSON.stringify({ analysis, saved: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle chat
    if (action === "chat" && messages) {
      const aiMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      const response = await fetch(MINIMAX_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MINIMAX_MODEL, messages: aiMessages, stream: true }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402 || status === 401) return new Response(JSON.stringify({ error: "MiniMax: cuota agotada o key inválida" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`MiniMax error: ${status}`);
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("supercontact-ai error:", e);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
