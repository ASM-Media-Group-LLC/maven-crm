# Servidores de llamadas dedicados — verificado el 24/11/2026

## Mapa actual

| Servicio | Destino | Comprobado en esta auditoría |
|---|---|---|
| Llamadas de producción | Miami, `45.32.172.118`, `45-32-172-118.sslip.io` | 4 CPU, 7,75 GiB RAM; LiveKit 1.8.4, Redis, Egress y Caddy; sin reinicios/OOM del SFU en la instantánea |
| Alternativa de llamadas | St. Louis, `195.26.254.111`, `lk.asmtech.ai` | 8 CPU, 23,47 GiB RAM; LiveKit 1.8.4 y TURN disponibles |
| Documentos | Mismo VPS de St. Louis | ONLYOFFICE 9.4.0.1 activo; debe conservar recursos al probar cargas |
| Web | Dokploy, `147.93.3.97`, `app.maven-ai.me` | HTTP 200; falta acceso administrativo para medir recursos internos |

En ambos servidores se comprobó TLS de señalización y TURN 5349 y respuesta
STUN UDP 3478. Esto no prueba una llamada completa usando TURN desde una red
corporativa. Certificados observados: Miami vence el 17/02/2027 y St. Louis el
15/01/2027. La renovación del certificado que usa el SFU requiere verificar su
recarga sin interrumpir llamadas; no se reinició ninguno durante la auditoría.

El cambio de región queda manual en `.github/workflows/livekit-region.yml`.
Se retiró el cron del traslado del 20/11, que se habría repetido cada año.
El simulacro del 24/11 usó contenedores temporales y red interna en St. Louis,
sin puertos públicos, sin usuarios reales y sin modificar estos servicios.
Evidencia y límites: [auditoría](../../docs/audits/infraestructura-base-2026-11-24.md)
y [simulacros](../../docs/auditorias/infraestructura-2026-11-24/README.md).

## Montaje de St. Louis y antecedentes

Desde octubre de 2026 LiveKit ya no vive en el servidor compartido ni en Dokploy
(lo de `docker-compose.yml` y `README.md` de esta carpeta es el montaje viejo).
Corre solo en su propio VPS:

- **Servidor:** Contabo Cloud VPS 8, `195.26.254.111` (dominio `lk.asmtech.ai`).
- **Carpeta:** `/opt/maven-livekit` → `docker-compose.yml` (red de host) con
  `livekit/livekit-server:v1.8.4` y `caddy:2` (TLS de `lk.asmtech.ai` en 443,
  reenvía a 7880). Config de LiveKit en `livekit.yaml` (las llaves NO van al repo).
- **Puertos:** 7880 (señalización, detrás de Caddy), 7881/tcp y 7882/udp (media),
  **3478/udp y 5349/tcp (TURN, red de respaldo)**.
- **Guardián:** `guardian.sh` (revive LiveKit si se cae).

## Red de respaldo (TURN) — 13/11/2026

Decisión de Alvaro para quienes tienen internet que bloquea o corta las llamadas.
En `livekit.yaml`:

```yaml
turn:
  enabled: true
  domain: lk.asmtech.ai
  udp_port: 3478
  tls_port: 5349
  cert_file: /certs/lk.asmtech.ai.crt
  key_file: /certs/lk.asmtech.ai.key
```

y en el compose, el certificado que renueva Caddy, de solo lectura:
`./caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/lk.asmtech.ai:/certs:ro`.
Respaldos de antes del cambio: `*.respaldo-20261114-*` en la misma carpeta.

⚠️ **LiveKit lee el certificado solo al arrancar.** Caddy lo renueva solo (el de
hoy vence el **15/01/2027**; Caddy lo renueva ~30 días antes). Hasta que haya un
reinicio automático tras la renovación, hay que reiniciar LiveKit
(`docker compose restart livekit`, corta las llamadas ~30 s, de noche) entre el
16/12/2026 y el 15/01/2027.
