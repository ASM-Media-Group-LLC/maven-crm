# scouter-worker

Worker backend del módulo Scouter Assist en Maven CRM. Drena la queue de
`scouter_jobs` (Postgres) y ejecuta cuatro tipos de tareas:

| Job kind | Qué hace |
|---|---|
| `discover_seed` | Toma una lista explícita de @handles de Instagram, los enriquece con Apify, los inserta como `scouter_leads` y dispara `score_lead` para cada uno. |
| `discover_hashtag` | Descubre autores que postean con un hashtag, los enriquece y persiste igual que `discover_seed`. |
| `score_lead` | Toma un lead existente y lo manda al LLM scorer (Anthropic Claude por default, Groq como fallback). Escribe `ai_score` / `ai_status` / `ai_reason`. Si queda `high_fit`, inserta una notificación en `scouter_notifications`. |
| `enrich_profile` | Refresca followers / bio / verificado de un lead sin re-scorearlo. |

## Stack

- **Runtime**: Bun 1.1 (Node-compat). Lo elegimos porque Maven ya usa Bun en el frontend (lockfile `bun.lock` en root) y los handlers son código TypeScript simple. Si en algún momento conviene migrar a Node puro, cambiar el Dockerfile alcanza.
- **DB**: Supabase Postgres con service-role key (bypass RLS — todos los queries filtran por `tenant_id` explícitamente).
- **Discovery**: Apify ([instagram-profile-scraper](https://apify.com/apify/instagram-profile-scraper) + [instagram-hashtag-scraper](https://apify.com/apify/instagram-hashtag-scraper) por default; configurables vía env).
- **Scorer**: Anthropic Claude Haiku 4.5 por default. Se eligió sobre Groq llama-3.1-8b porque llama 8B ignoraba los hard constraints del prompt (ej. daba score 6.5 a brand accounts aún diciendo en `reason` "no es persona humana"). Switcheable a Groq via env `SCORER_PROVIDER=groq` si hace falta volver. Modelos configurables: `ANTHROPIC_SCORER_MODEL`, `GROQ_SCORER_MODEL`.

## Cómo correrlo localmente

```bash
cd servicios/scouter-worker
cp .env.example .env
# Completar SUPABASE_*, APIFY_API_TOKEN, GROQ_API_KEY en .env
bun install
bun run dev
```

El worker hace polling cada `WORKER_POLL_INTERVAL_MS` (15s default). Cuando encuentra jobs `queued` los procesa secuencialmente y vuelve a dormir.

## Cómo se enqueuean jobs

Desde el frontend (UI de Scouter) o desde un cron, simplemente insertar rows en `scouter_jobs`:

```sql
insert into scouter_jobs (kind, payload, tenant_id, priority)
values ('discover_hashtag', '{"hashtag":"latinamodel","maxLeads":50}', '<tenant_uuid>', 5);
```

El worker los va a tomar en el siguiente tick.

## Deploy

### Opción A — Dokploy (mismo plan que Maven CRM)

1. Crear nuevo "Application" en Dokploy apuntando al repo.
2. Build path: `servicios/scouter-worker`.
3. Dockerfile path: `servicios/scouter-worker/Dockerfile`.
4. Setear las env vars del `.env.example` como Service Environment Variables.
5. Deploy.

Dokploy le va a mandar `SIGTERM` al re-deploy y el worker termina su job actual antes de salir (gracias al handler en `src/index.ts`).

### Opción B — Apify Actor self-hosted

Si querés que Apify sea quien corra el worker (no Dokploy), envolver `src/index.ts` como Apify Actor — pero eso ya es un cambio mayor. Por ahora **opción A es la recomendada** para mantener todo en una sola plataforma de hosting.

## Decisiones de infra abiertas

Las dejamos documentadas acá para resolverlas cuando se aborde el primer deploy real:

| Tema | Pendiente |
|---|---|
| **Apify actor** | Por default usamos los oficiales (`apify/instagram-profile-scraper`). Si rinde mal en español o tira muchos `private` accounts, evaluar alternativas (`dr_trefex/instagram-profile-scraper`, `epctex/instagram-scraper`). Cambio = una env var. |
| **Concurrency** | Hoy single-worker (un proceso por servicio). Si necesitamos paralelizar, agregar `SELECT ... FOR UPDATE SKIP LOCKED` en `queue.ts` y subir replicas en Dokploy. |
| **Housekeeping de "running" colgados** | Si el proceso muere mid-job, el job queda en `running` para siempre. Agregar un script (cron diario) que mueva `running con started_at > 10 min` → `queued`. |
| **Failed jobs review** | UI para ver `scouter_jobs WHERE status='failed'` con el `last_error` y posibilidad de re-encolar. Pendiente en el frontend. |
| **Budget reset** | `scouter_apify_budget` se accumula por día — cuando cambia el día, simplemente hay un row nuevo. No hay reset explícito; revisar si esa lógica alcanza. |
| **Scorer prompt** | El prompt en `src/llm.ts` es una primera versión. Cuando haya leads scoreados reales, calibrar con feedback humano (qué high_fits cerraron vs cuáles no). |
| **Notification fanout** | Hoy `scouter_notifications` se inserta y la UI hace polling. Para notificaciones push reales, integrar con Supabase Realtime o el sistema de `notify_user_ids` que ya existe en `qa_config` / `chatter_config`. |

## Arquitectura — diagrama de flujo

```
                    ┌──────────────────────────┐
                    │  Frontend Scouter UI     │
                    │  (Maven CRM)             │
                    └──────────┬───────────────┘
                               │ inserts scouter_jobs
                               ▼
        ┌───────────────────────────────────────────────────┐
        │              Supabase Postgres                    │
        │   ┌──────────────┐    ┌──────────────────┐        │
        │   │ scouter_jobs │    │  scouter_leads   │        │
        │   │   (queue)    │    │  scouter_apify_* │        │
        │   └──────┬───────┘    └──────────────────┘        │
        └──────────│────────────────────────────────────────┘
                   │ poll cada 15s
                   ▼
        ┌─────────────────────┐
        │  scouter-worker     │
        │  (Bun, Dokploy)     │
        │                     │      ┌─────────────┐
        │  ┌───────────────┐  │ ───▶ │  Apify      │
        │  │ queue.ts      │  │      │  (actors)   │
        │  │ ↓ dispatch    │  │      └─────────────┘
        │  │ handlers/     │  │
        │  │   discover    │  │      ┌─────────────┐
        │  │   score    ───┼──┼ ───▶ │  Groq       │
        │  │   enrich      │  │      │  (LLM)      │
        │  └───────────────┘  │      └─────────────┘
        └─────────────────────┘
```

## Estado del scaffold

Lo que sí está implementado:

- ✅ Queue dispatcher con retry + timeout + graceful shutdown.
- ✅ Budget guard (lee y suma a `scouter_apify_budget`).
- ✅ Apify wrapper para profile scrape + hashtag discovery.
- ✅ LLM scorer wrapper (Groq).
- ✅ Handlers para los 4 kinds de jobs.
- ✅ Auto-encadenamiento: `discover_*` enqueua `score_lead` por cada lead nuevo.
- ✅ Side effect de `lead_high_fit` notification.

Lo que **falta** antes de production:

- ⚠️ Smoke test end-to-end con Apify token real + 1 lead.
- ⚠️ Calibración del prompt del scorer con leads reales (puede que dé scores muy chatos).
- ⚠️ Deploy a Dokploy (Application + env vars).
- ⚠️ Frontend hooks para enquear jobs (`useEnqueueDiscovery`, `useScoreLead`, etc.) — los hooks Scouter de hoy solo leen.

Cuando arranquen con un primer Apify token de prueba, podemos hacer un dry-run con un seed de 5 handles y validar que el flow entero anda.
