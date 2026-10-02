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

## El índice diario (`indice.mjs`)

En el disco los archivos no tienen nombre ni carpeta (`<agencia>/<id>`): el
árbol vive solo en la base. Como no hay copia de seguridad, cada noche a las
**3:15** la mini le pide el índice a la edge `drive` (permiso firmado
`op: "indice"`) y lo guarda **en los dos discos**, en la carpeta de cada agencia:

```
/Volumes/NASx/maven-drive/<agencia>/_indice/actual.csv   ← abrir con Excel
/Volumes/NASx/maven-drive/<agencia>/_indice/actual.json
/Volumes/NASx/maven-drive/<agencia>/_indice/AAAA-MM-DD.csv (últimos 30 días)
```

Cada fila: ruta legible («Contabilidad/2026/Balance.pdf»), dueño y su correo,
tamaño, huella, estado, si está en la papelera, y `archivo_en_disco` (dónde
está: `/Volumes/NASx/maven-drive/<eso>`).

LaunchAgent `ai.maven.nas-drive-indice` (usa `indice.sh`, log en
`~/maven-nas-drive/indice.log`). Correrlo a mano:
`launchctl kickstart gui/$(id -u)/ai.maven.nas-drive-indice`.
Tests: `node --test infra/nas-drive/indice.test.mjs`.

## Importar el archivo de Google (`importar.mjs`)

Lo bajado de Google Drive al NAS (unidades compartidas en `/Volumes/NASx/<unidad>`
y «Mi unidad» en `/Volumes/NASx/Mi unidad/<correo>`) entra al Drive de Maven
**sin copiarse**: por cada archivo, un enlace duro en el mismo disco
(`maven-drive/<agencia>/google/<id>`) y su ficha a la edge `drive` (acción
`importar`, permiso firmado con `DRIVE_SECRETO`). Las fichas van sin dueño (archivo
de la empresa, no cuenta en el cupo de nadie) y cada carpeta raíz se comparte con
quien tenía acceso en Google. Los ids salen del camino: relanzar no duplica.

    cd ~/importar
    node importar.mjs plan.json --prueba          # recorre y cuenta, no toca nada
    set -a; . ~/maven-nas-drive/.env; set +a
    node importar.mjs plan.json --solo unidad:<id> # una sola, para probar
    node importar.mjs plan.json                    # todo (salta lo ya hecho: importado.json)

Desde Terminal (`open -a Terminal …`): por SSH macOS no deja leer los discos.

Tests: `node --test infra/nas-drive/importar.test.mjs`.

El índice diario pide el árbol **de a páginas** (`paginado: true`, cursor por id)
y lo arma acá (`armarFilas`): con el archivo de Google son cientos de miles de
fichas y todas juntas no entraban en la memoria de la edge.
