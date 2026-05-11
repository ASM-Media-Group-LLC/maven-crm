// Guardrails de gasto contra ScrapeCreators. Dos capas:
//
//   1. Daily cap por requests. Reset automático al cambiar el día UTC
//      (PK de la tabla es `day`). Default ~870 requests = ~$2 USD a
//      $0.0023 por request.
//
//   2. Cooldown global (cuenta sin créditos). Se setea desde
//      scrapecreators.ts cuando la API devuelve 402/credit-depleted.
//      Reset MANUAL — admin tiene que limpiar `cooldown_until` después
//      de cargar créditos en ScrapeCreators.

import { sb } from "./db.ts";

const DAILY_REQUEST_CAP = parseInt(
  process.env.SCRAPECREATORS_DAILY_REQUEST_CAP ?? "870",
  10,
);
const COST_PER_REQUEST_USD = 0.0023;
const TOKEN_KEY = "scrapecreators";

const today = (): string => new Date().toISOString().slice(0, 10);

interface BudgetRow {
  day: string;
  est_spend_usd: number;
  runs_count: number;
  items_processed: number;
  tenant_id: string;
}

/** Devuelve true si todavía hay budget hoy.
 *  Chequea PRIMERO el cooldown global (account out of credits) — eso
 *  pisa todo. Después el cap diario por requests.
 */
export async function checkBudget(tenantId: string): Promise<{
  ok: boolean;
  remainingUsd: number;
  reason?: string;
}> {
  // 1) Cooldown global: si está seteado y todavía vigente, refuse.
  const { data: tokenRow } = await sb
    .from("scouter_apify_token_state")
    .select("cooldown_until, last_error")
    .eq("token_suffix", TOKEN_KEY)
    .maybeSingle();
  const cooldown = (tokenRow as { cooldown_until?: string | null; last_error?: string | null } | null);
  if (cooldown?.cooldown_until) {
    const until = new Date(cooldown.cooldown_until).getTime();
    if (until > Date.now()) {
      return {
        ok: false,
        remainingUsd: 0,
        reason:
          `ScrapeCreators sin créditos (${cooldown.last_error ?? "credits exhausted"}). ` +
          `Cargá créditos y limpiá scouter_apify_token_state.cooldown_until.`,
      };
    }
  }

  // 2) Daily request cap.
  const day = today();
  const { data, error } = await sb
    .from("scouter_apify_budget")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .maybeSingle();
  if (error) {
    return { ok: false, remainingUsd: 0, reason: `budget read error: ${error.message}` };
  }
  // items_processed se incrementa REAL (entero), así que es el contador
  // confiable. est_spend_usd quedó como remanente histórico — se mantiene
  // por compat pero no se usa para gating.
  const used = (data as BudgetRow | null)?.items_processed ?? 0;
  const remainingRequests = Math.max(0, DAILY_REQUEST_CAP - used);
  if (remainingRequests <= 0) {
    const usedUsd = (used * COST_PER_REQUEST_USD).toFixed(2);
    const capUsd = (DAILY_REQUEST_CAP * COST_PER_REQUEST_USD).toFixed(2);
    return {
      ok: false,
      remainingUsd: 0,
      reason:
        `Daily ScrapeCreators budget agotado (${used}/${DAILY_REQUEST_CAP} requests, ~$${usedUsd} de $${capUsd}). ` +
        `Reset automático al cambiar el día UTC.`,
    };
  }
  return {
    ok: true,
    remainingUsd: remainingRequests * COST_PER_REQUEST_USD,
  };
}

/** Suma spend + items al row del día. Crea la row si no existe (PK = day,tenant_id).
 *  itemsProcessed = cantidad de requests reales hechos. spendUsd se mantiene en
 *  est_spend_usd pero ya no se usa para gating (rounding bug hacía que 0.0023 se
 *  redondeara a 0 y nunca acumulara). */
export async function recordSpend(
  tenantId: string,
  spendUsd: number,
  itemsProcessed: number,
): Promise<void> {
  const day = today();
  const { data: existing } = await sb
    .from("scouter_apify_budget")
    .select("est_spend_usd, runs_count, items_processed")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .maybeSingle();

  const next = {
    day,
    tenant_id: tenantId,
    est_spend_usd:
      ((existing as { est_spend_usd?: number } | null)?.est_spend_usd ?? 0) +
      Math.round(spendUsd),
    runs_count: ((existing as { runs_count?: number } | null)?.runs_count ?? 0) + 1,
    items_processed:
      ((existing as { items_processed?: number } | null)?.items_processed ?? 0) +
      itemsProcessed,
  };
  const { error } = await sb
    .from("scouter_apify_budget")
    .upsert(next, { onConflict: "day,tenant_id" });
  if (error) {
    console.error("recordSpend upsert error", error);
  }
}

/** Marca cooldown global indefinido — usar cuando ScrapeCreators devuelva
 *  402/credit-depleted. El admin debe limpiar `cooldown_until` manualmente
 *  después de cargar créditos. */
export async function markCreditsDepleted(errMsg: string): Promise<void> {
  const farFuture = "2099-12-31T00:00:00Z";
  const { error } = await sb
    .from("scouter_apify_token_state")
    .upsert(
      {
        token_suffix: TOKEN_KEY,
        cooldown_until: farFuture,
        last_error: errMsg.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token_suffix" },
    );
  if (error) console.error("markCreditsDepleted error", error);
}
