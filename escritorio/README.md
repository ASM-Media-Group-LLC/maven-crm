# Maven de escritorio (Windows y Mac)

Una app que abre **la misma Maven de producción** (`https://app.maven-ai.me`) en
una ventana propia que **no se duerme en segundo plano**. No reescribe nada: lo
que se sube a la web aparece en la app sin reinstalar.

**Por qué:** el 70 % de las llamadas que se caen se caen con la pestaña de
Chrome escondida. Chrome duerme los relojes y las conexiones de las pestañas
ocultas (y en computadores no muy fuertes, antes y más fuerte). La app:

- Mantiene los relojes y la conexión a ritmo normal aunque la ventana esté
  minimizada o tapada (`backgroundThrottling: false` y los interruptores de
  Chromium que frenan las pestañas ocultas apagados). Probado: minimizada, la
  página sigue «visible» y un reloj de 100 ms dio 50 vueltas en 5 s.
- Mientras haya cámara, micrófono o llamada abiertos, le pide al sistema que no
  suspenda la app. En el Mac además se apaga la «siesta» de apps (App Nap).
- Concede cámara, micrófono, pantalla y avisos **solo** a `app.maven-ai.me`.
- Comparte pantalla con un selector propio (pantallas y ventanas). Cowork sigue
  exigiendo pantalla completa como en Chrome.
- Solo navega dentro de `*.maven-ai.me`; Instagram, WhatsApp, enlaces firmados
  del Drive, etc. se abren en el navegador del sistema.
- Guarda la sesión (no hay que entrar cada vez) y deja un solo ejemplar abierto.
- Si no hay internet al abrir, muestra un aviso y reintenta sola cada 10 s.
- Si se pide salir con una llamada, subida o correo a medio escribir, pregunta.

Seguridad: la página no recibe nada de Node (`contextIsolation`, `sandbox`, sin
`nodeIntegration`). El único puente es el del selector de pantalla, que es una
página local de la app.

## Probarla en tu computador

Requiere Node 22.12 o más nuevo.

```bash
cd escritorio
npm install
npm run iniciar          # abre la app contra producción
npm run revisar          # pruebas de las reglas de navegación y permisos
npm run humo             # prueba de humo: la abre, revisa 9 cosas y se cierra (sin iniciar sesión)
```

Contra un servidor local o de pruebas (solo sin empaquetar):
`MAVEN_URL=http://localhost:8080 npm run iniciar`.

## Armar los instaladores

```bash
npm run instalador:mac   # dist/Maven-<versión>-mac-universal.dmg (Intel y Apple Silicon)
npm run instalador:win   # dist/Maven-<versión>-win-x64.exe (se puede armar desde el Mac)
```

> En un Mac, si la carpeta del repo está en Documentos con iCloud, el firmado
> falla con «resource fork, Finder information, or similar detritus». Arma
> fuera de iCloud: `npx electron-builder --mac -c.directories.output=/tmp/maven-dist`.

También hay un workflow manual en GitHub: **Actions → «Instaladores de
escritorio» → Run workflow**. Arma el `.dmg` y el `.exe` y los deja como
artefactos de la corrida (14 días). Ojo: en un repo privado, cada minuto de Mac
cuenta como 10 de los ~2.000 gratis al mes; una corrida cuesta ~100–150 minutos.

Los íconos salen de la misma M de la web: `python3 escritorio/scripts/genera-iconos.py`.

## Sin firma: qué va a ver la gente

Por ahora los instaladores **no están firmados** (no hay certificados).

**Windows** — SmartScreen muestra «Windows protegió su PC». Hay que tocar
**Más información → Ejecutar de todas formas**. Algunos antivirus pueden
marcarlo la primera vez.

**Mac** — La app va firmada «ad hoc» (sin cuenta de Apple), así que al abrirla
macOS dice que no puede comprobar que no tenga software malicioso.
Pasos: arrastrar Maven a Aplicaciones, intentar abrirla una vez, ir a
**Ajustes del Sistema → Privacidad y seguridad**, bajar y tocar **Abrir de todas
formas**, y confirmar con la contraseña del Mac. (En macOS 15 o más nuevo ya no
sirve clic derecho → Abrir.) Atajo para quien sepa usar la Terminal:
`xattr -dr com.apple.quarantine /Applications/Maven.app`.

