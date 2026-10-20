# nas-drive — el servidor de archivos del Drive de Oficina

Corre en **mini5** (`unlok-server-5`, hoy se llama `unlok-workstation`) y guarda
los archivos del Drive como **archivos comunes** en `NAS1`/`NAS2`
(`/Volumes/NASx/maven-drive/<tenant_id>/<id>`), eligiendo el disco con más
lugar. Decisión de Jhon (28/09/2026): **sin R2 y sin copia de seguridad**.

- Solo atiende permisos firmados por la edge `drive` (misma firma que
  `supabase/functions/_shared/drive-firma.ts`; vector compartido en los tests).
- Escucha en el puerto 8790 (solo peticiones firmadas): la única puerta desde
  afuera es la **puerta** de `puerta/` (Caddy + Tailscale) en el Dokploy de
  microservicios, que llega al mini por su nombre MagicDNS. El túnel de
  Cloudflare se descartó (el DNS está en GoDaddy). Operación día a día:
  `CLAUDE.md` en esta carpeta.
- `GET /salud` dice cuánto lugar queda en cada disco.
- `POST /zip` arma **un .zip con varios archivos y carpetas** mientras baja
  («Descargar» con varios elegidos en el Drive). Ver abajo.

## Instalado en mini5

- `~/maven-nas-drive/` con `server.mjs`, `firma.mjs`, `zip.mjs`, `miniaturas.mjs`,
  `papelera.mjs`, `indice.mjs`, `.env` (chmod 600:
  `DRIVE_SECRETO`, `RAICES`, `ORIGENES`, `PUERTO`, `HOST`) e `iniciar.sh`.
- LaunchAgent `~/Library/LaunchAgents/ai.maven.nas-drive.plist` (arranca solo
  y se reinicia si se cae). Log: `~/maven-nas-drive/servidor.log`.
- ⚠️ **macOS pide permiso** la primera vez que `node` toca un volumen externo:
  hay que tocar **Permitir** en la PANTALLA de la mini (por SSH no se puede).
  Si Homebrew actualiza Node, cambia la ruta del binario y lo vuelve a pedir.

## Actualizar

```bash
scp infra/nas-drive/{server.mjs,firma.mjs,zip.mjs,miniaturas.mjs,papelera.mjs,indice.mjs} asm002@unlok-server-5:~/maven-nas-drive/
ssh asm002@unlok-server-5 'launchctl kickstart -k gui/$(id -u)/ai.maven.nas-drive'
```

⚠️ `server.mjs` importa `zip.mjs`, `miniaturas.mjs` (desde el 02/10) y
`papelera.mjs` (desde el 20/10, que también usa `indice.mjs`): si se copia uno
sin los otros, el servidor no arranca y el Drive entero queda sin archivos. El
paso a paso con respaldo está en `CLAUDE.md`.

Tests: `node --test infra/nas-drive/test.mjs`.

## La papelera del disco (`papelera.mjs`)

Desde que Google se vació (05/10), NAS1 y NAS2 son la **única copia** del
Drive. Por eso «Borrar para siempre» en Maven no borra en el acto: la edge
`drive` quita la ficha y el NAS **mueve** el archivo (un `rename` en el mismo
disco, instantáneo y sin copiar) a

```
/Volumes/NASx/maven-drive/.borrados/AAAA-MM-DD/<agencia>/<id>
/Volumes/NASx/maven-drive/.borrados/AAAA-MM-DD/<agencia>/google/<id>   ← importado de Google
```

con la fecha de Bogotá. Si ese día ya se había borrado algo con la misma clave,
el nuevo queda al lado con `.2`, `.3`… (nunca pisa). Su miniatura sí se borra
(se rehace sola). De lo importado de Google se mueve solo el **enlace duro** del
Drive: el archivo bajado de Google sigue donde estaba.

- **Cada noche** `indice.mjs` purga los días de hace **más de 30** (solo
  carpetas con nombre de fecha) y borra lo que una subida o una miniatura dejó a
  medias hace más de **24 h** en `.partes`, `.tmp` y `.miniaturas/.tmp`. Al
  arrancar, el servidor hace esa misma limpieza de temporales. Va al log del
  índice como `[papelera] …`.
- ⚠️ El lugar de lo borrado se libera **a los 30 días**, no al borrar: si un
  disco se llena, mirar primero cuánto ocupa `.borrados`
  (`du -sh /Volumes/NAS*/maven-drive/.borrados/*`) antes de tocar nada.
- **Recuperar un archivo**: buscar su nombre en el índice de un día ANTERIOR al
  borrado (`<agencia>/_indice/AAAA-MM-DD.csv`, columna `archivo_en_disco`; se
  guardan 30 días, lo mismo que la papelera) y devolverlo a su lugar con `mv`
  dentro del MISMO disco:
  `mv /Volumes/NASx/maven-drive/.borrados/<fecha>/<agencia>/<id> /Volumes/NASx/maven-drive/<agencia>/<id>`.
  La ficha ya no existe en Maven: hay que volver a crearla (o subirlo de nuevo
  desde la copia recuperada).

## Varios archivos en un .zip (`POST /zip`, `zip.mjs`)

