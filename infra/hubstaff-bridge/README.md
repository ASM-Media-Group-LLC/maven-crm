# hubstaff-bridge

Micro (Dokploy) que trae datos de **Hubstaff** y los ingesta en **Maven** (Supabase). Hermano de `blu-bridge`.

## Qué hace
1. **Auth**: usa un Personal Access Token (`hubstaff:read`) — que es un *refresh token* — y lo canjea en `account.hubstaff.com/access_tokens` por un access token (~24h). El refresh **rota** en cada canje y se persiste en la tabla `hubstaff_secrets` (la semilla inicial viene de `HUBSTAFF_PAT_REFRESH_TOKEN`).
2. **Auto-descubre** las organizaciones que el owner puede ver (`GET /v2/organizations`) — no hay que hardcodear IDs.
3. Por cada org: sincroniza el **directorio de miembros** (`import_hubstaff_members`) y la **actividad diaria** (`activities/daily` → `import_hubstaff_data`).
4. Corre cada `RUN_EVERY_HOURS` (default 6h).

## Variables (Dokploy → Environment)
Ver `.env.example`. La única secreta que ponés vos: `HUBSTAFF_PAT_REFRESH_TOKEN`.

## Modos
- `npm run probe` (`HUBSTAFF_PROBE=1`) — **no sincroniza**: imprime el shape crudo de la API para **validar los nombres de campo** antes de confiar en el parser. Correr esto PRIMERO tras pegar el token.
- `npm run once` (`RUN_ONCE=1`) — una corrida y sale.
- `npm start` — loop cada 6h (modo producción).

## Seguridad
- El token vive solo en los secrets de Dokploy + `hubstaff_secrets` (tabla service-role-only, sin policies). Nunca en el repo ni en el frontend.
- Las tablas `hubstaff_activities`/`screenshots`/`daily_data` son admin/management-only por RLS.
