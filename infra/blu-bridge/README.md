# blu-bridge

Micro que jala el **ingreso diario por modelo** desde BLU (CRM interno de OnlyFans) y lo
ingesta en Maven (RPC `import_blu_earnings`). Para Promolog (promo↔ingreso) + tab Ventas.

Flujo: login Cognito (SRP, usuario de servicio) → GET `app.blu.luxe/api/...earnings` →
transformar → `import_blu_earnings(rows)` en Maven (service_role).

## Deploy en Dokploy
1. Crear una **App** (Docker) apuntando a este repo, path `infra/blu-bridge` (Dockerfile incluido).
2. En **Environment / Secrets**, setear (ver `.env.example`):
   - **Config pública de Cognito** (del bundle de BLU): `BLU_USER_POOL_ID`, `BLU_CLIENT_ID`.
   - **Usuario de servicio de BLU** (SECRETOS, idealmente dedicado): `BLU_USERNAME`, `BLU_PASSWORD`.
   - **API**: `BLU_API_BASE` (default `https://app.blu.luxe`), `BLU_EARNINGS_PATH` (confirmar con un request real).
   - **Maven**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (SECRETO).
   - Operación: `LOOKBACK_DAYS` (default 8), `RUN_EVERY_HOURS` (default 24).
3. Deploy. El micro corre, hace una corrida al arranque y luego cada `RUN_EVERY_HOURS`.

## Falta confirmar (1 request real de BLU) — usar el modo PROBE
En vez de pelear con el DevTools de BLU, seteá `BLU_PROBE=1` (con Cognito + usuario de
servicio ya cargados) y deployá una vez: el micro se autentica, **tantea los endpoints
candidatos** (`of-creator-reports`, `gross-earnings`, `net-earnings`, …) y loguea el
**status + la forma del JSON** de cada uno, luego sale (no ingesta nada). Con eso:
- confirmás `BLU_EARNINGS_PATH` exacto + sus query params,
- y la forma del JSON → ajustar `transform()` en `index.mjs`.
Después quitá `BLU_PROBE` y redeployá: corre normal (1 corrida al arranque + cada `RUN_EVERY_HOURS`).

## Notas
- `import_blu_earnings` está gateada (management) pero permite `service_role` (que usa el micro).
- Cognito vía SRP (`amazon-cognito-identity-js`) → no requiere habilitar USER_PASSWORD_AUTH en el client.
- Ningún secreto vive en el repo: todo por env en Dokploy.
