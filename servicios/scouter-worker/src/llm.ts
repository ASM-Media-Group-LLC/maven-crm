// Wrapper LLM para AI scoring de leads. Soporta dos providers:
//   · Anthropic Claude (default) — sigue instrucciones complejas bien,
//     respeta deal-breakers del prompt sin que el modelo se contradiga.
//   · Groq llama (legacy fallback) — barato pero ignoraba los hard
//     constraints del prompt (ej. daba score 6.5 a brand accounts aún
//     diciendo en `reason` "no es persona humana").
//
// El scorer recibe el lead (followers, bio, link in bio, etc.) y devuelve
// un JSON con { score: 0-10, status: high_fit|medium_fit|low_fit, reason }.
//
// El provider se elige via env: SCORER_PROVIDER=anthropic|groq.
// Default = anthropic (calidad >> costo en este pipeline).

type ScorerProvider = "anthropic" | "groq";
const SCORER_PROVIDER = (process.env.SCORER_PROVIDER as ScorerProvider) ?? "anthropic";

// ─── Anthropic ─────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_SCORER_MODEL ?? "claude-haiku-4-5-20251001";

// ─── Groq (fallback) ───────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_SCORER_MODEL ?? "llama-3.1-8b-instant";

if (SCORER_PROVIDER === "anthropic" && !ANTHROPIC_API_KEY) {
  console.warn("scouter-worker: SCORER_PROVIDER=anthropic pero ANTHROPIC_API_KEY ausente — score_lead jobs van a fallar.");
}
if (SCORER_PROVIDER === "groq" && !GROQ_API_KEY) {
  console.warn("scouter-worker: SCORER_PROVIDER=groq pero GROQ_API_KEY ausente — score_lead jobs van a fallar.");
}

