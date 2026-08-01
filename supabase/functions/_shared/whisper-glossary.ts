// whisper-glossary.ts — el glosario que se le pasa a Whisper como `prompt`.
//
// POR QUÉ: Whisper transcribe fonéticamente lo que no conoce. En un día real
// (31/07, DM de Álvaro) eso produjo "hágame un shit" (dijo: sheet), "el hop stop"
// (Hubstaff), "arroba calorina" (Carolina) y "al Ixep" (a Lizeth) — y sobre esas
// palabras el bot toma decisiones. El campo `prompt` de la API (OpenAI-compatible;
// lo honran tanto faster-whisper-server como Groq) sesga la decodificación hacia
// el vocabulario esperado: es EL mecanismo estándar para jerga y nombres propios.
//
// Cómo funciona: Whisper lo trata como "texto que vino justo antes del audio", no
// como una instrucción. Por eso tiene forma de oración con los términos adentro,
// y no de comando. Tope práctico: Groq corta a 224 tokens — mantenerlo corto.
//
// Dos fuentes:
//   · FIJO: herramientas y jerga de la agencia + nombres del equipo. Nombres
//     nuevos que Whisper masacre → agregarlos ACÁ.
//   · DINÁMICO: los display names de los miembros del grupo del mensaje (en un
//     DM no aparece el equipo — por eso el fijo lleva los nombres igual).

// deno-lint-ignore-file no-explicit-any

const HERRAMIENTAS = [
  "Hubstaff", "Google Sheets", "un sheet", "OnlyFans", "Maven", "Clari",
  "Promolog", "BLU", "warming", "chatters", "closers", "Unlimited",
  "cloud phone", "Instagram", "Telegram", "TikTok",
];

// Nombres que aparecen en los audios del equipo. Whisper acierta mucho más si
// los vio en el prompt ("Lizeth" no es una palabra que su LM español espere).
const EQUIPO = [
  "Álvaro", "Jhon", "Brayan", "Lizeth", "Isabel", "Daniel", "Carolina",
  "Fabiana", "Juanse", "Julieth", "Miguel", "María", "Luis", "Kash",
];

/** Nombres de los miembros del grupo (para audios de grupos: quién habla y a
 *  quién nombran suele estar ahí). Falla en silencio: el glosario es una ayuda,
 *  nunca un motivo para no transcribir. */
async function memberNames(sb: any, groupId: string | null): Promise<string[]> {
  if (!sb || !groupId) return [];
  try {
    const { data } = await sb
      .from("whatsapp_members")
      .select("display_name")
      .eq("group_id", groupId)
      .eq("active", true)
      .limit(30);
    return (data ?? [])
      .map((m: any) => String(m.display_name ?? "").trim())
      // Sin números pelados ni strings vacíos; un display name telefónico no ayuda.
      .filter((n: string) => n && !/^\+?\d[\d\s-]*$/.test(n));
  } catch {
    return [];
  }
}

/** Las CREADORAS activas — de quiénes más se habla en los audios ("Moramay",
 *  "Suunnhoney", "Yoisnia" son irreconocibles para el LM español de Whisper).
 *  Nombre artístico primero (es lo que se DICE en voz alta); tope corto porque
 *  el prompt entero no puede pasar de ~224 tokens. */
async function creatorNames(sb: any): Promise<string[]> {
  if (!sb) return [];
  try {
    const { data } = await sb
      .from("creators")
      .select("artistic_name, name")
      .eq("status", "active")
      .limit(80);
    return (data ?? [])
      .map((c: any) => String(c.artistic_name ?? c.name ?? "").trim())
      .filter((n: string) => n.length >= 3)
      .slice(0, 50);
  } catch {
    return [];
  }
}

export interface Glossary {
  /** Oración de contexto para el `prompt` estándar (lo honran self-host y Groq). */
  prompt: string;
  /** Lista pelada para `hotwords` de speaches (SOLO self-host — Groq no lo acepta).
   *  A diferencia del prompt, que solo condiciona la primera ventana de 30s,
   *  hotwords sigue activo en todas las ventanas de un audio largo. */
  hotwords: string;
}

/** Arma el vocabulario para un audio de este grupo.
 *  ORDEN A PROPÓSITO: creadoras primero, herramientas al FINAL. Si el prompt
 *  excede el tope, Whisper se queda con los ÚLTIMOS ~224 tokens y descarta el
 *  principio — lo que se recorta primero son creadoras (degradación aceptable),
 *  nunca "Hubstaff"/"sheet"/el equipo, que son los errores ya vistos en prod. */
export async function buildGlossary(sb: any, groupId: string | null): Promise<Glossary> {
  const [creadoras, extra] = await Promise.all([creatorNames(sb), memberNames(sb, groupId)]);
  // dedup case-insensitive conservando la primera forma
  const seen = new Set<string>();
  const all = [...creadoras, ...extra, ...EQUIPO, ...HERRAMIENTAS].filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // ⚠️ TOPE DURO DE GROQ: prompt ≤ 896 CARACTERES (no tokens). Con 50 creadoras
  // el prompt daba 1015 y Groq devolvía 400 — o sea el fallback moría JUSTO
  // cuando más se lo necesita (self-host caído/lento) y el audio quedaba
  // "[transcripción falló]". Se recorta desde el PRINCIPIO (por diseño ahí van
  // las creadoras): lo crítico —equipo y herramientas— vive al final y no se toca.
  const PROMPT_MAX = 880;
  const prefix = `Nota de voz del equipo de la agencia Kash, sobre gestión de modelos. Suelen nombrar a `;
  let terms = all.slice(0, 85);
  let prompt = `${prefix}${terms.join(", ")}.`;
  while (prompt.length > PROMPT_MAX && terms.length > 1) {
    terms = terms.slice(1);
    prompt = `${prefix}${terms.join(", ")}.`;
  }
  return {
    prompt,
    // hotwords no pasa por Groq (solo speaches), pero comparte la ventana de
    // contexto de Whisper — mismo recorte para no desbordarla en silencio.
    hotwords: terms.join(", "),
  };
}

/** Compat: la firma vieja (solo el prompt). */
export async function buildGlossaryPrompt(sb: any, groupId: string | null): Promise<string> {
  return (await buildGlossary(sb, groupId)).prompt;
}
