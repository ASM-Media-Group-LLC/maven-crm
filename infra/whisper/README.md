# Whisper self-hosted para Maven Bot WhatsApp

Servicio Docker que corre [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) y expone una API **OpenAI-compatible** para transcribir audios de WhatsApp **sin depender de Groq ni ElevenLabs**.

## Por qué self-host

| | Groq Whisper | Self-host (este servicio) |
|---|---|---|
| Costo | $0.04/h audio (~$1/mes a tu volumen) | $0 marginal si tu Dokploy tiene capacidad |
| Privacidad | Audios viajan a Groq | Quedan dentro de tu infra |
| Rate limits | Sí (Groq tier free/paid) | Solo los de tu hardware |
| Latencia | ~0.5s (200x realtime) | CPU: 5-30s · GPU: <2s |
| Mantenimiento | Cero | Updates del container, monitoreo |
| SLA | Groq 99.9% | Lo que dé tu server |

Para contenido sensible (charlas internas del equipo, info de modelos, números de teléfono) el argumento **privacidad** suele ganar al costo.

## Deploy en Dokploy

### Paso 1: Subir el servicio

1. Asegurate que esta carpeta `infra/whisper/` está en tu repo (ya está mergeada en el PR del agente WhatsApp).
2. En Dokploy → **Create Application** → **Docker Compose**.
3. Source: el mismo repo de Maven, branch `main`, path `infra/whisper`.
4. Environment variables:
   ```
   WHISPER_INTERNAL_TOKEN=<generar random 32 chars>
   ```
   Ejemplo: `openssl rand -hex 32` te da un token válido.

### Paso 2: Exponer el dominio

1. En Dokploy → la app que acabás de crear → **Domains**.
2. Agregar dominio (ej. `whisper.tu-dominio.com`).
3. Activar **HTTPS** (Let's Encrypt automático en Dokploy).
4. Port: `8000`.

### Paso 3: Reverse proxy con auth

faster-whisper-server **no tiene auth built-in**. Tenés dos opciones:

**Opción A: Traefik middleware (recomendada en Dokploy)**

En la app → **Advanced** → **Middlewares** agregá un middleware tipo `headers` que valide:
```
Headers Custom Request Headers:
  Authorization: Bearer ${WHISPER_INTERNAL_TOKEN}
```

O mejor, usar un middleware `forwardAuth` que valide el header.

**Opción B: Caddy/nginx delante del container**

Si tu Dokploy ya tiene Caddy, agregar config:
```caddyfile
whisper.tu-dominio.com {
    @valid header Authorization "Bearer {env.WHISPER_INTERNAL_TOKEN}"
    handle @valid {
        reverse_proxy whisper:8000
    }
    handle {
        respond "Unauthorized" 401
    }
}
```

⚠️ **No expongas el endpoint sin auth**. Aunque Whisper no consume datos del request, alguien podría usarlo para transcribir spam y consumir tu CPU/RAM.

### Paso 4: Configurar Supabase

En el dashboard de Supabase → Edge Functions → **Secrets**, agregar:

```
WHISPER_API_URL=https://whisper.tu-dominio.com/v1/audio/transcriptions
WHISPER_API_KEY=<el mismo WHISPER_INTERNAL_TOKEN>
```

`whatsapp-transcribe-audio` ya está armado para detectar estas vars y usar self-hosted con **fallback automático a Groq** si el self-host falla.

### Paso 5: Verificar

Test manual desde la consola:
```bash
curl -X POST https://whisper.tu-dominio.com/v1/audio/transcriptions \
  -H "Authorization: Bearer <WHISPER_INTERNAL_TOKEN>" \
  -F "file=@test_audio.ogg" \
  -F "model=whisper-large-v3-turbo" \
  -F "language=es" \
  -F "response_format=verbose_json"
```

Si responde con el transcript en JSON, está OK.

## Hardware recomendado

**CPU (default del compose)**
- 2 vCPU mínimo, 4 vCPU recomendado
- 3GB RAM
- Latencia esperada: 30s de audio en ~15-30s de proceso

Apto para grupos con bajo-medio volumen (<200 audios/día).

**GPU (variante CUDA)**

Si tu server tiene GPU NVIDIA, cambiar `docker-compose.yml`:
```yaml
image: fedirz/faster-whisper-server:latest-cuda
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
WHISPER__INFERENCE_DEVICE: cuda
WHISPER__COMPUTE_TYPE: float16
```

Requiere: drivers NVIDIA + nvidia-container-toolkit instalados en el host.

Latencia esperada: 30s de audio en <2s. Apto para volumen alto (>1000 audios/día).

## Fallback a Groq

`whatsapp-transcribe-audio` siempre intenta primero la URL configurada en `WHISPER_API_URL`. Si:
- El endpoint no responde (timeout, 5xx, network error)
- O devuelve un transcript vacío

… cae automáticamente a Groq. Esto te da resiliencia gratis: si el container de Dokploy se cae, los audios siguen procesándose con Groq mientras lo reparás.

Si querés **forzar** que use solo self-host (sin fallback), setear:
```
WHISPER_FALLBACK_ENABLED=false
```

## Troubleshooting

**Cold start lento (~3 min en el primer request)**
- Normal. El modelo (~1.5GB) se descarga la primera vez.
- En siguientes deploys el volumen `whisper-models` lo conserva.

**Memoria insuficiente / OOM kill**
- `large-v3-turbo` en int8 necesita ~2GB. Si tu host está apretado de RAM:
  - Usar `WHISPER__COMPUTE_TYPE: int8_float16` (más lento, menos RAM)
  - O modelo más chico: `WHISPER__MODEL: Systran/faster-whisper-small` (~500MB, menor calidad)

**Transcripciones de mala calidad en español**
- Verificá que `DEFAULT_LANGUAGE: es` está seteado
- Si los audios tienen mucho ruido, considerar pre-procesado (no implementado acá)

**Nombres propios / jerga mal transcritos ("shit" por sheet, "hop stop" por Hubstaff)**
- El fix NO está acá: es el **glosario** que las edge functions mandan como `prompt`
  (ver `supabase/functions/_shared/whisper-glossary.ts`). Whisper sesga la
  decodificación hacia esos términos. Nombre nuevo que Whisper masacre → agregarlo
  a ese glosario (constantes `EQUIPO` / `HERRAMIENTAS`).
- Además el compose usa `WHISPER__COMPUTE_TYPE: int8_float32` (más preciso que
  int8 puro, mismo RAM). Cambios al compose requieren **Redeploy manual** de la
  app `whisper` en Dokploy — no se auto-deploya con el push.

**Logs**
- En Dokploy → la app → **Logs** ves stdout/stderr del container
- En el panel admin de Maven Bot, los errores también aparecen en la tab "Eventos" del grupo correspondiente
