// Queue dispatcher. Cada tick:
//  1. SELECT N jobs queued ordenados por priority DESC, created_at ASC.
//  2. Para cada uno: marca "running" + started_at, ejecuta el handler,
//     marca "done" o "failed" (con incremento de attempts).
//  3. Si attempts >= max_attempts y falla, queda failed permanente.
//
// Single-worker: este código asume que solo corre una instancia. Si hace
// falta escalar a múltiples workers, hay que reemplazar el SELECT por
// `SELECT ... FOR UPDATE SKIP LOCKED` para evitar que dos workers
// agarren el mismo job. Hoy no es necesario y agregar locking complica.

import { sb } from "./db.ts";
import {
  handleDiscoverHashtag,
  handleDiscoverSeed,
} from "./handlers/discover.ts";
import { handleEnrichProfile } from "./handlers/enrich.ts";
import { handleEnrichHandle } from "./handlers/enrichHandle.ts";
import { handleScoreLead } from "./handlers/score.ts";
import { handleRefreshPosts } from "./handlers/refreshPosts.ts";
import type { JobResult, ScouterJob } from "./types.ts";

const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE ?? "3", 10);
const JOB_TIMEOUT_MS = parseInt(process.env.WORKER_JOB_TIMEOUT_MS ?? "120000", 10);

/**
 * Devuelve los tenant_ids cuyo autopilot está active=true. Si NULL
 * (error de lectura), el caller debe asumir "sin filtro" — fallback
 * conservador para no apagar el worker por un glitch de DB.
 */
async function getActiveTenantIds(): Promise<string[] | null> {
  const { data, error } = await sb
    .from("scouter_autopilot")
    .select("tenant_id")
    .eq("active", true);
  if (error) {
    console.warn("[autopilot-gate] read error, proceeding without filter:", error.message);
    return null;
  }
  return ((data ?? []) as Array<{ tenant_id: string }>).map((r) => r.tenant_id);
}

async function fetchQueuedJobs(): Promise<ScouterJob[]> {
  // Gate del autopilot: si el toggle está OFF para todos los tenants,
  // ni siquiera miramos scouter_jobs. Esto cierra el ciclo donde el
  // worker seguía poleando aunque vos pausaras desde "búsquedas" — los
  // jobs antes seguían pickeándose y fallando con "budget agotado".
  // Con el gate, paused = cero escrituras a scouter_jobs.
  const activeTenants = await getActiveTenantIds();
  if (activeTenants !== null && activeTenants.length === 0) {
    return [];
  }

  // Respetar next_retry_at: si el job está esperando su backoff, NO lo
  // pickeamos. Sin este filtro, el worker re-pickeaba jobs en estado
  // "provider-paused" cada 15s, generando 2 UPDATEs por ciclo.
  const nowIso = new Date().toISOString();
  let q = sb
    .from("scouter_jobs")
    .select("*")
    .eq("status", "queued")
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  // Solo aplicamos el filtro si tenemos lista válida de tenants activos.
  if (activeTenants !== null && activeTenants.length > 0) {
    q = q.in("tenant_id", activeTenants);
  }
  const { data, error } = await q;
  if (error) {
    console.error("fetchQueuedJobs error", error);
    return [];
  }
  return (data ?? []) as ScouterJob[];
}

async function markRunning(job: ScouterJob): Promise<boolean> {
  // CAS-style: solo actualizamos si sigue queued. Sin esto, si dos
  // workers corrieran a la vez podrían procesar el mismo job. Hoy es
  // single-worker pero el guard es barato.
  const { data, error } = await sb
    .from("scouter_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markRunning error", error);
    return false;
  }
  return data !== null;
}

async function markDone(job: ScouterJob, result: JobResult): Promise<void> {
  const { error } = await sb
    .from("scouter_jobs")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      result,
      last_error: null,
    })
    .eq("id", job.id);
  if (error) console.error("markDone error", error);
}

async function markFailed(
  job: ScouterJob,
  errMsg: string,
  exhausted: boolean,
): Promise<void> {
  // Backoff exponencial para retries: 2^attempts minutos (1, 2, 4, 8…)
  // capeado a 30 min. Con max_attempts=3, el cap nunca se alcanza, pero
  // dejamos el límite por seguridad.
  const backoffMin = Math.min(2 ** job.attempts, 30);
  const nextRetryAt = exhausted ? null : new Date(Date.now() + backoffMin * 60_000).toISOString();
  const { error } = await sb
    .from("scouter_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      last_error: errMsg.slice(0, 1000),
      ...(exhausted ? { completed_at: new Date().toISOString() } : { next_retry_at: nextRetryAt }),
    })
    .eq("id", job.id);
  if (error) console.error("markFailed error", error);
}

// Detecta errores de "el proveedor está pausado" — el job no está
// realmente fallando, hay que esperar al reset (cuota mensual de Apify,
// recarga de créditos de ScrapeCreators, o reset diario del cap local).
// Si dejamos que cuenten como attempt normal, los 3 reintentos se
// gastan en un par de minutos y el job queda failed permanente,
// perdiendo trabajo legítimo. Mejor: dejarlo en queued para que el
// próximo tick lo retome cuando el cooldown se levante.
function isProviderPausedError(msg: string): boolean {
  return (
    // Apify (legacy)
    /Monthly usage hard limit|usage limit (has been )?reached|quota.*exceeded|usage.*restricted/i.test(msg) ||
    // ScrapeCreators credits depleted (prefijo seteado por scrapecreators.ts)
    /scrapecreators-credits-depleted/i.test(msg) ||
    // checkBudget refusing — daily cap o cooldown global
    /Daily ScrapeCreators budget agotado|ScrapeCreators sin cr[eé]ditos/i.test(msg)
  );
}

