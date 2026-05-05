// Budget guard de Apify. La tabla scouter_apify_budget tiene una row
// por día por tenant; el worker debe verificar ANTES de disparar un
// run de Apify si todavía hay cuota disponible. Tras terminar, suma
// el spend estimado y los items procesados.

import { sb } from "./db.ts";

const DAILY_CAP_USD = parseInt(process.env.APIFY_DAILY_BUDGET_USD ?? "10", 10);

const today = (): string => new Date().toISOString().slice(0, 10);

interface BudgetRow {
  day: string;
  est_spend_usd: number;
  runs_count: number;
  items_processed: number;
  tenant_id: string;
}

/** Devuelve true si el tenant todavía tiene budget para Apify hoy. */
export async function checkBudget(tenantId: string): Promise<{
  ok: boolean;
  remainingUsd: number;
  reason?: string;
}> {
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
  const spent = (data as BudgetRow | null)?.est_spend_usd ?? 0;
  const remaining = Math.max(0, DAILY_CAP_USD - spent);
  if (remaining <= 0) {
    return {
      ok: false,
      remainingUsd: 0,
      reason: `daily Apify budget de $${DAILY_CAP_USD} agotado (gastado $${spent}).`,
    };
  }
  return { ok: true, remainingUsd: remaining };
}

/** Suma spend + items al row del día. Crea la row si no existe (PK = day). */
export async function recordSpend(
  tenantId: string,
  spendUsd: number,
  itemsProcessed: number,
): Promise<void> {
  const day = today();
  // Upsert sumando — Postgres no tiene UPSERT con SUM nativo, así que
  // hacemos read-modify-write. Si dos workers corren paralelo en mismo
  // tenant esto tiene race condition, pero hoy single-worker basta.
  const { data: existing } = await sb
    .from("scouter_apify_budget")
    .select("est_spend_usd, runs_count, items_processed")
    .eq("tenant_id", tenantId)
    .eq("day", day)
    .maybeSingle();

  const next = {
    day,
    tenant_id: tenantId,
    est_spend_usd: ((existing as { est_spend_usd?: number } | null)?.est_spend_usd ?? 0) + Math.round(spendUsd),
    runs_count: ((existing as { runs_count?: number } | null)?.runs_count ?? 0) + 1,
    items_processed:
      ((existing as { items_processed?: number } | null)?.items_processed ?? 0) + itemsProcessed,
  };
  const { error } = await sb
    .from("scouter_apify_budget")
    .upsert(next, { onConflict: "day,tenant_id" });
  if (error) {
    console.error("recordSpend upsert error", error);
  }
}