Además, la primera vez que compartan pantalla, macOS pide activar Maven en
**Privacidad y seguridad → Grabación de pantalla** y reabrir la app (el selector
lo explica y tiene un botón que abre ese ajuste). Cámara y micrófono los pregunta
macOS solo.

## Firmar (cuando se compren los certificados)

| | Qué comprar | Costo |
|---|---|---|
| Mac | Apple Developer Program (a nombre de la empresa, necesita el D-U-N-S) | USD 99 al año |
| Windows, opción 1 | Azure Trusted Signing (la empresa necesita 3 años de historia verificable) | ~USD 10 al mes |
| Windows, opción 2 | Certificado de firma de código OV (Sectigo, DigiCert, SSL.com…), hoy viene en llave USB o en la nube | ~USD 200–400 al año |

Con firma desaparecen los avisos de arriba y se puede activar la actualización
automática.

**Mac.** En `package.json` → `build.mac`, quitar `"identity": "-"` (así busca el
certificado «Developer ID Application») y agregar `"notarize": true`. En GitHub
→ Settings → Secrets, cargar: `CSC_LINK` (el `.p12` en base64), `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`, y en el workflow
quitar `CSC_IDENTITY_AUTO_DISCOVERY: "false"`. Los permisos del Mac firmado ya
están en `recursos/entitlements.mac.plist`.

**Windows con Azure Trusted Signing.** En `build.win` agregar
`"azureSignOptions": { "publisherName": "...", "endpoint": "https://<región>.codesigning.azure.net", "certificateProfileName": "...", "codeSigningAccountName": "..." }`
y cargar en Secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` y `AZURE_CLIENT_SECRET`.
**Con certificado OV:** `CSC_LINK` + `CSC_KEY_PASSWORD` (o la herramienta del
proveedor si viene en la nube).

## Actualización automática (después de firmar)

La web se actualiza sola; la app solo hace falta actualizarla cuando cambie esta
carpeta (pocas veces). Para que se actualice sola:

1. `npm install electron-updater` en esta carpeta.
2. En `package.json` → `build`, agregar
   `"publish": { "provider": "github", "owner": "ASM-Media-Group-LLC", "repo": "maven-crm" }`
   y que el workflow arme con `--publish always` (usa `GH_TOKEN`; con
   `contents: write` alcanza el token de la corrida).
3. En `src/principal.js`, al arrancar:
   `require('electron-updater').autoUpdater.checkForUpdatesAndNotify()`.
4. Para sacar una versión: subir `version` en `package.json` y correr el workflow.

Ojo: el repo es privado, y la app no puede leer Releases privados sin un token
(que no debe ir dentro de la app). Lo más simple es publicar los instaladores en
un repo público aparte solo para Releases (p. ej. `maven-escritorio-releases`) o
en el propio servidor de Maven (`"provider": "generic"` con una URL).
En el Mac, la actualización automática **solo funciona con la app firmada**.

## Lo que sabemos que cambia frente a Chrome

- **Push con Maven cerrado:** las notificaciones push del navegador (Web Push)
  no existen en Electron. Con la app abierta, aunque esté minimizada, los avisos
  llegan como notificación del sistema; con la app cerrada, no.
- **Notificaciones en el Mac sin firma:** pueden no aparecer hasta firmar la app.
- **Ventanita flotante automática:** como la app nunca queda «oculta», no se
  dispara sola la ventanita que aparecía al cambiar de pestaña en Chrome.
- **Sonido al compartir pantalla:** en Windows hay una casilla (apagada de
  entrada) para sumar el sonido del computador; ojo, los demás también oyen la
  llamada. En el Mac no se puede todavía.
- **Descargas que apuntan afuera** (enlaces firmados del NAS) se abren en el
  navegador del sistema, que es quien descarga.
- Maven no tiene «entrar con Google» hoy. Si algún día se agrega, hay que sumar
  esos dominios en `src/origenes.js`.
