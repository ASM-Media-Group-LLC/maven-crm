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

const SCORER_SYSTEM_PROMPT = `Sos un evaluador de leads para una agencia de management de OnlyFans. Recibís el perfil de Instagram de una creadora candidata + la CONFIG de la compañía cliente, y decidís cuán bueno es el fit para fichar PARA ESA COMPAÑÍA.

═══ PASO 1: DEAL-BREAKERS ═══

Antes de scorear por mérito, chequeá estos hard signals. Si alguno aplica, el score tiene techo bajo SIN IMPORTAR lo que diga el resto del perfil:

1. NO ES PERSONA HUMANA. Si el perfil es una marca/tienda/producto/restaurante/agencia/medio/empresa (ej: "@basicosok" tienda de zapatos, "@zara" marca, "@elcomercio" medio, "@bellavistaResort" hotel) → score ≤ 3, status low_fit. Indicadores: nombre con sufijo .com/.store/.shop, bio describe productos/horarios/locales en vez de personalidad, posts son catálogos sin la persona.

2. GÉNERO INCORRECTO. Si companyConfig.target_gender = "female" y el perfil es claramente masculino (pronombres he/him, fullName de varón, emojis 👨🕺🤵, bio que dice "papá"/"esposo"/"hombre") → score ≤ 2, status low_fit. Reason: "género opuesto al target". Aplicar simétrico si target_gender="male". Si target_gender = "any" o vacío, ignorar este signal.

3. PAÍS NO MATCHEABLE. Si companyConfig.target_countries no está vacío Y el lead.country es NULL Y la bio no menciona ninguno de los target_countries explícitamente → score ≤ 4, status low_fit. Reason: "país desconocido — no podemos confirmar que sea de [target]". Si lead.country tiene un país que NO está en target_countries → score ≤ 3.

4. TIER FUERA DE RANGO. Si companyConfig.profile_tier menciona "micro" o "<100k" y los followers > 500k → score ≤ 5. Si menciona "macro" y followers < 50k → score ≤ 4. Si profile_tier está vacío, no aplicar.

═══ PASO 2: SCORING POR MÉRITO (si pasaste los deal-breakers) ═══

- Followers: 50k-500k es sweet spot para mid. Ajustá según companyConfig.profile_tier.
- Bio: indicadores de monetización propia (link in bio que apunte a OF/Linktree/Beacons/Stan), tono compatible con companyConfig.scoring_notes.
- Verified: nice-to-have.
- Categoría manual del scout (si viene): ajustar score según A++/A/B+/B/C+/C.
- Engagement implícito: bio que menciona "DMs to collab", "active fan base", etc.
- Coincidencia con scoring_notes de la compañía.

═══ Output ═══

Devuelve EXCLUSIVAMENTE un objeto JSON sin markdown:
{
  "score": <number 0-10 con 1 decimal>,
  "status": "high_fit" | "medium_fit" | "low_fit",
  "reason": "<string max 30 palabras explicando el score. Si aplicaste un DEAL-BREAKER, mencionarlo literal>"
}

Mapping score→status: >= 7.5 high_fit, 4.5-7.4 medium_fit, < 4.5 low_fit.`;

interface ScoreResult {
  score: number;
  status: "high_fit" | "medium_fit" | "low_fit";
  reason: string;
}

export interface ScoreLeadCompanyConfig {
  // Países objetivo de la compañía. Si está vacío/null, sin restricción.
  target_countries?: string[] | null;
  // "male" | "female" | "any". "any"/vacío = sin restricción.
  target_gender?: "male" | "female" | "any" | null;
  // Texto libre describiendo qué tier de creator busca (ej. "micro creators
  // 5k-50k LATAM" o "macro >500k US"). Si vacío, scorer no aplica deal-breaker.
  profile_tier?: string | null;
  // Notas adicionales para el scorer (ej. "evitar fitness", "preferir
  // contenido NSFW soft").
  scoring_notes?: string | null;
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
  // Config de la compañía a la que se evalúa el fit. Se inyecta al
  // prompt para que el scorer aplique hard signals (sin país en filtro
  // estricto, género opuesto, tier fuera de rango, cuenta brand).
  companyConfig?: ScoreLeadCompanyConfig | null;
}

// Retry config para 429 de Groq. El TPM gratis de llama-3.1-8b es 6000
// (≈12 score_lead/min). Cuando se procesa un batch grande seguido,
// los últimos jobs reciben 429. En lugar de fallar, esperamos y
// reintentamos — el TPM se resetea cada minuto.
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000]; // 15s, 30s, 60s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchGroqWithRetry(body: unknown): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 429) return res;
    if (attempt >= RETRY_DELAYS_MS.length) {
      // Devolvemos el 429 al caller para que se trate como error normal
      // (el job se marca como failed y el queue puede retry-ar después).
      return res;
    }
    const delay = RETRY_DELAYS_MS[attempt] ?? 60_000;
    // Mejor lectura del header Retry-After si Groq lo manda
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null;
    const wait: number =
      retryAfter !== null && !Number.isNaN(retryAfter)
        ? Math.max(retryAfter, 1000)
        : delay;
    console.warn(
      `[scorer] Groq 429 — esperando ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
    );
    await sleep(wait);
    attempt += 1;
  }
}

export async function scoreLead(input: ScoreLeadInput): Promise<ScoreResult> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY no configurada.");

  const userMessage = JSON.stringify(input, null, 2);

  const res = await fetchGroqWithRetry({
    model: GROQ_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 500,
    messages: [
      { role: "system", content: SCORER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
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
