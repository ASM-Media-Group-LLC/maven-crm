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
  // Estrategia de conflict resolution:
  //   "merge" → UPDATE on conflict (default, para data que cambia)
  //   "ignore" → DO NOTHING on conflict (para tablas con UNIQUE
  //     constraints separadas de la PK donde no queremos pisar rows
  //     que ya existen en v3, ej: scouter_companies por slug,
  //     closer_creators por (closer_id, creator_id))
  conflict_strategy?: "merge" | "ignore";
  // Columnas para el `on_conflict` de PostgREST. Por default usa la
  // PK, pero cuando hay UNIQUE constraints separados (ej. slug,
  // composites) hay que apuntar explícitamente. Formato: "col1,col2".
  on_conflict_columns?: string;
  // Columnas FK que pueden tener huérfanos (apuntar a IDs que no
  // existen en v3). Si sí, NULLificamos antes del upsert.
  // Solo aplica si la columna es nullable en v3.
  nullify_orphan_fks?: Array<{
    column: string;
    parent_table: "auth.users" | "scouter_companies" | "creators" | "scouter_leads";
  }>;
}

const TABLES: TableConfig[] = [
  // ── PADRES PRIMERO ────────────────────────────────────────────────────
  { name: "creators",                              timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "merge"  },
  // scouter_companies puede chocar UNIQUE en slug — usamos "ignore"
  // así si la row ya existe en v3 (vino con la branch original) no
  // intenta updatearla, simplemente skipea. on_conflict_columns="id"
  // fuerza el conflict sobre la PK; PostgREST necesita el hint cuando
  // hay UNIQUEs separadas.
  { name: "scouter_companies",                     timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "ignore", on_conflict_columns: "id" },

  // ── HIJAS ─────────────────────────────────────────────────────────────
  // leadgen_entries: lg_user_id apunta a v2.auth.users — esos users no
  // existen en v3 (cada proyecto Supabase tiene su propio auth).
  // NULLificamos huérfanos antes del upsert. La columna ya es nullable
  // en v3 (la migration de cleanup_orphan_fks).
  {
    name: "leadgen_entries",
    timestamp_col: "created_at",
    add_tenant_id: true,
    chunk_size: 1000,
    conflict_strategy: "merge",
    nullify_orphan_fks: [
      { column: "lg_user_id", parent_table: "auth.users" },
      { column: "created_creator_id", parent_table: "creators" },
    ],
  },
  { name: "promolog_entries",                      timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000, conflict_strategy: "merge"  },
  { name: "of_gross_earnings",                     timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000, conflict_strategy: "merge"  },
  { name: "missing_creatos_id_of_gross_earnings",  timestamp_col: "created_at", add_tenant_id: true,  chunk_size: 1000, conflict_strategy: "merge"  },
  // scouter_leads referencia scouter_companies por company_id. Ya
  // sincronizamos scouter_companies arriba, pero por las dudas
  // NULLificamos orphans también (column es nullable).
  // scouter_leads en v3 tiene tenant_id NOT NULL. v2 no tiene la
  // columna, así que add_tenant_id=true mete ASM Tech en cada row.
  {
    name: "scouter_leads",
    timestamp_col: "updated_at",
    add_tenant_id: true,
    chunk_size: 500,
    conflict_strategy: "merge",
    nullify_orphan_fks: [
      { column: "company_id", parent_table: "scouter_companies" },
    ],
  },
  { name: "closers_contacts",                      timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "merge"  },
  // closer_creators choca UNIQUE en (closer_id, creator_id) cuando
  // intenta re-insertar pares ya existentes — "ignore" los skipea.
  { name: "closer_creators",                       timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "ignore", on_conflict_columns: "id" },
  { name: "notifications",                         timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "merge"  },
  { name: "audit_log",                             timestamp_col: "created_at", add_tenant_id: false, chunk_size: 500, conflict_strategy: "merge"  },
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

  // Pre-fetch de IDs válidos en v3 para NULLificar huérfanos. Solo
  // levantamos los sets de tablas referenciadas por algún
  // nullify_orphan_fks de la config; las demás se saltean.
  const referencedParents = new Set<string>();
  for (const t of TABLES) {
    for (const fk of t.nullify_orphan_fks ?? []) {
      referencedParents.add(fk.parent_table);
    }
  }
  const validIds = await prefetchValidIds(referencedParents, V3_URL, V3_KEY);

  const results: SyncResult[] = [];
  const overallStart = Date.now();

  for (const config of TABLES) {
    const result = await syncTable(config, V2_URL, V2_KEY, V3_URL, V3_KEY, v3, validIds);
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
  validIds: Map<string, Set<string>>,
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
    let transformed: Record<string, unknown>[] = config.add_tenant_id
      ? rows.map((r) => ({ ...r, tenant_id: DEFAULT_TENANT_ID }))
      : rows.slice();

    // NULLificar FKs huérfanas: para cada column configurada, si su
    // valor no existe en el set de IDs válidos en v3, lo ponemos NULL.
    // Esto evita el error 23503 (foreign_key_violation) al upsertar.
    for (const fk of config.nullify_orphan_fks ?? []) {
      const validSet = validIds.get(fk.parent_table);
      if (!validSet) continue; // si no pudimos pre-fetchearlos, dejamos pasar
      transformed = transformed.map((r) => {
        const v = r[fk.column];
        if (v && typeof v === "string" && !validSet.has(v)) {
          return { ...r, [fk.column]: null };
        }
        return r;
      });
    }

    // Upsert a v3. Estrategia de conflict según config:
    //   "merge"  → UPDATE on conflict (default)
    //   "ignore" → DO NOTHING on conflict (skip rows duplicados)
    // on_conflict_columns: cuando hay UNIQUEs separadas de la PK,
    // PostgREST necesita un hint del column. Por default usa la PK
    // y los UNIQUEs separados explotan con 23505.
    const conflictPref =
      config.conflict_strategy === "ignore"
        ? "resolution=ignore-duplicates"
        : "resolution=merge-duplicates";
    const onConflictParam = config.on_conflict_columns
      ? `?on_conflict=${encodeURIComponent(config.on_conflict_columns)}`
      : "";
    const v3Resp = await fetch(`${v3Url}/rest/v1/${config.name}${onConflictParam}`, {
      method: "POST",
      headers: {
        apikey: v3Key,
        Authorization: `Bearer ${v3Key}`,
        "Content-Type": "application/json",
        Prefer: `${conflictPref},return=minimal`,
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

// Pre-fetch de IDs válidos en v3 para cada tabla "padre" referenciada
// por algún FK que querramos NULLificar. Devuelve un Map { tableName →
// Set<id> }. Se llama UNA vez al inicio del sync; los sets se pasan a
// cada syncTable para que NULLifique huérfanos antes del upsert.
//
// Casos especiales:
//   - "auth.users" no es accesible vía PostgREST (schema oculto).
//     Usamos la Admin API de Supabase Auth (/auth/v1/admin/users).
//   - Tablas en schema "public" usan el REST normal con paginación.
async function prefetchValidIds(
  tables: Set<string>,
  v3Url: string,
  v3Key: string,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();

  for (const table of tables) {
    const set = new Set<string>();

    if (table === "auth.users") {
      // Admin API: pagina con ?page=N&per_page=1000.
      let page = 1;
      while (true) {
        const r = await fetch(
          `${v3Url}/auth/v1/admin/users?page=${page}&per_page=1000`,
          {
            headers: {
              apikey: v3Key,
              Authorization: `Bearer ${v3Key}`,
            },
          },
        );
        if (!r.ok) {
          console.error(`prefetch auth.users page ${page}:`, r.status);
          break;
        }
        const body = (await r.json()) as { users?: Array<{ id: string }> };
        const users = body.users ?? [];
        for (const u of users) set.add(u.id);
        if (users.length < 1000) break;
        page++;
        if (page > 50) break; // hard cap 50k users por seguridad
      }
    } else {
      // Tabla pública. PostgREST con offset.
      let offset = 0;
      const CHUNK = 1000;
      while (true) {
        const r = await fetch(
          `${v3Url}/rest/v1/${table}?select=id&limit=${CHUNK}&offset=${offset}`,
          {
            headers: {
              apikey: v3Key,
              Authorization: `Bearer ${v3Key}`,
              Prefer: "count=none",
            },
          },
        );
        if (!r.ok) {
          console.error(`prefetch ${table} offset ${offset}:`, r.status);
          break;
        }
        const rows = (await r.json()) as Array<{ id: string }>;
        for (const row of rows) set.add(row.id);
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset > 200_000) break; // hard cap 200k rows por tabla
      }
    }

    map.set(table, set);
    console.log(`prefetch ${table}: ${set.size} IDs cargados`);
  }

  return map;
}
