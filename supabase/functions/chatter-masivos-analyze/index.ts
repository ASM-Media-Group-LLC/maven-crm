// chatter-masivos-analyze — análisis IA de la CALIDAD de los masivos de un modelo.
// El frontend ya cargó los masivos (of-mass + smart-messages) vía blu-mp y los manda en el body;
// acá cruzamos copy × performance (enviado/visto/ventas/$) y devolvemos insights con Gemini Flash
// vía OpenRouter. NO toca BLU directo (más simple/rápido). Auth: service_role o JWT de staff.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OR_MODEL = "google/gemini-2.5-flash";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const stripHtml = (h: string) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const SYSTEM_PROMPT = `Sos un evaluador de calidad de MENSAJES MASIVOS (PPV/blasts) de una agencia de OnlyFans. Te paso una lista de masivos con su COPY y su PERFORMANCE real: enviado (sent), veces visto (viewed), ventas (purchased), dinero recaudado (earnings), precio. Analizá la CALIDAD del copy cruzada con el rendimiento: gancho/hook, claridad de la oferta, llamado a la acción (CTA), urgencia/escasez, precio vs conversión, personalización, longitud. Identificá qué patrones de copy convierten y cuáles no.

Devolvé EXCLUSIVAMENTE un JSON válido (sin markdown ni texto extra) con estas claves:
{
  "resumen": "diagnóstico general en 2-4 frases",
  "que_funciona": ["patrón/elemento de copy que está rindiendo, con evidencia de los números", "..."],
  "que_no_funciona": ["patrón que NO convierte (mucho visto y poca venta, copy débil, etc.)", "..."],
  "recomendaciones": ["acción concreta para mejorar los masivos", "..."],
  "mejores_copies": ["cita textual breve del copy que mejor rinde", "..."],
  "peores_copies": ["cita textual breve del copy que peor rinde (alto envío/visto, baja venta)", "..."]
}
Reglas: español neutro y accionable. Usá SOLO la evidencia (no inventes números). Sé específico: referí ganchos/frases concretas. Considerá la conversión (ventas/visto) y no solo el total de dinero.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "unauthorized" }, 401);
  if (bearer !== SERVICE_KEY) {
    const { data: { user }, error } = await sb.auth.getUser(bearer);
    if (error || !user) return json({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    let ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
    if (!ok) { const { data: can } = await sb.rpc("can_access_chatters_qa", { p_uid: user.id }); ok = can === true; }
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) return json({ error: "OPENROUTER_API_KEY no configurada" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const masivos = Array.isArray(body.masivos) ? body.masivos as any[] : [];
  const modelName = String(body.modelName ?? "");
  if (masivos.length === 0) return json({ error: "sin masivos para analizar" }, 400);

  // Top por envío (los más relevantes), cap para acotar tokens.
  const top = masivos.slice().sort((a, b) => (b.sent || 0) - (a.sent || 0)).slice(0, 50);
  const lines = top.map((m, i) => {
    const conv = m.sent ? ((m.purchased / m.sent) * 100).toFixed(1) : "0";
    const tipo = m.type === "priority" ? "PRIORITY" : (m.isExternal ? "EXTERNO" : "OF-MASS");
    return `${i + 1}. [${tipo}] enviado:${m.sent || 0} visto:${m.viewed || 0} ventas:${m.purchased || 0} $:${m.earnings || 0} precio:${m.price || 0} conv:${conv}% — "${stripHtml(m.copy).slice(0, 220)}"`;
  }).join("\n");

  const userMessage = `Modelo: ${modelName}. ${masivos.length} masivos (muestra top ${top.length} por envío):\n\n${lines}\n\nDevolvé SOLO el JSON con el shape pedido.`;

  let text = "";
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://maven.asmtech.me", "X-Title": "Maven Masivos QA" },
      body: JSON.stringify({ model: OR_MODEL, max_tokens: 2500, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }] }),
    });
    if (!resp.ok) throw new Error(`openrouter ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    text = data.choices?.[0]?.message?.content ?? "";
  } catch (e) { return json({ error: (e as Error).message }, 502); }

  let parsed: any;
  try { parsed = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim()); }
  catch { return json({ error: "La IA no devolvió JSON válido. Reintentá." }, 502); }

  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return json({ ok: true, analysis: {
    resumen: typeof parsed.resumen === "string" ? parsed.resumen : "",
    que_funciona: arr(parsed.que_funciona), que_no_funciona: arr(parsed.que_no_funciona),
    recomendaciones: arr(parsed.recomendaciones), mejores_copies: arr(parsed.mejores_copies), peores_copies: arr(parsed.peores_copies),
  } });
});
