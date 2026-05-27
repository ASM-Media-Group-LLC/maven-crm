# Maven Baileys Gateway

HTTP wrapper minimo sobre [Baileys](https://github.com/WhiskeySockets/Baileys)
que implementa exactamente el subset de Evolution API que nuestras edge
functions necesitan. Reemplaza a `evoapicloud/evolution-api`.

## Por que existe

Evolution API agrego licensing comercial obligatorio en v2.4.0-rc1, y solo
esa version+ tiene el fix del bug `onWhatsApp validation for @lid contacts`
que rompe los sends en grupos donde hay miembros silenciosos. Las
alternativas (v1.8.2 con LID roto, v2.3.7 sin fix garantizado, pagar
licencia) no servian.

Este gateway es la opcion FOSS limpia: codigo nuestro, MIT-friendly stack
(Baileys + Express), sin patches de paywalls, sin maintenance externa.

## Contract

Compatible con las edge functions existentes sin cambios:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/` | -- | `{ status, connection, ... }` |
| GET | `/instance/connect/:instance` | -- | `{ status, qrcode: { base64, code } }` |
| GET | `/instance/connectionState/:instance` | -- | `{ state, lastError }` |
| GET | `/instance/qr.html` | -- | HTML con QR para scan (refresca cada 5s) |
| POST | `/message/sendText/:instance` | `{ number, text }` o v1 wrapper | `{ key: { id } }` |
| DELETE | `/instance/logout/:instance` | -- | `{ status: "logged_out" }` |

Todo endpoint excepto `/` requiere header `apikey: <API_KEY>`.

Webhook outbound (a `WEBHOOK_URL` env): el shape de `messages.upsert` de
Evolution para que `whatsapp-ingest` no necesite cambios.

## Env vars

| Variable | Default | Notas |
|---|---|---|
| `API_KEY` | -- (required) | header apikey aceptado |
| `WEBHOOK_URL` | empty | si esta vacio, no forwardea mensajes |
| `INSTANCE_NAME` | `maven-bot` | aparece en el payload del webhook |
| `AUTH_DIR` | `/data/auth` | donde Baileys guarda creds + keys |
| `PORT` | `8080` | |
| `LOG_LEVEL` | `info` | pino level |

## Deploy

Ver header de `docker-compose.yml` para los pasos en Dokploy.

## LID handling

Baileys 7.0.0-rc.9 tiene mejor handling de LID que las versiones que usaba
Evolution v1.8.2. Si todavia aparece "SessionError: No sessions" en algun
grupo, opciones:

- Patchear Baileys con `patch-package` (ver Evolution v2.4.0-rc2 release
  notes para la logica). Como Baileys es MIT, el patch es legal y limpio.
- Catch del error y retry sin assertSessions (mas hack).
- Actualizar a una version mas nueva de Baileys cuando salga.

Por ahora arrancamos con rc.9 baseline. Si vemos el problema, iteramos.

## Rollback

Si el gateway falla y queremos volver a Evolution v1.8.2:

1. Cambiar Provider de Dokploy a Raw.
2. Pegar el compose viejo (esta archivado en `infra/evolution/docker-compose.yml`,
   modificable a v1.8.2 quitando postgres).
3. Save + Redeploy.

Pero entonces vuelve el LID issue.
