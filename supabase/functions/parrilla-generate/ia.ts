// Redacción con IA de una parrilla — núcleo compartido.
//
// Lo usan dos entradas: el botón "Generar con IA" del editor (parrilla-generate,
// con el JWT del caller → RLS decide) y el cron de los jueves (parrilla-weekly,
// con service role). Por eso recibe el cliente de Supabase ya construido y no
// sabe nada de auth: quien llama decide con qué permisos se lee y se escribe.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
// Desde el 01/10/2026 va por OpenRouter con un Gemini económico: Maven ya no tiene
// llave de Anthropic. El modelo se cambia sin desplegar con IA_MODELO_OPENROUTER.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODELO_ECONOMICO = "google/gemini-2.5-flash-lite";
const PRECIO_LISTA: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
};
const IA_TIMEOUT_MS = 110_000;

/** El costo en US$: el que informa OpenRouter (usage.cost) o, si no vino, el de lista. */
export function costoDeUso(modelo: string, u: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined): number {
  if (typeof u?.cost === "number") return u.cost;
  const p = PRECIO_LISTA[modelo];
  if (!p) return 0;
  return ((u?.prompt_tokens ?? 0) * p.in + (u?.completion_tokens ?? 0) * p.out) / 1_000_000;
}

export interface DiaGenerado {
  day_index: number;
  idea: string;
  copy_sugerido: string;
  extra_title?: string;
  extra_desc: string;
  extra_items: Array<{ momento?: string; label: string; copy: string }>;
}

export interface GridRef { id: string; week_start: string; week_end: string }

const SYSTEM_PROMPT = `Eres quien redacta la PARRILLA DE PROMOCIÓN semanal de una agencia de creadoras de OnlyFans: el plan diario que cada creadora ejecuta en sus redes. Escribes en ESPAÑOL LATINO NEUTRO, con el tono cercano y pícaro del material de referencia.

REGLAS DURAS (no negociables):
- Instagram: lenguaje limpio y NO sexual explícito, sin precios ni llamadas agresivas; el emoji 💙 es el ÚNICO código permitido para aludir al OnlyFans.
- X y Telegram: canal directo de venta; toda urgencia debe poder ser REAL (cupos, horas límite) y toda oferta debe existir antes de anunciarse.
- JAMÁS inventes URLs, handles ni nombres de creadoras.
- No repitas los copys de las semanas anteriores: varía ideas, ganchos y ángulos. Sí mantén el espíritu de cada tipo de día.
- Copys cortos y naturales, como los del material de referencia (1-2 frases). Nada de muros de texto.

Vas a recibir el ESQUELETO de la semana (día por día: fecha, día de semana, formato, franja, tipo de acción extra y cuántas burbujas de copy espera), las parrillas ANTERIORES, el FEEDBACK de las managers y, si existe, el DIFF entre lo que generó la IA y lo que las managers corrigieron a mano (eso te dice qué NO les gustó — no repitas esos patrones).

Entrega el resultado LLAMANDO a la tool entregar_parrilla:
- "idea" = idea de material del día (concreta y filmable/fotografiable).
- "copy_sugerido" va ENTRE COMILLAS dentro del string, como en el material de referencia.
- "extra_items" debe tener EXACTAMENTE la cantidad de burbujas que indica el esqueleto para ese día (respeta los momentos mañana/tarde/noche si el esqueleto los trae).
- Mantén "extra_title" muy parecido al actual (es el nombre de la sección).
- Un elemento por CADA día del esqueleto, en orden.`;

