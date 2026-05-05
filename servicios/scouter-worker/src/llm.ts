// Wrapper Groq para AI scoring de leads. Usamos OpenAI-compat así que
// el shape es estándar — si después cambian de provider (Gemini, Claude)
// solo se toca este archivo.
//
// El scorer recibe el lead (followers, bio, link in bio, etc.) y devuelve
// un JSON con { score: 0-10, status: high_fit|medium_fit|low_fit, reason }.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_SCORER_MODEL ?? "llama-3.1-8b-instant";

if (!GROQ_API_KEY) {
  console.warn("scouter-worker: GROQ_API_KEY ausente — score_lead jobs van a fallar.");
}

const SCORER_SYSTEM_PROMPT = `Sos un evaluador de leads para una agencia de management de OnlyFans. Recibís el perfil de Instagram de una creadora candidata y decidís cuán bueno es el fit para fichar.

Criterios (todos importan, ningún solo es decisivo):
- Followers: 50k-500k es sweet spot. <10k descarta. >2M es target premium pero más difícil de cerrar.
- Bio: indicadores de monetización propia (link in bio que apunte a OF/Linktree/Beacons/Stan), tono adulto, audiencia geográfica (LATAM > US > Europe).
- Verified: nice-to-have, no excluyente.
- Categoría manual del scout (si viene): ajustar score según A++/A/B+/B/C+/C.
- Engagement implícito: si bio menciona "DMs to collab", "active fan base", etc.

Devuelve EXCLUSIVAMENTE un objeto JSON sin markdown:
{
  "score": <number 0-10 con 1 decimal>,
  "status": "high_fit" | "medium_fit" | "low_fit",
  "reason": "<string max 30 palabras explicando el score>"
}

Mapping score→status: >= 7.5 high_fit, 4.5-7.4 medium_fit, < 4.5 low_fit.`;

interface ScoreResult {
  score: number;
  status: "high_fit" | "medium_fit" | "low_fit";
  reason: string;
}

export interface ScoreLeadInput {
  username: string;
  fullName?: string | null;
  bio?: string | null;
  followers?: number | null;
  verified?: boolean;
  category?: string | null;
  linkInBioPlatform?: string | null;
  country?: string | null;
}

export async function scoreLead(input: ScoreLeadInput): Promise<ScoreResult> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY no configurada.");

  const userMessage = JSON.stringify(input, null, 2);

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: "system", content: SCORER_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq scorer error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Scorer JSON inválido: ${raw.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Scorer devolvió respuesta no-objeto.");
  }
  const o = parsed as Record<string, unknown>;
  const score = typeof o.score === "number" ? o.score : NaN;
  const status = String(o.status ?? "");
  const reason = String(o.reason ?? "");
  if (
    Number.isNaN(score) ||
    score < 0 ||
    score > 10 ||
    !["high_fit", "medium_fit", "low_fit"].includes(status)
  ) {
    throw new Error(`Scorer shape inválido: ${raw.slice(0, 200)}`);
  }
  return { score, status: status as ScoreResult["status"], reason };
}
