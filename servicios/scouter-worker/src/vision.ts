// Visual analysis del profile pic de un lead via Claude Haiku con
// vision. Devuelve look_score 0-10 (1 decimal). Si la foto no es
// una persona (logo, paisaje, meme), devuelve null para que el
// caller no use ese score.
//
// Uso típico: solo se llama para leads borderline en followers
// (5k-50k). Para >50k followers el score por texto ya alcanza,
// para <5k tampoco vale gastar tokens visuales.
//
// Modelo: claude-haiku-4-5 con vision. Override via env.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_VISION_MODEL ?? "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

if (!ANTHROPIC_API_KEY) {
  console.warn(
    "scouter-worker: ANTHROPIC_API_KEY ausente — analyze_look se va a saltar.",
  );
}

const VISION_PROMPT = `Sos un evaluador de aesthetic para una agencia de management de creators de OnlyFans. Recibís la foto de perfil de Instagram de una candidata.

Tu trabajo: dar un look_score 0-10 que represente qué tan atractivo es el "look" de la persona para fichar como creator.

Criterios (todos importan, ningún solo es decisivo):
- Atractivo facial general
- Estilismo y presentación (maquillaje, peinado, ropa)
- Calidad de la foto (composición, iluminación, no parece selfie barato)
- Look "vendible" para audiencia OF: aesthetic curado, lookbook-friendly
- Coherencia con creator profesional (vs persona casual sin esa intención)

Si la foto NO es una persona (logo, paisaje, animal, screenshot, meme),
devolvé null.

Responde EXCLUSIVAMENTE un JSON sin markdown:
{
  "look_score": <number 0-10 con 1 decimal o null>,
  "reason": "<string max 25 palabras>"
}`;

interface VisionResult {
  look_score: number | null;
  reason: string;
}

/** Analiza el profile pic via Claude Haiku vision.
 *  Si no hay API key, falla la url, o el shape es inválido,
 *  devuelve { look_score: null, reason: "..." } — el caller decide
 *  qué hacer (típicamente: ignorar y seguir con score de texto). */
export async function analyzeLook(photoUrl: string): Promise<VisionResult> {
  if (!ANTHROPIC_API_KEY) {
    return { look_score: null, reason: "ANTHROPIC_API_KEY no configurada" };
  }
  if (!photoUrl?.startsWith("http")) {
    return { look_score: null, reason: "URL de foto inválida" };
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        temperature: 0.2,
        system: VISION_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "url", url: photoUrl },
              },
              {
                type: "text",
                text: "Evaluá esta foto de perfil. Devuelve solo el JSON.",
              },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return { look_score: null, reason: `fetch falló: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("Anthropic vision error", res.status, errText.slice(0, 200));
    return { look_score: null, reason: `vision API ${res.status}` };
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const raw = data.content?.find((b) => b.type === "text")?.text ?? "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { look_score: null, reason: `JSON inválido: ${cleaned.slice(0, 80)}` };
  }
  const o = parsed as Record<string, unknown>;
  const score = o.look_score;
  const reason = String(o.reason ?? "");
  // null explícito (no es persona) → respetamos.
  if (score === null) return { look_score: null, reason };
  if (typeof score !== "number" || score < 0 || score > 10) {
    return { look_score: null, reason: `score fuera de rango: ${score}` };
  }
  return { look_score: Math.round(score * 10) / 10, reason };
}
