# Servidor de llamadas dedicado (cómo está HOY)

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
