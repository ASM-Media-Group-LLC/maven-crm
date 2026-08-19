# blu-bridge

Micro que jala el **ingreso diario por modelo** desde BLU y lo ingesta en Maven
(RPC `import_blu_earnings`). Para Promolog (promo↔ingreso) + tab Ventas.

Flujo: lee `BLU_JWT` (sesión del owner) de env → (opcional) handshake WS de auth →
GET REST de ingresos con `Authorization: Bearer <JWT>` → transformar → `import_blu_earnings(rows)`.

## Auth (importante)
- `BLU_JWT` es el **token de sesión del owner** (HS256, ~24h). El micro **reusa** ese token; no
  crea sesión ni toca el login biométrico de BLU. Va como **secreto** en Dokploy.
- **Rotación MANUAL:** cuando el JWT vence (~24h), el owner lo renueva desde BLU y actualiza el
  secreto. El micro detecta 401/403 (o ack WS con error), loguea `⚠ Renová BLU_JWT`, y:
  - en modo long-running (default): no crashea, espera al próximo tick;
  - en `RUN_ONCE=1`: sale con código `2` (para alertar/reintentar vía cron de Dokploy).

## Deploy en Dokploy
1. App (Docker) apuntando a este repo, path `infra/blu-bridge` (Dockerfile incluido).
2. En **Environment / Secrets** (ver `.env.example`):
   - `BLU_JWT` (SECRETO), `BLU_API_BASE`, `BLU_EARNINGS_PATH`, `BLU_WS_URL` (opcional),
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (SECRETO), `LOOKBACK_DAYS`, `RUN_EVERY_HOURS`.
3. Deploy. Corre al arranque y cada `RUN_EVERY_HOURS`.

## Confirmar el endpoint (una vez, con PROBE)
Con `BLU_JWT` ya seteado, poné `BLU_PROBE=1` y deployá una vez: el micro tantea host+endpoints
candidatos (`/api/earnings`, `/api/creator-earnings/daily`, `/api/v1/earnings`, … en `of.blu.luxe`
y `app.blu.luxe`) con tu JWT, y loguea **status + forma del JSON** de cada uno. Con eso:
- fijás `BLU_API_BASE` + `BLU_EARNINGS_PATH`,
- ajustás `transform()` a la forma real,
- quitás `BLU_PROBE` y redeployás.

## Notas
- `import_blu_earnings` está gateada (management) pero permite `service_role` (lo usa el micro).
- Ningún secreto vive en el repo: todo por env en Dokploy. El JWT nunca se hardcodea.
- La rotación manual del JWT es frágil; el end-state robusto sigue siendo **acceso sancionado de BLU**
  (token de servicio / API / export a un bucket).
