// sync-from-v2 — copia incremental de tablas con input de usuarios desde
// v2 (lsagslbkliprespbyhts) hacia v3 (ygsjkbqpnrsbohygmhyw).
//
// Disparador: pg_cron cada hora con `SELECT net.http_post(...)`.
//
// Estrategia por tabla:
//   1. Lee `last_sync_for(tabla)` → timestamp del último sync OK.
//   2. Toma `synced_through = now()` ANTES de leer v2 (evita perder filas
//      que entren mientras corre el sync).
//   3. Pide a v2 las filas con `updated_at > last_sync` (o `created_at`
//      en tablas legacy sin `updated_at`).
//   4. Hace UPSERT en v3 con `Prefer: resolution=merge-duplicates` para
//      que conflicts de PK se resuelvan como UPDATE (no falla).
//   5. Hardcodea `tenant_id = ASM Tech UUID` en cada fila — sin esto la
//      RLS de v3 (que requiere tenant_id NOT NULL) rechaza el insert.
//   6. Loguea en `sync_log`.
//
// V2 sigue intacta — esto solo lee. v3 recibe la data y los usuarios de
// v3 ven todo en sus dashboards.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// ASM Tech tenant UUID (verificado en v3 al inicio del proyecto).
// Se hardcodea porque hoy es single-tenant. Cuando llegue multi-tenant
// real, se mueve a una tabla de mapping.
const DEFAULT_TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

// Tablas a sincronizar. Orden importa por FKs — primero las "padre",
// después las que referencian. `timestamp_col` es la columna que usamos
// para el sync incremental. `add_tenant_id=true` agrega tenant_id en v3.
// `chunk_size` controla cuántas filas pedimos a v2 por call (paginamos
// si hay más).
interface TableConfig {
  name: string;
  timestamp_col: "created_at" | "updated_at";
  add_tenant_id: boolean;
  chunk_size: number;
  // PK column(s) para el ON CONFLICT. PostgREST infers desde el schema
  // pero le ayudamos con `Prefer: resolution=merge-duplicates`.
}

const TABLES: TableConfig[] = [
  // Las legacy con tenant_id que agregamos en v3 — son las críticas
  // del input de usuarios.
  { name: "leadgen_entries",                       timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000 },
  { name: "promolog_entries",                      timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000 },
  { name: "of_gross_earnings",                     timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000 },
  { name: "missing_creatos_id_of_gross_earnings",  timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000 },
  // scouter_leads ya tiene tenant_id en v2 también (lo usamos para el
  // scouter desde temprano en la branch).
  { name: "scouter_leads",                         timestamp_col: "updated_at", add_tenant_id: false, chunk_size: 500  },
  // Tablas más chicas — relaciones de closer.
  { name: "closers_contacts",                      timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500  },
  { name: "closer_creators",                       timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500  },
  { name: "notifications",                         timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500  },
  { name: "audit_log",                             timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500  },
];

interface SyncResult {
  table: string;
  status: "ok" | "error" | "partial";
  rows_fetched: number;
  rows_upserted: number;
  duration_ms: number;
  error?: string;
  synced_through: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: aceptamos cron token interno o service role JWT.
  const cronToken = req.headers.get("x-cron-token") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const expectedCronToken = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  if (cronToken !== expectedCronToken && !auth.startsWith("Bearer ")) {
    return jsonError("Unauthorized", 401);
  }