La edge `drive` (acción `bajar_varios`) decide qué entra —con la RLS de la
persona, expandiendo las carpetas— y firma `{ op: "zip", e, n, l: [{ k, n }] }`
(una carpeta va como `{ n: "Carpeta/" }`, sin `k`, para que una vacía también
llegue). El navegador lo manda en el **cuerpo** de un formulario (campo `t`,
`application/x-www-form-urlencoded`) a un iframe escondido: con miles de rutas
el permiso pesa más de lo que aguanta una URL (el NAS acepta hasta 4 MB).

- Cada `k` pasa por las mismas reglas que un `get` (incluidos los importados
  de Google), todo de **una** agencia; las rutas de adentro no pueden tener
  `..`, `/` al principio, `\` ni caracteres de control (si no, al descomprimir
  se escribiría fuera de la carpeta), ni repetirse.
- Topes: **5000** archivos y carpetas y **50 GB** (los mismos que la edge,
  `TOPE_ZIP_*` en `supabase/functions/drive/logica.ts`).
- STORE (sin comprimir: lo que hay ya viene comprimido), CRC-32 mientras pasa
  (va en el «data descriptor»), **ZIP64** para archivos o .zip de más de 4 GB,
  nombres UTF-8. Se arma mientras baja, pero **con `Content-Length` exacto**
  (desde el 03/10, `tamanoDelZip`: con STORE y los tamaños por `stat`, el
  largo sale de sumar las mismas piezas que arma `armarZip`): el panel de
  descargas del Drive y la barra del navegador muestran cuánto falta. Probado
  el 02/10 con un .zip real de 4,5 GB: `unzip -t` y `ditto -x -k` (el motor
  del Archive Utility del Mac) lo abren.
- Si el navegador corta, se deja de leer el disco. Un archivo que la base
  tiene y el disco no, no corta el .zip: va una nota «No se pudieron
  incluir.txt» con cuáles faltaron.
- La puerta (`puerta/`) es un `caddy reverse-proxy` sin filtro de rutas:
  `POST /zip` pasa igual que `/o`, y Caddy manda la respuesta a medida que
  llega (no la acumula).
- El Drive pide el .zip con `fetch` (el mismo formulario, un pedido «simple»
  sin pregunta previa de CORS) para leer el avance; si es muy grande y el
  navegador no deja escribir directo a disco (Safari/Firefox), lo manda como
  antes a un iframe escondido.

## Miniaturas (op `mini`, `miniaturas.mjs`)

Para las vistas Cuadrícula y Galería del Drive. La edge `drive` (acción
`miniaturas`, hasta 200 por llamada, leyendo como la persona) firma
`{ op: "mini", k, x }` (`x` = la extensión con que se hace) y el navegador pide
`GET /o?t=…` en un `<img>`. La clave pasa por las mismas reglas que un `get`
(los importados de Google también tienen miniatura).

- **Imágenes** (jpg, png, heic, webp, tiff…): `sips -Z 480` a JPEG.
  **Videos, PDF y Office** (mov, mp4, pdf, docx, xlsx, pptx, key…): Quick Look
  (`qlmanage -t -s 480`) y su PNG a JPEG con `sips`. Quick Look decide el tipo
  por la extensión y sigue los symlinks: se le da un **enlace duro** con la
  extensión en `<raíz>/.miniaturas/.tmp/` (mismo disco, cero bytes); al
  arrancar, el servidor borra esa carpeta (un enlace duro olvidado retendría el
  lugar de un archivo borrado).
- Sin shell (`execFile`), **de a 2 a la vez** y en fila (hasta 400 esperando;
  más, 503), **15 s** como máximo cada una (después se mata). Un pedido que la
  persona ya abandonó no se hace al llegarle el turno.
- Si falla (formato raro, Quick Look sin vista, herramienta que no está), 404:
  la pantalla muestra el ícono del tipo. Se anota (`<hash>.jpg.no`) y no se
  reintenta por **24 h**; cada falla deja una línea `[nas-drive] miniatura …`
  en `servidor.log` (sirve para ver si macOS está pidiendo un permiso).
- **Caché** al lado de los datos: `<raíz>/.miniaturas/<ab>/<sha256(clave:tamaño)>.jpg`,
  servida con `Cache-Control: private, max-age=86400` (la edge redondea el
  vencimiento del permiso a tramos de 6 h, así la URL no cambia y el navegador
  la reusa). Pesan ~40 KB cada una: 100 mil archivos vistos ≈ 4 GB por disco.
  Borrar un archivo borra su miniatura.
- **Vaciar la caché** (es seguro: se rehace sola al mirar):
  `rm -rf /Volumes/NAS1/maven-drive/.miniaturas /Volumes/NAS2/maven-drive/.miniaturas`
- Las herramientas se pueden cambiar con `SIPS=` y `QLMANAGE=` en el `.env`
  (por defecto `/usr/bin/sips` y `/usr/bin/qlmanage`; los tests usan unas falsas).

Probado el 02/10 en este Mac: `sips` con HEIC sin extensión y Quick Look con un
PDF por enlace duro (el test «DE VERDAD» de `test.mjs` corre solo en macOS).

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