// Errores PERMANENTES: cuentas privadas, inexistentes, handles inválidos.
// El retry NO va a cambiar el resultado porque la cuenta no existe o IG
// la marcó privada. Cada retry sigue consumiendo créditos de ScrapeCreators
// porque la API SÍ recibe la request (solo devuelve "no datos").
//
// Antes del fix: 337 jobs fallidos × 3 retries = ~1000 calls desperdiciadas
// = $2.30/sem en cuentas que nunca van a responder.
//
// Ahora: detectamos el patrón "no devolvió datos" en el mensaje de error
// y marcamos failed inmediatamente sin retry.
function isPermanentNotFoundError(msg: string): boolean {
  return (
    /no devolvi[oó] datos.*cuenta privada.*inexistente/i.test(msg) ||
    /handle.*no encontrado/i.test(msg) ||
    /perfil.*no existe/i.test(msg) ||
    /account.*not found/i.test(msg)
  );
}

// Rollback del attempt + devuelve el job a queued con backoff.
// CRÍTICO: sin next_retry_at el worker re-pickeaba este job cada 15s
// (ciclo de polling) generando 2 UPDATEs por ciclo. Eso explicaba el
// disk IO storm con 530k updates / semana en una tabla de 3k rows.
// Con 3h de espera caen a ~16 ciclos/día → ~32 updates/día por job
// paused (vs ~5.700 sin backoff). Reducción ~180x.
const PROVIDER_PAUSED_BACKOFF_MIN = 180;
async function rescheduleNoAttempt(job: ScouterJob, errMsg: string): Promise<void> {
  const nextRetryAt = new Date(Date.now() + PROVIDER_PAUSED_BACKOFF_MIN * 60_000).toISOString();
  const { error } = await sb
    .from("scouter_jobs")
    .update({
      status: "queued",
      attempts: job.attempts, // restaura — markRunning había puesto attempts+1
      started_at: null,
      next_retry_at: nextRetryAt,
      last_error: `provider-paused: ${errMsg.slice(0, 800)}`,
    })
    .eq("id", job.id);
  if (error) console.error("rescheduleNoAttempt error", error);
}

async function dispatchJob(job: ScouterJob): Promise<JobResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  switch (job.kind) {
    case "discover_seed":
      return handleDiscoverSeed(job, payload as never);
    case "discover_hashtag":
      return handleDiscoverHashtag(job, payload as never);
    case "score_lead":
      return handleScoreLead(job, payload as never);
    case "enrich_profile":
      return handleEnrichProfile(job, payload as never);
    case "enrich_handle":
      return handleEnrichHandle(job, payload as never);
    case "refresh_posts":
      return handleRefreshPosts(job, payload as never);
    default:
      return { ok: false, message: `Job kind desconocido: ${job.kind}` };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Job timeout (${ms}ms)`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/** Procesa un único job: marca running, ejecuta, marca done/failed. */
export async function processOne(job: ScouterJob): Promise<void> {
  const acquired = await markRunning(job);
  if (!acquired) {
    // Otro worker se lo llevó (o cambió de estado). Skip.
    return;
  }
  console.log(`[${job.id}] kind=${job.kind} attempt=${job.attempts + 1} started`);
  try {
    const result = await withTimeout(dispatchJob(job), JOB_TIMEOUT_MS);
    if (result.ok) {
      await markDone(job, result);
      console.log(`[${job.id}] done — ${result.message ?? ""}`);
    } else {
      const failMsg = result.message ?? "ok=false";
      // Apify quota: no consume attempt. Volvemos a queued. El próximo
      // tick lo reintenta cuando vuelva el budget — por reset mensual o
      // recarga del usuario. Sin esto, 3 reintentos rápidos consumen
      // los attempts y el job queda failed permanente.
      if (isProviderPausedError(failMsg)) {
        await rescheduleNoAttempt(job, failMsg);
        console.warn(`[${job.id}] provider-paused — keeping queued (no attempt consumed)`);
        return;
      }
      // Error PERMANENTE: la cuenta no existe / es privada / handle inválido.
      // Retry no va a cambiar el resultado pero SÍ consume créditos de
      // ScrapeCreators. Marcamos failed inmediatamente saltando los retries.
      if (isPermanentNotFoundError(failMsg)) {
        await markFailed(job, failMsg, /*exhausted*/ true);
        console.warn(`[${job.id}] failed (permanent — not_found, no retry) — ${failMsg}`);
        return;
      }
      const exhausted = job.attempts + 1 >= job.max_attempts;
      await markFailed(job, failMsg, exhausted);
      console.warn(
        `[${job.id}] ${exhausted ? "failed (exhausted)" : "retry"} — ${failMsg}`,
      );
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (isProviderPausedError(msg)) {
      await rescheduleNoAttempt(job, msg);
      console.warn(`[${job.id}] provider-paused — keeping queued (no attempt consumed)`);
      return;
    }
    if (isPermanentNotFoundError(msg)) {
      await markFailed(job, msg, /*exhausted*/ true);
      console.warn(`[${job.id}] failed (permanent — not_found, no retry) — ${msg}`);
      return;
    }
    const exhausted = job.attempts + 1 >= job.max_attempts;
    await markFailed(job, msg, exhausted);
    console.error(`[${job.id}] ${exhausted ? "failed (exhausted)" : "retry"} —`, msg);
  }
}

/** Drena un batch — fetchea N jobs y los procesa secuencialmente. */
export async function drainBatch(): Promise<number> {
  const jobs = await fetchQueuedJobs();
  for (const j of jobs) {
    await processOne(j);
  }
  return jobs.length;
}