  // Env: necesitamos URLs y keys de v2 + v3.
  const V2_URL = Deno.env.get("V2_SUPABASE_URL");
  const V2_KEY = Deno.env.get("V2_SERVICE_ROLE_KEY");
  const V3_URL = Deno.env.get("SUPABASE_URL");
  const V3_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!V2_URL || !V2_KEY) {
    return jsonError(
      "V2_SUPABASE_URL y V2_SERVICE_ROLE_KEY deben estar seteados como secrets.",
      500,
    );
  }
  if (!V3_URL || !V3_KEY) {
    return jsonError("SUPABASE_URL/SERVICE_ROLE_KEY no configurados.", 500);
  }

  // Cliente v3 con service role (bypass RLS para escribir en sync_log).
  const v3 = createClient(V3_URL, V3_KEY, {
    auth: { persistSession: false },
  });

  const results: SyncResult[] = [];
  const overallStart = Date.now();

  for (const config of TABLES) {
    const result = await syncTable(config, V2_URL, V2_KEY, V3_URL, V3_KEY, v3);
    results.push(result);

    // Persistir en sync_log inmediatamente (no esperar al final, así si
    // la function se cae a mitad de camino igual queda registro).
    await v3.from("sync_log").insert({
      table_name: result.table,
      synced_through: result.synced_through,
      rows_inserted: result.rows_upserted,
      rows_updated: 0, // PostgREST no distingue insert vs update en upsert
      rows_skipped: 0,
      duration_ms: result.duration_ms,
      error: result.error ?? null,
      status: result.status,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      total_duration_ms: Date.now() - overallStart,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function syncTable(
  config: TableConfig,
  v2Url: string,
  v2Key: string,
  v3Url: string,
  v3Key: string,
  v3Client: ReturnType<typeof createClient>,
): Promise<SyncResult> {
  const start = Date.now();
  const syncedThrough = new Date().toISOString();

  // Last sync: usamos el RPC last_sync_for (epoch si nunca corrió).
  const { data: lastSyncRaw, error: lastSyncErr } = await v3Client.rpc(
    "last_sync_for",
    { p_table: config.name },
  );
  if (lastSyncErr) {
    return errorResult(config.name, syncedThrough, start, lastSyncErr.message);
  }
  const lastSync = (lastSyncRaw as string) ?? "1970-01-01T00:00:00Z";

  // Pull desde v2 — paginación con range.
  let totalUpserted = 0;
  let offset = 0;
  let lastError: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      select: "*",
      [config.timestamp_col]: `gt.${lastSync}`,
      order: `${config.timestamp_col}.asc`,
      limit: String(config.chunk_size),
      offset: String(offset),
    });
    const v2Resp = await fetch(
      `${v2Url}/rest/v1/${config.name}?${params}`,
      {
        headers: {
          apikey: v2Key,
          Authorization: `Bearer ${v2Key}`,
          // No pedimos count="exact" — más lento. Solo iteramos hasta vacío.
          Prefer: "count=none",
        },
      },
    );
    if (!v2Resp.ok) {
      const errText = await v2Resp.text().catch(() => "");
      lastError = `v2 fetch ${v2Resp.status}: ${errText.slice(0, 200)}`;
      break;
    }
    const rows = (await v2Resp.json()) as Record<string, unknown>[];
    if (rows.length === 0) break;

    // Inyectar tenant_id si la tabla v3 lo requiere.
    const transformed = config.add_tenant_id
      ? rows.map((r) => ({ ...r, tenant_id: DEFAULT_TENANT_ID }))
      : rows;

    // Upsert a v3 con merge-duplicates (resuelve conflicts de PK como UPDATE).
    const v3Resp = await fetch(`${v3Url}/rest/v1/${config.name}`, {
      method: "POST",
      headers: {
        apikey: v3Key,
        Authorization: `Bearer ${v3Key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(transformed),
    });
    if (!v3Resp.ok) {
      const errText = await v3Resp.text().catch(() => "");
      lastError = `v3 upsert ${v3Resp.status}: ${errText.slice(0, 200)}`;
      break;
    }
    totalUpserted += rows.length;
    if (rows.length < config.chunk_size) break;
    offset += rows.length;
  }

  const status: "ok" | "error" | "partial" = lastError
    ? totalUpserted > 0
      ? "partial"
      : "error"
    : "ok";

  return {
    table: config.name,
    status,
    rows_fetched: totalUpserted,
    rows_upserted: totalUpserted,
    duration_ms: Date.now() - start,
    error: lastError,
    synced_through: syncedThrough,
  };
}

function errorResult(
  table: string,
  syncedThrough: string,
  start: number,
  error: string,
): SyncResult {
  return {
    table,
    status: "error",
    rows_fetched: 0,
    rows_upserted: 0,
    duration_ms: Date.now() - start,
    error,
    synced_through: syncedThrough,
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
