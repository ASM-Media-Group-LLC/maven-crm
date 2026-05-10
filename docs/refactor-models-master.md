# Refactor: tabla canónica `models` (Maven 3)

**Status**: design — sin implementación todavía.
**Fecha**: 2026-05-10
**Autor**: Jhon Lopez + Claude

## Resumen ejecutivo

Hoy la identidad de una modelo (handle de IG, nombre, foto, phone, país) vive
duplicada en 5 tablas: `leadgen_entries`, `scouter_leads`, `closers_contacts`,
`closer_creators`, `creators`. La misma persona física puede tener 4 rows con
4 copias de su handle, 4 phones potencialmente distintos, etc. Eso fuerza
todos los KPIs a dedupear en read-time vía la view `v_model_phone_captures`,
y hace inviable cualquier feature de "perfil único de la modelo" o
"verificación automática de contacto".

Este documento define el target schema, el plan de migración por sprints, y
los criterios de aceptación.

## Estado actual (auditado 2026-05-10)

```
Total rows con handle (5 tablas):    111,156
Distinct handles (lowercased):        15,325
  └─ en 1 tabla:                     13,668  (89%)
  └─ en 2 tablas:                     1,105  ( 7%)
  └─ en 3 tablas:                       311  ( 2%)
  └─ en 4 tablas:                       241  ( 2%)

Total handles con phone capturado:    2,769
  └─ con 1 phone consistente:         2,397  (87%)
  └─ con 2 phones distintos:            347  (12%)
  └─ con 3+ phones distintos:            25  ( 1%)
```

**Observación clave**: 372 handles (13% de los con phone) tienen múltiples
phones distintos a través de tablas → la nueva tabla `model_phones` debe ser
1-N respecto a `models`, no un campo único.

## Target schema

### Identidad (master)

```sql
CREATE TABLE public.models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                  DEFAULT public.current_tenant_id(),

  -- Clave natural: handle de IG normalizado a lowercase.
  -- UNIQUE per tenant — un mismo handle podría existir en otra agencia.
  instagram_handle text NOT NULL,

  -- Display
  display_name    text,
  avatar_url      text,
  bio             text,
  is_verified     boolean,

  -- Geografía
  country         text,
  city            text,
  state           text,

  -- Otros perfiles (single-value: 90% de los casos)
  onlyfans_url    text,
  tiktok_handle   text,
  twitter_handle  text,

  -- Stats del scraper (último snapshot)
  followers_count int,
  posts_count     int,
  last_scraped_at timestamptz,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Quién creó el registro (puede ser un agente leadgen / scouter)
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT models_handle_per_tenant UNIQUE (tenant_id, instagram_handle)
);

CREATE INDEX models_tenant_idx        ON public.models (tenant_id);
CREATE INDEX models_handle_idx        ON public.models (lower(instagram_handle));
CREATE INDEX models_country_idx       ON public.models (country) WHERE country IS NOT NULL;
```

### Phones (1-N, con historial)

```sql
CREATE TABLE public.model_phones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                  DEFAULT public.current_tenant_id(),
  model_id        uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,

  phone_e164      text NOT NULL,        -- normalizado
  phone_raw       text,                 -- como lo escribió el agente
  is_primary      boolean NOT NULL DEFAULT false,

  -- Procedencia: qué módulo capturó este número primero
  source_module   text NOT NULL CHECK (source_module IN (
    'leadgen', 'scouter', 'closers_contacts', 'closer_creators', 'creators', 'manual'
  )),
  captured_by     uuid REFERENCES auth.users(id),
  captured_at     timestamptz NOT NULL DEFAULT now(),

  -- Estado: 'active' (en uso), 'replaced' (cambió a otro), 'invalid'
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'replaced', 'invalid')),

  CONSTRAINT model_phones_unique UNIQUE (tenant_id, model_id, phone_e164)
);

CREATE INDEX model_phones_model_idx  ON public.model_phones (model_id);
CREATE INDEX model_phones_phone_idx  ON public.model_phones (phone_e164);
-- Solo un primary por modelo
CREATE UNIQUE INDEX model_phones_one_primary ON public.model_phones (model_id)
  WHERE is_primary = true;
```

### Funnel: refactor de tablas existentes

Las tablas `leadgen_entries`, `scouter_leads`, `closers_contacts`,
`closer_creators`, `creators` se conservan PERO:

1. Se les agrega columna `model_id uuid REFERENCES public.models(id)` —
   nullable durante la migración, NOT NULL al final.
2. Las columnas de identidad duplicada (`name`, `phone`, `country`, etc.)
   se quedan durante la transición y se borran en el último sprint.
3. Conceptualmente cada tabla deja de "describir a la modelo" y pasa a
   "describir el evento/estado de la modelo en ese módulo".