// Salida estructurada forzando la herramienta: la respuesta viene como los
// argumentos de esta función, con este schema (la primera versión pedía "responde
// solo JSON" y parseaba texto: se rompía).
const TOOL_ENTREGAR = {
  name: "entregar_parrilla",
  description: "Entrega los días redactados de la parrilla",
  input_schema: {
    type: "object",
    required: ["dias"],
    properties: {
      dias: {
        type: "array",
        items: {
          type: "object",
          required: ["day_index", "idea", "copy_sugerido", "extra_desc", "extra_items"],
          properties: {
            day_index: { type: "integer" },
            idea: { type: "string" },
            copy_sugerido: { type: "string" },
            extra_title: { type: "string" },
            extra_desc: { type: "string" },
            extra_items: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "copy"],
                properties: {
                  momento: { type: "string", enum: ["mañana", "tarde", "noche"] },
                  label: { type: "string" },
                  copy: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export class IaError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Llama a la IA con el esqueleto + la historia y devuelve los días redactados.
// No escribe nada: eso lo hace aplicarRedaccion.
export async function redactarParrilla(
  sb: SupabaseClient,
  grid: GridRef,
  days: any[],
  contexto: Record<string, unknown> = {},
): Promise<{ generados: DiaGenerado[]; model: string }> {
  // Historia: hasta 4 parrillas anteriores con su contenido y feedback.
  const { data: prevGrids } = await sb
    .from("content_grids")
    .select("id, week_start, feedback, generated_snapshot")
    .lt("week_start", grid.week_start)
    .order("week_start", { ascending: false })
    .limit(4);
  const prevIds = (prevGrids ?? []).map((g) => g.id);
  const { data: prevDays } = prevIds.length
    ? await sb
      .from("content_grid_days")
      .select("grid_id, day_index, date, format_badge, idea, copy_sugerido, extra_type, extra_title, extra_desc, extra_items")
      .in("grid_id", prevIds)
      .order("day_index")
    : { data: [] as any[] };

  const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const diaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()];

  const esqueleto = days.map((d) => ({
    day_index: d.day_index,
    fecha: d.date,
    dia_semana: diaSemana(d.date),
    formato: d.format_badge,
    franja: d.franja,
    extra_type: d.extra_type,
    extra_title_actual: d.extra_title,
    burbujas_esperadas: Array.isArray(d.extra_items)
      ? d.extra_items.map((it: any) => ({ momento: it.momento || undefined, label_actual: it.label }))
      : [],
    referencias_reels: Array.isArray(d.refs) ? d.refs.length : 0,
  }));

  const historia = (prevGrids ?? []).map((g) => ({
    semana: g.week_start,
    feedback_manager: g.feedback || null,
    // Diff de aprendizaje: qué generó la IA vs qué quedó tras la mano humana.
    lo_que_genero_la_ia: g.generated_snapshot?.days ?? null,
    contenido_final: (prevDays ?? [])
      .filter((d) => d.grid_id === g.id)
      .map(({ grid_id: _g, ...rest }) => rest),
  }));

  const userMessage = JSON.stringify({
    semana_a_generar: { week_start: grid.week_start, week_end: grid.week_end, esqueleto },
    parrillas_anteriores: historia,
  });

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new IaError("Falta OPENROUTER_API_KEY", 500);
  const model = Deno.env.get("IA_MODELO_OPENROUTER") || MODELO_ECONOMICO;
  const { generados, uso } = await pedirParrilla(fetch, apiKey, model, userMessage);
  void sb.from("api_usage_log").insert({
    provider: "openrouter",
    operation: "parrilla_generate",
    model,
    units: { input_tokens: uso?.prompt_tokens ?? 0, output_tokens: uso?.completion_tokens ?? 0 },
    cost_usd: costoDeUso(model, uso),
    context: { grid_id: grid.id, week_start: grid.week_start, ...contexto },
  }).then(({ error }) => { if (error) console.warn("api_usage_log:", error.message); });
  return { generados, model };
}

// La llamada: fuerza la herramienta entregar_parrilla y devuelve sus «dias».
export async function pedirParrilla(
  f: typeof fetch,
  apiKey: string,
  model: string,
  userMessage: string,
): Promise<{ generados: DiaGenerado[]; uso?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } }> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), IA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await f(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.maven-ai.me",
        "X-Title": "Maven",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        tools: [{
          type: "function",
          function: { name: TOOL_ENTREGAR.name, description: TOOL_ENTREGAR.description, parameters: TOOL_ENTREGAR.input_schema },
        }],
        tool_choice: { type: "function", function: { name: TOOL_ENTREGAR.name } },
        usage: { include: true },
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new IaError("La IA tardó demasiado, reintenta", 504);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error("openrouter error", res.status, body.slice(0, 500));
    throw new IaError(`La IA respondió ${res.status}`, 502);
  }
  const payload = await res.json();
  const llamada = (payload?.choices?.[0]?.message?.tool_calls ?? [])
    .find((c: any) => c?.function?.name === TOOL_ENTREGAR.name);
  let generados: DiaGenerado[] = [];
  try {
    generados = JSON.parse(llamada?.function?.arguments ?? "{}")?.dias ?? [];
  } catch { generados = []; }
  if (!Array.isArray(generados) || !generados.length) {
    console.error("sin entregar_parrilla utilizable; finish_reason:", payload?.choices?.[0]?.finish_reason,
      "message:", JSON.stringify(payload?.choices?.[0]?.message).slice(0, 400));
    throw new IaError("La IA no devolvió días, reintenta", 502);
  }
  return { generados, uso: payload?.usage };
}

// Aplica SOLO los textos, día por día, guarda el snapshot de lo generado (contra
// eso se diffean las ediciones humanas) y re-deriva las tareas esperadas.
// Con un cliente RLS, 0 filas sin error = sin permiso → IaError 403.
export async function aplicarRedaccion(
  sb: SupabaseClient,
  gridId: string,
  days: any[],
  generados: DiaGenerado[],
  model: string,
): Promise<number> {
  let actualizados = 0;
  for (const gDay of generados) {
    const original = days.find((d) => d.day_index === gDay.day_index);
    if (!original || typeof gDay.idea !== "string" || typeof gDay.copy_sugerido !== "string") continue;
    const itemsOriginales: any[] = Array.isArray(original.extra_items) ? original.extra_items : [];
    const itemsGenerados = Array.isArray(gDay.extra_items) ? gDay.extra_items : [];
    // Misma cantidad de burbujas que el esqueleto: se casan por posición y se
    // conserva el momento original (mañana/tarde/noche) si la IA lo omitió.
    const extra_items = itemsOriginales.map((orig, i) => ({
      ...(orig.momento ? { momento: orig.momento } : {}),
      label: itemsGenerados[i]?.label?.trim() || orig.label,
      copy: itemsGenerados[i]?.copy?.trim() || orig.copy,
    }));
    const { data: upd, error: uErr } = await sb
      .from("content_grid_days")
      .update({
        idea: gDay.idea.trim(),
        copy_sugerido: gDay.copy_sugerido.trim(),
        extra_title: gDay.extra_title?.trim() || original.extra_title,
        extra_desc: (gDay.extra_desc ?? original.extra_desc).trim(),
        extra_items,
      })
      .eq("id", original.id)
      .select("id");
    if (uErr) throw uErr;
    if (!upd?.length) throw new IaError("Sin permiso para editar la parrilla", 403);
    actualizados++;
  }
  if (!actualizados) throw new IaError("La IA no devolvió ningún día aplicable", 502);

  const { data: gUpd, error: sErr } = await sb
    .from("content_grids")
    .update({
      generated_snapshot: { generated_at: new Date().toISOString(), model, days: generados },
      updated_at: new Date().toISOString(),
    })
    .eq("id", gridId)
    .select("id");
  if (sErr) throw sErr;
  if (!gUpd?.length) throw new IaError("Sin permiso para editar la parrilla", 403);

  const { error: tErr } = await sb.rpc("parrilla_derive_tasks", { p_grid_id: gridId });
  if (tErr) throw tErr;
  return actualizados;
}
