# Promolog: migración Dokploy → Apify + Gemini Vision

**Fecha**: 2026-05-28
**Status**: Backend desplegado, pendiente configuración de secrets
**Branch**: `kind-brahmagupta-62427f`

## Qué cambia

El sistema **Promolog** verifica si las creadoras de OnlyFans promocionan su contenido
en stories de Instagram. Antes corría como 5 microservicios separados en Dokploy
(scraper + clasificador + uploader…). Ahora vive 100% dentro de Supabase + Apify.

| Antes (Dokploy) | Ahora (Apify) |
|---|---|
| 5 servicios, instancias dedicadas | 2 edge functions |
| Scraping con browsers self-hosted | Apify `apify/instagram-scraper` |
| Clasificador determinístico (¿hay link?) | Gemini 2.0 Flash Vision (cualitativo) |
| Operación 24/7 | 1x/día via pg_cron |
| Coste mensual de VMs | ~$20 USD/mes (Apify + Gemini API) |

## Volumen real verificado en DB

- 130 creadoras con `status='active'`
- 121 con `instagram_handle` → estas son las elegibles (`v_promolog_eligible_creators`)
- 1 ejecución/día → ~3,630 stories analizadas/mes (~30 stories/creadora/día max)

## Componentes creados

### Migración SQL — `20260528120000_promolog_apify_migration.sql`

- `promolog_entries`: añade columnas `apify_run_id`, `dispatch_run_id`, `analyzed_by_ai`,
  `ai_model`, `ai_confidence`, `ai_reasoning`, `story_index`, `story_count`,
  `story_media_url`, `scraped_at`.
- Nueva tabla `promolog_dispatch_runs` con tracking de cada corrida (Apify run id,
  status, counters, payload).
- `v_promolog_eligible_creators` — view que filtra creadoras `status='active'` con
  IG handle no vacío.
- `promolog_dispatched_today(tenant_id)` — RPC para rate-limit (1 run/día Miami TZ).

### Edge function `promolog-dispatch`

- Auth: `X-Cron-Token` (pg_cron) o JWT con role admin/manager.
- Verifica rate-limit (`promolog_dispatched_today`).
- Query `v_promolog_eligible_creators` (cap a 100 creadoras por run).
- Crea fila en `promolog_dispatch_runs` con `status='pending'`.
- POST a `https://api.apify.com/v2/acts/apify~instagram-scraper/runs` con webhook
  config (envía Bearer con anon key vía `headersTemplate` para que el callback pase
  `verify_jwt=true`).
- Update fila con `apify_run_id`, `status='running'`.

### Edge function `promolog-webhook`

- Recibe POST de Apify cuando termina el run (success/fail/timeout).
- Valida `dispatch_run_id` + `apify_run_id` contra DB (defensa contra replay).
- Si SUCCEEDED: descarga el dataset (`/v2/datasets/<id>/items`).
- Para cada story:
  1. Descarga la imagen (`displayUrl` del item).
  2. Llama Gemini 2.0 Flash Vision con prompt cualitativo:
     - PROMOCIÓN DIRECTA (link OnlyFans/piclink/LinkTree).
     - PROMOCIÓN INDIRECTA (sugerencias sutiles: "DM me", "check my bio", emojis 🍑🔥💦).
     - NO PROMUEVE.
  3. Inserta `promolog_entries` con `analyzed_by_ai=true`, `ai_confidence`,
     `ai_reasoning`, `promoted`, `has_buy_link`, `buy_link_type`, `platform`.
- Update `promolog_dispatch_runs` con counters finales.

### pg_cron job

```
promolog-dispatch-daily   0 13 * * *   (= 9am Miami EDT / 8am EST)
```

Llama con `Authorization: Bearer <supabase_anon_key>` + `X-Cron-Token`.

## ⚠️ Pendiente del lado del usuario

**Configurar 2 secrets en Edge Functions** (Dashboard → Project Settings → Edge
Functions → Add secret, o vía CLI):

```bash
supabase secrets set APIFY_TOKEN=<tu_token_apify>
supabase secrets set GEMINI_API_KEY=<tu_key_gemini>
```

Opcional:
```bash
# Default es gemini-2.0-flash; podés cambiar a 2.5-flash si querés
supabase secrets set PROMOLOG_GEMINI_MODEL=gemini-2.0-flash
```

Después del set, las funciones recogen los secrets en el siguiente cold start.

## Cómo testear manualmente

```bash
# Desde el panel admin (con JWT admin) o vía curl con anon Bearer:
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "X-Cron-Token: <CRON_INTERNAL_TOKEN>" \
  -d '{"only_handles":["jessy_asu"],"force":true,"max_creators":1}' \
  https://lsagslbkliprespbyhts.supabase.co/functions/v1/promolog-dispatch
```

Devuelve `{ ok: true, dispatch_run_id, apify_run_id, creators_dispatched: 1 }`.
Apify procesa (~30s-2min), llama webhook, y aparecen entries nuevas en
`promolog_entries WHERE analyzed_by_ai = true`.

## Deprecation de servicios Dokploy

Una vez verificado que el nuevo pipeline funciona en producción 2-3 días:

1. **Apagar** los servicios Promolog en Dokploy (`http://147.93.3.97:3000`):
   - Scraper containers
   - Clasificador containers
   - Uploader containers
2. **Confirmar** que no aparecen entries nuevas con `created_by IS NULL AND
   analyzed_by_ai = false` después del cutoff.
3. **Liberar recursos** de las VMs.

Tip: dejar el servicio viejo apagado pero presente 1-2 semanas como rollback
fácil antes de eliminarlo definitivamente.

## Notas de seguridad

- `promolog-webhook` tiene `verify_jwt=true`. El cliente Apify envía el
  publishable anon key como Bearer (via `headersTemplate`) para pasar el JWT
  check; la auth real es la doble validación de `dispatch_run_id` + `apify_run_id`
  contra DB (ambos solo los conoce Apify después del dispatch).
- El `supabase_anon_key` se guardó en `vault.secrets` para que pg_cron lo lea.

## Costo estimado

- Apify Instagram Scraper: ~$0.40/1000 results × ~3,600 results/mes = **~$1.50/mes**
  *(el scraper devuelve stories y posts en bulk; el precio cae si caching es bueno)*
- Gemini 2.0 Flash Vision: ~$0.10/1M input tokens, ~$0.40/1M output × ~3,600
  imágenes/mes ≈ **~$8/mes**
- **Total: ~$10-20/mes** (vs el coste de 5 VMs en Dokploy)