#### `leadgen_entries` — evento de outreach

Después de la migración, semánticamente:
> "El agente X registró que contactó a la modelo Y en la fecha Z, con
> categoría W y resultado V."

Columnas que se mantienen: `id`, `model_id` (NEW), `lg_user_id`,
`entry_date`, `quality`, `status`, `notes`, `source_link`, `record_type`,
`tenant_id`, `created_at`, `updated_at`, `phone_first_set_at`.

Columnas que se borran (al final del refactor): `model_handle`, `platform`
(va a `models.tiktok_handle` etc.), `phone_raw`, `phone_e164`, `country_code`,
`state`, `city`, `company`, `onlyfans_url` — todas viven en `models` o
`model_phones`.

#### `scouter_leads` — perfil scrapeado + AI score

Mantiene: `id`, `model_id` (NEW), `tenant_id`, `company_id`, `status`,
`ai_score`, `ai_status`, `ai_analysis`, `look_score`, `recent_posts`,
`assigned_to`, `created_at`.

Borra: `instagram_handle`, `name`, `country`, `city`, `bio`,
`profile_pic_url`, `followers_count`, `posts_count`, `is_verified`, `phone`,
`phone_first_set_at` — todo eso vive en `models` (con stats actualizadas
por el scraper).

#### `closers_contacts`, `closer_creators`, `creators`

Aplican la misma lógica: model_id NEW, drop columnas duplicadas, mantener
sólo lo específico al estado del módulo (stage del pipeline, contract_url,
fecha de firma, etc.).

## Política de merge: cuando un handle aparece en N tablas

Para los 1,657 handles que están en 2-4 tablas, el merge a un solo row
en `models` requiere decidir qué valor gana en cada columna.

**Política**:

| Campo | Source preference (descendente) |
|---|---|
| `display_name` | creators > closer_creators > closers_contacts > scouter_leads > leadgen_entries |
| `avatar_url` | creators > scouter_leads (que se actualiza con scraper) |
| `country`, `city` | creators > closer_creators > closers_contacts > scouter_leads > leadgen_entries |
| `onlyfans_url` | creators > closers_contacts > leadgen_entries |
| `followers_count`, `posts_count`, `is_verified` | scouter_leads (es lo único que scrapea) |
| `bio` | scouter_leads |

Para phones inconsistentes (372 handles con 2+):
- TODOS los phones distintos van a `model_phones` con `source_module` correspondiente
- El más reciente (`phone_first_set_at`) se marca `is_primary = true`
- Los anteriores quedan con `status = 'replaced'`

## Migración: plan por sprints

### Sprint 1 — Schema + plan (esta semana)

**Owner**: solo nosotros. Sin código en producción.

- [x] Auditoría datos actuales
- [ ] Este documento aprobado
- [ ] Schema SQL final review (handles edge cases: handle con mayúsculas/diacríticos, phones con +/-, etc.)
- [ ] Migration script `models_master_v1.sql` (dry-run sin apply)
- [ ] Plan de rollback para cada sprint

**Acceptance**: tenemos un PR con docs + el SQL del schema validado contra
la data real (count handles, count phones, sin errores).

### Sprint 2 — Apply schema + backfill

**Cambio en producción**: aditivo. No rompe nada.

1. Apply migration: crea `models`, `model_phones`, agrega `model_id`
   (nullable) a las 5 tablas viejas.
2. Backfill via SQL: `INSERT INTO models` desde UNION DISTINCT de las 5
   fuentes, aplicando política de merge.
3. Backfill `model_phones` desde las 5 fuentes con `source_module`
   correspondiente.
4. UPDATE las 5 tablas viejas: `SET model_id = (SELECT id FROM models
   WHERE instagram_handle = lower(<handle_de_la_tabla>))`.
5. Triggers: cualquier INSERT/UPDATE futuro en una tabla vieja que
   contenga handle/phone → UPSERT correspondiente en `models` /
   `model_phones`. Mantiene sincronía mientras el frontend migra.
6. Validation queries: counts cuadran, 0 model_id NULL, handles
   bidireccionalmente consistentes.

**Acceptance**: data está en `models` y `model_phones`, todas las tablas
viejas tienen `model_id`, los counts antiguos siguen siendo idénticos.

### Sprint 3 — Frontend cutover (módulo por módulo, con feature flags)

Por cada módulo (orden de menor a mayor impacto):

1. `panel-de-control` (read-only) → cambiar a leer de `models`/`model_phones`
2. `creadores` (CRM final) → reads + form usando models
3. `contactos` (closers) → idem
4. `closers` → idem
5. `leadgen` → idem
6. `scouter-assist` → idem (incluyendo el worker en `servicios/`)

