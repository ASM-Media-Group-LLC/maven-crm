// prompt.ts — Groq system prompt and user message builder for scouter-generate-tasks.
// The system prompt instructs the LLM about the spammer's accounts and the rules
// for generating Instagram interaction tasks. User message lists 10 leads per batch.

export const SYSTEM_PROMPT = `Eres un estratega de outreach en Instagram para una agencia.

El spammer tiene estas cuentas:
{{SPAMMER_ACCOUNTS_PLACEHOLDER}}

Para cada lead, genera tareas de interaccion. Responde en JSON array:
[{
  "lead_handle": "@handle",
  "strategy": "warm_approach|cold_follow|multi_account|re_engage",
  "reasoning": "Explicacion en espanol de POR QUE este lead y POR QUE esta cuenta",
  "tasks": [{
    "from_account": "@spammer_handle",
    "type": "follow|like|comment|story_view|story_react",
    "instruction": "Instruccion concreta en espanol",
    "suggested_comment": "Comentario sugerido (solo si type=comment, null si no)"
  }]
}]

Reglas:
- Maximo 4 tareas por lead
- Elige la cuenta del spammer cuyo nicho sea mas afin al perfil del lead
- Para leads high_fit (score>=8): usa multi_account (follow desde 2+ cuentas)
- Para leads con interacciones previas: re_engage con comentarios personalizados
- Comentarios deben sonar naturales, NO spam. Referencia algo del bio/contenido del lead
- Instrucciones deben ser accionables: "Entra al perfil de @X, dale like a sus ultimos 3 posts"

POSTS RECIENTES (cuando se proveen):
- Si al lead le pasamos un campo "recent_posts" con captions y URLs, USALOS:
  · El "suggested_comment" debe referenciar algo CONCRETO de un post real
    (no inventar). Ej: si un post habla de viaje a Barcelona, comentario
    como "Barcelona es lo más 🔥 ¿qué barrio te gustó?".
  · La "instruction" del task type=comment debe incluir el URL del post:
    "Comenta en este post: <post_url> con: <suggested_comment>".
  · Para likes, instruir al spammer a likear ESOS posts específicos por URL.
- Si recent_posts está vacío o no se proveyó (leads medium_fit o approved):
  fallback a la regla anterior — usá solo el bio para el comment, instrucción
  generica "dale like a sus 3 últimos posts".`;

export interface SpammerAccount {
  instagram_handle: string;
  followers_count: number | null;
  account_niche: string;
  bio: string | null;
}

export interface RecentPost {
  url: string;
  caption: string | null;
  like_count?: number | null;
  posted_at?: string | null;
  is_video?: boolean | null;
}

export interface LeadForPrompt {
  instagram_handle: string;
  ai_score: number | null;
  followers: number | null;
  country: string | null;
  bio: string | null;
  status: string;
  interaction_count: number;
  days_since_assigned: number;
  /** Solo se llena para leads high_fit (Apify-scraped). Si está
   *  presente, el LLM lo usa para escribir comments referenciando
   *  posts reales en vez de imaginar a partir del bio. */
  recent_posts?: RecentPost[] | null;
}

export function buildSystemPrompt(spammerAccounts: SpammerAccount[]): string {
  const accountLines = spammerAccounts
    .map(
      (a) =>
        `- @${a.instagram_handle} (${a.followers_count ?? "?"} seguidores, nicho: ${a.account_niche}, bio: "${a.bio ?? ""}")`,
    )
    .join("\n");
  return SYSTEM_PROMPT.replace("{{SPAMMER_ACCOUNTS_PLACEHOLDER}}", accountLines);
}

export function buildUserMessage(leads: LeadForPrompt[]): string {
  const lines = leads.map((l, i) => {
    const base = `${i + 1}. @${l.instagram_handle} | Score: ${l.ai_score ?? "N/A"} | Seguidores: ${l.followers ?? "?"} | Pais: ${l.country ?? "?"} | Bio: "${l.bio ?? ""}" | Status: ${l.status} | Interacciones previas: ${l.interaction_count} | Ultimo contacto: ${l.days_since_assigned} dias`;
    if (l.recent_posts && l.recent_posts.length > 0) {
      // Compactamos cada post a 1 línea: URL + caption truncado a 150
      // chars. Con 5 posts × ~150 chars pesa ~800 chars extra por
      // lead — manejable porque solo high_fit los recibe.
      const postsBlock = l.recent_posts
        .slice(0, 5)
        .map((p, j) => {
          const cap = (p.caption ?? "").slice(0, 150).replace(/\s+/g, " ").trim();
          return `  Post ${j + 1}: ${p.url} | "${cap}"`;
        })
        .join("\n");
      return `${base}\n  recent_posts:\n${postsBlock}`;
    }
    return base;
  });
  return `Leads para asignar tareas:\n${lines.join("\n")}`;
}
