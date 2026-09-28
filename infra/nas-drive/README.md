# nas-drive — el servidor de archivos del Drive de Oficina

Corre en **mini5** (`unlok-server-5`, hoy se llama `unlok-workstation`) y guarda
los archivos del Drive como **archivos comunes** en `NAS1`/`NAS2`
(`/Volumes/NASx/maven-drive/<tenant_id>/<id>`), eligiendo el disco con más
lugar. Decisión de Jhon (28/09/2026): **sin R2 y sin copia de seguridad**.

- Solo atiende permisos firmados por la edge `drive` (misma firma que
  `supabase/functions/_shared/drive-firma.ts`; vector compartido en los tests).
- Escucha en `127.0.0.1:8790`: la única puerta desde afuera es el
  **Cloudflare Tunnel**.
- `GET /salud` dice cuánto lugar queda en cada disco.

## Instalado en mini5

- `~/maven-nas-drive/` con `server.mjs`, `firma.mjs`, `.env` (chmod 600:
  `DRIVE_SECRETO`, `RAICES`, `ORIGENES`, `PUERTO`, `HOST`) e `iniciar.sh`.
- LaunchAgent `~/Library/LaunchAgents/ai.maven.nas-drive.plist` (arranca solo
  y se reinicia si se cae). Log: `~/maven-nas-drive/servidor.log`.
- ⚠️ **macOS pide permiso** la primera vez que `node` toca un volumen externo:
  hay que tocar **Permitir** en la PANTALLA de la mini (por SSH no se puede).
  Si Homebrew actualiza Node, cambia la ruta del binario y lo vuelve a pedir.

## Actualizar

```bash
scp infra/nas-drive/{server.mjs,firma.mjs} asm002@unlok-server-5:~/maven-nas-drive/
ssh asm002@unlok-server-5 'launchctl kickstart -k gui/$(id -u)/ai.maven.nas-drive'
```

Tests: `node --test infra/nas-drive/test.mjs`.
