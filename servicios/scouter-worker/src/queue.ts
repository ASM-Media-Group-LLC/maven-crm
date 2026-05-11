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

async function fetchQueuedJobs(): Promise<ScouterJob[]> {
  const { data, error } = await sb
    .from("scouter_jobs")
    .select("*")
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
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
  const { error } = await sb
    .from("scouter_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      last_error: errMsg.slice(0, 1000),
      // Si todavía no se gastaron los attempts, vuelve a la queue para
      // que el siguiente tick lo reintente.
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
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

// Rollback del attempt incrementado en markRunning + devuelve el job a
// queued. El próximo tick va a re-intentarlo sin penalizar el contador.
async function rescheduleNoAttempt(job: ScouterJob, errMsg: string): Promise<void> {
  const { error } = await sb
    .from("scouter_jobs")
    .update({
      status: "queued",
      attempts: job.attempts, // restaura — markRunning había puesto attempts+1
      started_at: null,
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
