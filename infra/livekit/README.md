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
- **TURN** (Slice 2): activar `turn:` en `livekit.yaml` solo si algún cliente detrás de
  NAT estricto no conecta.
- **Redis**: no hace falta para un solo nodo. Agregar si algún día se escala a multi-nodo.
- **Puerto UDP único vs rango**: para muy alta concurrencia conviene un rango; para este
  uso (docenas de participantes, all-hands ocasional de ~50) el puerto único va bien.
