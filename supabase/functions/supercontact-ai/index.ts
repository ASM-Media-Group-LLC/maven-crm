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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, contactId, messages, imageBase64 } = await req.json();

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

Historial de alcance (${outreach?.length || 0} registros):
${outreach?.map((o: any) => `  - ${o.brand} via ${o.message_type} | Estado: ${o.response_status} | ${o.notes || ""} ${o.response ? "→ " + o.response : ""}`).join("\n") || "Sin registros"}

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

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI gateway error: ${status}`);
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

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages, stream: true }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI gateway error: ${status}`);
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
