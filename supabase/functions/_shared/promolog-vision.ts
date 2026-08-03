// promolog-vision.ts — visión para clasificar promo de OF en imágenes.
//
// Nace para TELEGRAM (03/08): el pipeline convertía los posts SOLO-IMAGEN en
// "no promocionó" (624 filas falsas en 15 creadoras — caso Marcy, que promociona
// con imagen+link). FB y X ya tenían visión propia (visionIsOfPromo duplicada en
// cada edge); esta es la versión compartida para no duplicarla una tercera vez.
//
// ⚠️ REGLA DE COSTO (pedido explícito de Jhon): la visión NUNCA se gasta en un
// post ya guardado. Eso NO se resuelve acá adentro — se resuelve en el llamador
// consultando la clave de dedup ANTES de clasificar (clavesYaGuardadas / lookup
// por story_media_url). Esta función asume que ese filtro ya pasó.

const VISION_MODEL = "google/gemini-2.5-flash";

export async function visionPromo(opts: {
  dataUri: string;
  apiKey: string;
  prompt: string;
  text?: string;
  refTitle?: string;   // X-Title para OpenRouter (identifica el consumidor en el panel)
}): Promise<{ promoted: boolean; reason: string }> {
  const content = [
    { type: "text", text: opts.text ? `Texto del post: "${opts.text.slice(0, 300)}"\n\n${opts.prompt}` : opts.prompt },
    { type: "image_url", image_url: { url: opts.dataUri } },
  ];
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30_000);
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": opts.refTitle ?? "Maven Promolog",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300,
      }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { promoted: false, reason: `or_${resp.status}` };
    // deno-lint-ignore no-explicit-any
    const raw = ((await resp.json()) as any)?.choices?.[0]?.message?.content ?? "";
    // deno-lint-ignore no-explicit-any
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { try { parsed = JSON.parse(String(raw).replace(/```(?:json)?/gi, "").trim()); } catch { /* noop */ } }
    if (!parsed) return { promoted: false, reason: "vision_parse" };
    return { promoted: parsed.promoted === true, reason: String(parsed.reason || "").slice(0, 200) };
  } catch (e) {
    return { promoted: false, reason: `vision:${(e as Error).message}` };
  }
}

// Baja una imagen pública (CDN de t.me, fbcdn…) y la devuelve como data URI para
// visión. null si no es imagen, pesa de más o no responde — el llamador decide qué
// hacer con un null (típicamente: dejar el post como pending/'sin_texto').
export async function fetchImageAsDataUri(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const maxBytes = opts.maxBytes ?? 600_000;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 12_000);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!mime.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.length || buf.length > maxBytes) return null;
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
    return `data:${mime};base64,${btoa(bin)}`;
  } catch { return null; }
}