**Por módulo**:
- feature flag `useModelsTable` en localStorage o per-user
- nuevo código corre detrás del flag, validamos data idéntica
- una vez validado: flag flip, código viejo se borra
- triggers de Sprint 2 se mantienen para no perder writes en tablas viejas

**Acceptance**: cada módulo lee/escribe de `models` y los triggers
inversos siguen sincronizando las tablas viejas (durante la transición
no hay data divergente).

### Sprint 4 — Edge functions + worker

- `chatter-public` no toca estas tablas, no se afecta
- `scouter-worker` (Apify scraper) → escribir directo a `models` +
  enqueue en `scouter_leads` (sólo el estado del job, sin duplicar
  identidad)
- `sync-from-v2` ya está deprecado (410 Gone)

**Acceptance**: el worker scouter actualiza `models.last_scraped_at` y los
campos del scraper directamente, sin pasar por `scouter_leads.instagram_handle`.

### Sprint 5 — Cleanup + drop columnas

Una vez TODAS las pantallas leen de `models`:

1. Drop triggers de sincronía de Sprint 2.
2. Drop columnas duplicadas en las 5 tablas viejas: `model_handle`,
   `instagram_handle`, `handle`, `name`, `phone`, `country`, etc.
3. Drop `v_model_phone_captures` (la materialized view ya no es
   necesaria — `count(*) FROM model_phones WHERE status='active'` la
   reemplaza directamente).
4. Update memoria + este doc → status: `applied`.

**Acceptance**: schema limpio, sin redundancia, todos los KPIs cuadran.

## Validación / criterios de aceptación globales

Estas queries deben dar el mismo resultado antes y después del refactor:

```sql
-- KPI 1: total modelos contactadas (rows en leadgen_entries)
SELECT count(*) FROM public.leadgen_entries;
-- después: SELECT count(*) FROM public.leadgen_entries (con FK a models)

-- KPI 2: modelos únicas en el sistema
-- antes:  SELECT count(*) FROM public.v_model_phone_captures;  -- 3,238
-- después: SELECT count(*) FROM public.models;                 -- ~15,325 (incluye sin phone)
-- después: SELECT count(DISTINCT model_id) FROM public.model_phones WHERE status='active';

-- KPI 3: phones únicos
-- antes:  SELECT count(*) FROM public.v_model_phone_captures;
-- después: SELECT count(*) FROM public.model_phones WHERE status='active';
```

## Riesgos + mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Pérdida de data en backfill | Baja | Alto | Dry-run + diff vs `v_model_phone_captures`. Backup pre-migration. |
| Dual-write triggers introducen latencia o deadlocks | Media | Medio | Triggers AFTER, no BEFORE. Monitoring de slow queries. |
| Frontend bug rompe módulo durante cutover | Media | Medio | Feature flags por módulo, validation queries, rollback rápido. |
| Conflicto de phone (mismo phone, modelos distintas) | Baja | Bajo | `model_phones.phone_e164` es UNIQUE per (tenant, model_id), no globalmente — permite que dos modelos compartan phone si el equipo lo registró así. |
| Worker scouter rompe durante Sprint 4 | Media | Alto | Pause cron jobs de scouter durante Sprint 4. Resume después de validar. |

## Decisiones pendientes (necesitan input del user)

1. **¿Cuánto histórico de phones queremos preservar?** Hoy hay 372
   handles con 2+ phones distintos. ¿Conservamos todos en `model_phones`
   o sólo el más reciente?
2. **¿Manejamos ataques cross-tenant?** Hoy todos los datos están bajo
   un solo tenant (ASM Tech). El UNIQUE constraint sobre `(tenant_id,
   instagram_handle)` permite la misma modelo en multi-tenant en el
   futuro — ¿OK con esa decisión?
3. **¿Qué hacer con leads sin handle?** Algunos rows de
   `leadgen_entries` o `closers_contacts` podrían tener `model_handle =
   NULL`. ¿Los mandamos a un "model_id sintético" o los marcamos como
   no migrables (para review manual)?
4. **¿Migrar `creators.phone_e164` y `creators.phone` ambos?** Hoy
   creators tiene dos columnas de phone. Asumimos que `phone_e164` es
   la canónica.

## Ownership

- DB schema + migrations: backend
- Triggers + RLS: backend
- Frontend cutover: frontend (1 dev por módulo)
- Worker scouter: backend + worker

## Próximos pasos inmediatos

1. Revisión de este doc por el user (decisiones pendientes)
2. PR del SQL del schema (Sprint 1) → review + apply en una rama de
   Supabase para test, NO en parent
3. Si pasa el dry-run, scheduling de Sprint 2

---

**Última actualización**: 2026-05-10 — design v1
