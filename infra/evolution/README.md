# Evolution API — WhatsApp gateway

Self-hosted [Evolution API](https://doc.evolution-api.com/) (Baileys wrapper)
para que Maven Bot pueda hablar con WhatsApp.

## Por qué este servicio

WhatsApp no tiene API oficial para bots multi-device. Evolution wrappea
[Baileys](https://github.com/WhiskeySockets/Baileys) (la implementación
no-oficial del protocolo de WhatsApp Web) detrás de una REST API estable,
con webhook global hacia nuestro ingest en Supabase.

Es el único componente del stack que necesita escanear un QR para
funcionar — el resto es código nuestro.

## Versión actual: v2.4.0-rc2

### Por qué pre-release

v1.8.2 (lo que usábamos antes) tenía un bug crítico con los LID
(Linked Identity) contacts de WhatsApp post-2025: al hacer `sendText`
a un jid `@lid`, Baileys hacía un chequeo `onWhatsApp` que fallaba con
`SessionError: No sessions` y tiraba la conexión. El bot podía recibir
mensajes pero no responder.

El fix es [Baileys PR #2544](https://github.com/WhiskeySockets/Baileys/pull/2544)
y solo está integrado en Evolution v2.4.0-rc2+. No hay backport a la
rama estable v1.

### Tradeoffs de v2

- **Necesita Postgres**: v1 podía correr standalone, v2 obliga a tener
  una DB. Por eso el compose levanta `postgres:16-alpine` al lado.
- **License activation**: v2.4.0-rc1+ gatea TODOS los `/instance/*`
  endpoints hasta que el container se activa contra el licensing server
  de Evolution Foundation. El compose hace **headless auto-activation**
  vía `EVOLUTION_OPERATOR_EMAIL` (tier "community", free para self-host).
  Sin esa env, la UI muestra "Error: undefined" al crear instancia y la
  API devuelve `503 LICENSE_REQUIRED`.
- **Payload de `sendText` cambia**:
  - v1: `{ number, options:{delay,presence}, textMessage:{text} }`
  - v2: `{ number, text }`
  Las edge functions soportan ambos vía `WHATSAPP_EVOLUTION_API_VERSION`.

## Deploy en Dokploy

Ver [`docker-compose.yml`](./docker-compose.yml) — el header del archivo
tiene la guía paso a paso.

### Resumen para reemplazar el compose existente

1. Dokploy → `maven-evolution` → tab General → Compose File →
   reemplazar todo por el contenido de `docker-compose.yml` (este repo).
2. Tab Environment: verificar `EVOLUTION_API_KEY` y `POSTGRES_PASSWORD`.
3. Save → Redeploy.
4. Activar licencia en el Manager UI.
5. Recrear instancia `maven-bot`, escanear QR con el teléfono del bot.
6. Supabase secrets → `WHATSAPP_EVOLUTION_API_VERSION=v2`.
7. Test: `@maven presentate` en el grupo.

## Env vars requeridas en Dokploy

| Variable | Origen | Notas |
|---|---|---|
| `EVOLUTION_API_KEY` | ya existe | API key global de Evolution. Mismo valor que `WHATSAPP_EVOLUTION_API_KEY` en Supabase. |
| `POSTGRES_PASSWORD` | ya existe | Password del postgres interno. No expuesto fuera de la red dokploy. |

## Env vars en Supabase Edge Functions

| Variable | Valor durante upgrade | Valor post-upgrade |
|---|---|---|
| `WHATSAPP_EVOLUTION_URL` | `https://evolution.147-93-3-97.nip.io` | (igual) |
| `WHATSAPP_EVOLUTION_API_KEY` | (igual que Dokploy) | (igual) |
| `WHATSAPP_EVOLUTION_INSTANCE` | `maven-bot` | (igual) |
| `WHATSAPP_EVOLUTION_API_VERSION` | `v1` (default) | `v2` (flip post-deploy) |

## Rollback

Si v2 explota:

1. Editar compose: imagen a `evoapicloud/evolution-api:1.8.2`, borrar
   bloque `postgres` y `depends_on`.
2. Save → Redeploy.
3. Supabase: `WHATSAPP_EVOLUTION_API_VERSION=v1`.
4. Rescanear QR (la session se pierde con el downgrade).

No hay riesgo de data loss en Supabase: `whatsapp_messages` no se guarda
en Evolution.
