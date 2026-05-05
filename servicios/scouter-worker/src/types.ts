// Tipos compartidos entre el dispatcher y los handlers. Mirror minimal
// de las tablas Postgres — no usamos los tipos generados de Supabase
// porque este worker corre en Bun/Node, separado del frontend.

export type JobKind =
  | "discover_seed"
  | "discover_hashtag"
  | "score_lead"
  | "enrich_profile";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ScouterJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  company_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: unknown;
  priority: number;
  tenant_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Payloads esperados por kind. El handler valida runtime — esto es
// solo guía para quien los enqueua desde el frontend / cron.

export interface DiscoverSeedPayload {
  /** Lista de @handles ya conocidos del cual extraer info. */
  seeds: string[];
  /** Cap de leads que el worker puede crear con este job (defensa). */
  maxLeads?: number;
}

export interface DiscoverHashtagPayload {
  /** Hashtag sin "#" (e.g. "fitnessmodels"). */
  hashtag: string;
  maxLeads?: number;
}

export interface ScoreLeadPayload {
  /** scouter_leads.id a puntuar con AI scorer. */
  leadId: string;
}

export interface EnrichProfilePayload {
  /** scouter_leads.id a enriquecer con datos de IG (followers, bio, etc). */
  leadId: string;
}

export type JobPayloadByKind = {
  discover_seed: DiscoverSeedPayload;
  discover_hashtag: DiscoverHashtagPayload;
  score_lead: ScoreLeadPayload;
  enrich_profile: EnrichProfilePayload;
};

// Resultado normalizado que el handler devuelve al dispatcher. Lo que
// se persiste en scouter_jobs.result al terminar.
export interface JobResult {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
  /** Items de Apify procesados (para budget tracking). */
  apifyItemsProcessed?: number;
  /** Estimado de spend en USD (sumamos al daily budget al terminar). */
  apifyEstSpendUsd?: number;
}