const SCORER_SYSTEM_PROMPT = `Sos un evaluador de leads para una agencia de management de OnlyFans. Recibís el perfil de Instagram de una creadora candidata + la CONFIG de la compañía cliente, y decidís cuán bueno es el fit para fichar PARA ESA COMPAÑÍA.

═══ PASO 1: DEAL-BREAKERS ═══

Antes de scorear por mérito, chequeá estos hard signals. Si alguno aplica, el score tiene techo bajo SIN IMPORTAR lo que diga el resto del perfil:

1. NO ES PERSONA HUMANA. Si el perfil es una marca/tienda/producto/restaurante/agencia/medio/empresa (ej: "@basicosok" tienda de zapatos, "@zara" marca, "@elcomercio" medio, "@bellavistaResort" hotel) → score ≤ 3, status low_fit. Indicadores: nombre con sufijo .com/.store/.shop, bio describe productos/horarios/locales en vez de personalidad, posts son catálogos sin la persona.

2. GÉNERO INCORRECTO. Si companyConfig.target_gender = "female" y el perfil es claramente masculino (pronombres he/him, fullName de varón, emojis 👨🕺🤵, bio que dice "papá"/"esposo"/"hombre") → score ≤ 2, status low_fit. Reason: "género opuesto al target". Aplicar simétrico si target_gender="male". Si target_gender = "any" o vacío, ignorar este signal.

3. PAÍS NO MATCHEABLE. Si companyConfig.target_countries no está vacío Y el lead.country es NULL Y la bio no menciona ninguno de los target_countries explícitamente → score ≤ 4, status low_fit. Reason: "país desconocido — no podemos confirmar que sea de [target]". Si lead.country tiene un país que NO está en target_countries → score ≤ 3.

4. FOLLOWERS FUERA DE RANGO (HARD CAP). Si companyConfig.followers_max está seteado y followers > followers_max → score ≤ 2, status low_fit. Si companyConfig.followers_min está seteado y followers < followers_min → score ≤ 3. Estos son valores numéricos explícitos que el user configuró — son no-negociables, no soft. Reason: "followers X > max permitido Y (cuenta demasiado grande para esta compañía)".

5. EXCLUDE_KEYWORDS EN BIO. Si companyConfig.exclude_keywords tiene términos Y la bio/nombre del lead contiene CUALQUIERA → score ≤ 3, status low_fit. Reason debe mencionar la palabra exacta (ej. "bio menciona 'lujo' que está en exclude_keywords"). Estos son términos que el user expresamente NO quiere — no negociables. Para Price Shoes ejemplos: "modelo profesional", "top model", "pasarela", "lujo" descalifican.

6. TIER FUERA DE RANGO (SOFT). Si companyConfig.profile_tier menciona "micro" o "<100k" y los followers > 500k → score ≤ 5. Si menciona "macro" y followers < 50k → score ≤ 4. Si profile_tier está vacío, no aplicar.

═══ PASO 2: SCORING POR MÉRITO (si pasaste los deal-breakers) ═══

- Followers: respetar el rango configurado en companyConfig.followers_min/max. Si la cuenta cae justo en el rango, +1 al score base.
- Bio matching: si companyConfig.bio_keywords está seteado, contar cuántas palabras keyword aparecen en la bio. 0 keywords matched cuando la lista NO está vacía → baja a score base máximo 5 (el lead no se alinea con el tono buscado). 2+ keywords matched → +0.5 al score.
- Geo_targets (más amplio que target_countries): si la bio menciona una región del geo_targets (ej. "LATAM" en geo y "Mexico City" en bio), suma señal positiva.
- Content_type: si el companyConfig.content_type es "lifestyle" y la bio es claramente fitness-only → -1. Si matchea → +0.5.
- Verified: nice-to-have, +0.3 al score.
- Categoría manual del scout (si viene): ajustar según A++/A/B+/B/C+/C.
- Engagement implícito: bio que menciona "DMs to collab", "active fan base", monetización propia (OF/Linktree/Beacons/Stan en link_in_bio).
- Coincidencia con scoring_notes: leer scoring_notes y usarlas como criterio adicional (ej. "priorizar perfiles accesibles, no aspiracionales" → bajar score a luxury brands).

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
  // Países objetivo. Vacío/null = sin restricción.
  target_countries?: string[] | null;
  // "male" | "female" | "any". "any"/vacío = sin restricción.
  target_gender?: "male" | "female" | "any" | null;
  // Texto libre describiendo qué tier de creator busca (ej. "micro creators
  // 5k-50k LATAM" o "macro >500k US"). Si vacío, scorer no aplica deal-breaker.
  profile_tier?: string | null;
  // Cap explícito numérico de followers. HARD deal-breaker — caps
  // score ≤ 2 si followers excede max, ≤ 3 si está por debajo de min.
  followers_max?: number | null;
  followers_min?: number | null;
  // Regiones más amplias (ej. "LATAM", "Latin America"). Útil para
  // contextualizar — el scorer puede preferir cuentas LATAM aún sin
  // país exacto detectado.
  geo_targets?: string[] | null;
  // Palabras clave que la bio DEBE/PUEDE contener para que el lead
  // sea fit (ej. "moda", "fashion", "blogger", "lifestyle"). Si la
  // bio no contiene NINGUNA de estas, baja el score.
  bio_keywords?: string[] | null;
  // Palabras clave de bio que DESCALIFICAN al lead (ej. "modelo
  // profesional", "top model", "lujo", "pasarela"). Si la bio
  // contiene CUALQUIERA, score ≤ 3 (deal-breaker).
  exclude_keywords?: string[] | null;
  // Tipo de contenido buscado (ej. "lifestyle", "fitness", "fashion").
  // El scorer matchea contra el tono de la bio.
  content_type?: string | null;
  // Notas libres del user al scorer (ej. "evitar fitness", "preferir
  // contenido NSFW soft", "priorizar engagement vs followers").
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

// Retry config compartido para 429 (rate limit). En lugar de fallar,
// esperamos y reintentamos — el TPM se resetea por minuto en ambos
// providers.
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000]; // 15s, 30s, 60s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  providerLabel: string,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    if (attempt >= RETRY_DELAYS_MS.length) return res;
    const delay = RETRY_DELAYS_MS[attempt] ?? 60_000;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null;
    const wait: number =
      retryAfter !== null && !Number.isNaN(retryAfter)
        ? Math.max(retryAfter, 1000)
        : delay;
    console.warn(
      `[scorer] ${providerLabel} 429 — esperando ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`,
    );
    await sleep(wait);
    attempt += 1;
  }
}

// ─── Anthropic Claude (provider primario) ──────────────────────────────
// Claude sigue instrucciones complejas mejor que llama 8B — el prompt
// con deal-breakers se respeta sin que el modelo se contradiga.
async function scoreWithAnthropic(input: ScoreLeadInput): Promise<ScoreResult> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada.");
  const userMessage = JSON.stringify(input, null, 2);
  const res = await fetchWithRetry(
    ANTHROPIC_URL,
    {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        temperature: 0.2,
        system: SCORER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    },
    "Anthropic",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic scorer error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const raw = data.content?.[0]?.text ?? "";
  return parseScoreResponse(raw);
}

// ─── Groq llama (legacy, fallback) ─────────────────────────────────────
async function scoreWithGroq(input: ScoreLeadInput): Promise<ScoreResult> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY no configurada.");
  const userMessage = JSON.stringify(input, null, 2);
  const res = await fetchWithRetry(
    GROQ_URL,
    {
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
    },
    "Groq",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq scorer error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  return parseScoreResponse(raw);
}

// Parser común — extrae el JSON de la respuesta. Claude a veces devuelve
// el JSON envuelto en ```json blocks o con texto antes/después, así que
// hacemos un best-effort para encontrar el primer objeto.
function parseScoreResponse(raw: string): ScoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: extraer el primer bloque que parezca JSON.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Scorer JSON inválido: ${raw.slice(0, 200)}`);
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error(`Scorer JSON inválido: ${raw.slice(0, 200)}`);
    }
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

export async function scoreLead(input: ScoreLeadInput): Promise<ScoreResult> {
  if (SCORER_PROVIDER === "groq") return scoreWithGroq(input);
  return scoreWithAnthropic(input);
}
