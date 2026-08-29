# LiveKit self-hosted (videollamadas Maven + Cowork)

Servidor de medios WebRTC (SFU) que reemplaza a LiveKit Cloud. Lo consumen las
edge functions `livekit-token` (videollamada de Messenger) y `cowork-session`
(Cowork), que firman tokens con la API key/secret de aquí.

**Contexto:** el server self-hosted anterior (`lk-chat.asmtech.ai`) se cayó sin dejar
rastro ni artifact de deploy → esta vez la config vive en el repo. Ver memoria
`livekit_video_cowork_down`.

## Arquitectura
```
Navegador ── wss (señalización) ──▶ Traefik :443 (TLS) ──▶ livekit :7880
          ── media WebRTC ─────────▶ host 147.93.3.97 :7882/udp  (+ :7881/tcp fallback)
```
- Señalización = HTTP/WebSocket → la maneja Traefik (dominio en Dokploy).
- Media = UDP/TCP directo al host (Docker abre los puertos en iptables solo).
- `use_external_ip: true` → LiveKit anuncia la IP pública en los candidatos ICE.

## Deploy en Dokploy (misma caja, proyecto maven_v3)
1. **DNS**: crear `A record` `lk.asmtech.ai` → `147.93.3.97` (GoDaddy).
2. **Create Service → Compose**, apuntando a este directorio (`infra/livekit`).
3. **Environment**: setear `LIVEKIT_KEYS` con el par generado (formato `APIxxxx: secretxxxx`).
   Generar con: `docker run --rm livekit/livekit-server generate-keys`
   (o `openssl rand -hex 16` para la key y `openssl rand -base64 33` para el secret).
   NO commitear este valor.
4. **Domains**: agregar `lk.asmtech.ai` → contenedor puerto `7880`, HTTPS/Let's Encrypt ON.
   (Dokploy inyecta los labels de Traefik correctos.)
5. **Deploy**. Verificar: `https://lk.asmtech.ai/` responde `OK`; y una conexión
   WebSocket a `wss://lk-chat...`→ ahora `wss://lk.asmtech.ai` abre sin error.

## Cutover (Slice 3) — cambiar Maven de Cloud a self-hosted
Actualizar los 3 secrets de Supabase (proyecto `lsagslbkliprespbyhts`):
```
supabase secrets set \
  LIVEKIT_URL=wss://lk.asmtech.ai \
  LIVEKIT_API_KEY=<misma key de LIVEKIT_KEYS> \
  LIVEKIT_API_SECRET=<mismo secret de LIVEKIT_KEYS> \
  --project-ref lsagslbkliprespbyhts
```
Se propagan solos (no hace falta redeploy de las funciones). Verificar en vivo:
entrar a `/call/<sala>` → "Unirse ahora" → debe conectar contra lk.asmtech.ai.

**Rollback instantáneo:** volver a poner los 3 secrets del proyecto LiveKit Cloud
`maven-d1hugnhe.livekit.cloud` (queda como red de seguridad).

## Puertos a verificar tras el deploy
- `7880/tcp` (vía Traefik/443, no directo) — señalización
- `7881/tcp` — media fallback
- `7882/udp` — media principal

## Pendiente / opcional
- **TURN** (Slice 2): activar `turn:` en el bloque `LIVEKIT_CONFIG` del compose solo si algún cliente detrás de
  NAT estricto no conecta.
- **Redis**: no hace falta para un solo nodo. Agregar si algún día se escala a multi-nodo.
- **Puerto UDP único vs rango**: para muy alta concurrencia conviene un rango; para este
  uso (docenas de participantes, all-hands ocasional de ~50) el puerto único va bien.

## Grabaciones (egress) — agregado 21/08/2026

El compose ahora trae `redis` (coordinación), `egress` (compone el MP4) y
`rec-server` (descargas firmadas + borrado). Los archivos viven en
`/var/lib/maven/grabaciones` del host — viable SOLO porque el vencimiento a
90 días no tiene excepciones (espacio acotado, ~36 GB máx).

### Activación (una vez)
1. **Env del compose** (Dokploy > este servicio > Environment), además de
   `LIVEKIT_KEYS`:
   - `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (los MISMOS del par de LIVEKIT_KEYS)
   - `RECORDINGS_SIGNING_SECRET` (generar: `openssl rand -hex 32`)
2. **DNS**: A record `rec.asmtech.ai` → `147.93.3.97` (GoDaddy, cuenta de Álvaro).
3. **Domains** en Dokploy: `rec.asmtech.ai` → contenedor `rec-server` puerto `8080`, HTTPS ON.
4. **Secrets de Supabase** (para la edge `recordings`):
   ```
   supabase secrets set \
     RECORDINGS_SIGNING_SECRET=<el mismo de arriba> \
     RECORDINGS_BASE_URL=https://rec.asmtech.ai \
     RECORDINGS_CRON_TOKEN=<openssl rand -hex 24> \
     --project-ref lsagslbkliprespbyhts
   ```
5. **Redeploy del compose**. ⚠️ CORTA las llamadas en curso (~30 s): hacerlo
   en horario tranquilo.
6. **Cron diario** (SQL Editor): ver el comentario al final de la migración
   `20260820210000_meeting_recordings.sql` (llama a la edge con `{"action":"expire"}`
   y el header `X-Cron-Token`).

### Verificar
- `docker logs` del egress sin errores de redis/ws.
- `https://rec.asmtech.ai/health` → `{ok:true, archivos, bytes}`.
- Grabar 1 min de una sala de prueba → aparece el MP4 en el host y la fila
  en `meeting_recordings` pasa a `ready` con tamaño.

## Dónde vive cada cosa (y por qué)

No hay `livekit.yaml` ni `rec-server.mjs` sueltos montados en los contenedores.
Los dos entran por la **definición del servicio**:

- La config de LiveKit va inline en `LIVEKIT_CONFIG` (docker-compose.yml).
- El código de rec-server va dentro de su imagen (`rec-server/Dockerfile`).

Esto no es preferencia de estilo. Un bind-mount de **un solo archivo** no cambia
la definición del servicio, así que `docker compose up -d` —o sea, un Deploy de
Dokploy— no recrea ni reinicia el contenedor. El proceso adentro ya leyó su
config (LiveKit) o ya cargó su módulo (node) al arrancar, así que sigue
corriendo lo viejo **mientras el deploy figura "Done" en verde**. Es el peor
modo de falla posible: todo dice que salió bien y no salió.

Pasó dos veces: una hora depurando código de rec-server que no estaba
corriendo, y el webhook de grabaciones que hubo que activar reiniciando el
contenedor a mano.

Con config y código dentro de la definición, cambiarlos cambia el servicio, y
el deploy los aplica solo. Un deploy vuelve a significar lo que uno cree.

Para confirmar qué está sirviendo de verdad:

```
curl -s https://rec.asmtech.ai/health
```
