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
- Instrucciones deben ser accionables: "Entra al perfil de @X, dale like a sus ultimos 3 posts"`;

export interface SpammerAccount {
  instagram_handle: string;
  followers_count: number | null;
  account_niche: string;
  bio: string | null;
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
  const lines = leads
    .map(
      (l, i) =>
        `${i + 1}. @${l.instagram_handle} | Score: ${l.ai_score ?? "N/A"} | Seguidores: ${l.followers ?? "?"} | Pais: ${l.country ?? "?"} | Bio: "${l.bio ?? ""}" | Status: ${l.status} | Interacciones previas: ${l.interaction_count} | Ultimo contacto: ${l.days_since_assigned} dias`,
    )
    .join("\n");
  return `Leads para asignar tareas:\n${lines}`;
}
