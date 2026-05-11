// Helper compartido — loggea uso de APIs externas en api_usage_log.
// Una row por call. Lo usan las edge functions que invocan Anthropic,
// ElevenLabs, OpenAI, etc. ScrapeCreators tiene su propio camino (el
// worker escribe directo desde servicios/scouter-worker/src/storage.ts).
//
// Precios (USD por millón de tokens / hora de audio):
//   anthropic claude-sonnet-4-6:
//     input        $3.00
//     output       $15.00
//     cache_read   $0.30
//     cache_create $3.75
//   anthropic claude-haiku-4-5:
//     input  $0.80, output $4.00 (similar ratios)
//   elevenlabs scribe_v1: $0.40 / hora de audio
//
// Si el modelo es desconocido, costo = 0 (NO falla la edge function por
// no poder calcular el costo — preferimos perder telemetría que romper
// la feature).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ElevenLabsUsage {
  audio_seconds: number;
}

interface ApiUsageBase {
  operation: string;
  model?: string;
  context?: Record<string, unknown>;
  tenantId?: string | null;
}

// Pricing por modelo (USD por millón de tokens, salvo elevenlabs que es
// USD por hora). Lista actualizada 2026-05. Si el modelo no está acá,
// cost = 0 (mejor que crashear).
const ANTHROPIC_PRICING: Record<string, { in: number; out: number; cache_read: number; cache_create: number }> = {
  // Claude 4.x family
  "claude-opus-4-7":         { in: 15,   out: 75,   cache_read: 1.5,  cache_create: 18.75 },
  "claude-opus-4-6":         { in: 15,   out: 75,   cache_read: 1.5,  cache_create: 18.75 },
  "claude-sonnet-4-6":       { in: 3,    out: 15,   cache_read: 0.3,  cache_create: 3.75 },
  "claude-sonnet-4-5":       { in: 3,    out: 15,   cache_read: 0.3,  cache_create: 3.75 },
  "claude-haiku-4-5":        { in: 0.80, out: 4,    cache_read: 0.08, cache_create: 1.0  },
  "claude-haiku-4-5-20251001": { in: 0.80, out: 4,  cache_read: 0.08, cache_create: 1.0  },
};

// $/hora de audio. Default scribe_v1.
const ELEVENLABS_PRICING_PER_HOUR: Record<string, number> = {
  "scribe_v1": 0.40,
};

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return createClient(url, key);
}

function calcAnthropicCost(model: string, u: ClaudeUsage): number {
  const p = ANTHROPIC_PRICING[model];
  if (!p) return 0;
  const tin = u.input_tokens ?? 0;
  const tout = u.output_tokens ?? 0;
  const tcr = u.cache_read_input_tokens ?? 0;
  const tcc = u.cache_creation_input_tokens ?? 0;
  return (tin * p.in + tout * p.out + tcr * p.cache_read + tcc * p.cache_create) / 1_000_000;
}

function calcElevenLabsCost(model: string, u: ElevenLabsUsage): number {
  const perHour = ELEVENLABS_PRICING_PER_HOUR[model] ?? 0;
  if (perHour === 0) return 0;
  return (u.audio_seconds / 3600) * perHour;
}

/** Loggea uso de Anthropic. Falla silenciosa — no rompe el flow. */
export async function logAnthropicUsage(
  args: ApiUsageBase & { model: string; usage: ClaudeUsage },
): Promise<void> {
  try {
    const sb = adminClient();
    const cost = calcAnthropicCost(args.model, args.usage);
    await sb.from("api_usage_log").insert({
      provider: "anthropic",
      operation: args.operation,
      model: args.model,
      units: {
        input_tokens: args.usage.input_tokens ?? 0,
        output_tokens: args.usage.output_tokens ?? 0,
        cache_read_input_tokens: args.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: args.usage.cache_creation_input_tokens ?? 0,
      },
      cost_usd: cost,
      context: args.context ?? {},
      tenant_id: args.tenantId ?? null,
    });
  } catch (e) {
    console.warn("logAnthropicUsage failed:", (e as Error).message);
  }
}

/** Loggea uso de ElevenLabs. Falla silenciosa. */
export async function logElevenLabsUsage(
  args: ApiUsageBase & { model: string; audioSeconds: number; characters?: number },
): Promise<void> {
  try {
    const sb = adminClient();
    const cost = calcElevenLabsCost(args.model, { audio_seconds: args.audioSeconds });
    await sb.from("api_usage_log").insert({
      provider: "elevenlabs",
      operation: args.operation,
      model: args.model,
      units: {
        audio_seconds: args.audioSeconds,
        characters: args.characters ?? null,
      },
      cost_usd: cost,
      context: args.context ?? {},
      tenant_id: args.tenantId ?? null,
    });
  } catch (e) {
    console.warn("logElevenLabsUsage failed:", (e as Error).message);
  }
}
