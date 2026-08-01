# Promolog Agent (Playwright, local)

Lector de historias de IG para Promolog que corre **en tu Mac** con un navegador
real logueado — o sea, sale por **tu IP residencial** (que es lo que evita el ban
que sufren los scrapers desde datacenter). **Reemplaza la extensión de Chrome.**

La clave anti-ban NO es la tecnología, es el **reparto de carga**: cada cuenta
scanner (slot A / slot B) lee **solo su mitad** de las creadoras, así ninguna hace
el volumen completo que la quema. Si IG empieza a limitar una sesión, el agente
**corta y la deja en cooldown** en vez de martillarla (que es lo que la sensibiliza).

El agente SOLO lee. El análisis (IA, dedup por story_pk, guardas de watermark)
sigue viviendo en el server (`promolog-ingest-stories`), igual que con la extensión.

## Requisitos
- Node 18+ y la Mac prendida cuando corre (igual que hoy necesitás el navegador abierto).
- Las 2 cuentas scanner (las que YA siguen a las creadoras).
- El `PROMOLOG_EXT_TOKEN` (el mismo de la extensión) en el `.env`.

## Interfaz gráfica (recomendado — sin terminal) 🖥️
La forma fácil: un panel web local con botones para loguear las cuentas, correr el
scan y ver el progreso creadora por creadora en vivo.

**Doble clic en `abrir-panel.command`** (instala deps la 1ª vez, levanta el server
y abre el navegador en `http://localhost:4599`). O por terminal: `npm run ui`.

En el panel:
- **Cuenta A / Cuenta B**: si dice "sin login", tocá **Loguear** → se abre una ventana
  de IG, logueate (resolvé challenge/2FA si aparece) y tocá **"Ya me logueé"**.
  El estado pasa a verde ("sesión lista").
- **▶︎ Escanear todo** corre las 2 cuentas (cada una su mitad). También podés correr
  **solo A** o **solo B**. El progreso y los resultados aparecen en vivo.
- Si una cuenta cae en **cooldown** (IG la limitó), el panel lo muestra y la saltea
  sola hasta que se recupere.

## Setup por terminal (alternativa a la GUI)
```bash
cd infra/promolog-agent
npm install                 # instala Playwright + Chromium
cp .env.example .env        # y completá PROMOLOG_EXT_TOKEN
node login.mjs a            # abre navegador → logueá la cuenta scanner A → ENTER
node login.mjs b            # idem cuenta B
```
El login guarda la sesión en `sessions/<slot>.json` (no se commitean; ver `.gitignore`).
Si IG caduca una sesión, re-logueá esa cuenta (desde el panel o `node login.mjs <slot>`).

## Correr un scan
```bash
node --env-file=.env index.mjs
```
Corre las 2 cuentas en secuencia, cada una su mitad, postea al ingest. Programalo
con `cron`/`launchd` a los horarios que quieras (ej. 11:00 y 20:00 Bogotá) — o dejá
el cron server-side apagado para IG y disparás esto localmente.

Para depurar o resolver un challenge en vivo: `HEADFUL=1 node --env-file=.env index.mjs`.

## ⚠️ Primer run — a validar/tunear
No pude probar esto de punta a punta desde acá (necesita tu Mac + las cuentas
logueadas). En la primera corrida, mirá el log:
- Si ves `✅ <handle>: N historias` → anda, el shape de `reels_media` es el esperado.
- Si TODO sale `throttled`/`no_ig_id` con la sesión recién logueada y sana → puede
  que IG haya cambiado el endpoint de `reels_media`; corré con `HEADFUL=1`, abrí una
  historia a mano y en la pestaña Network mirá qué endpoint dispara el visor de
  historias. Pasámelo y ajusto `readStories()` en `index.mjs` (es el único punto
  a tocar).
- Si arranca bien y a mitad corta con `⛔ … IG limitó la sesión` → es la guarda
  anti-ban haciendo su trabajo: dejá descansar esa cuenta (queda en cooldown sola).

## Cómo se reparte la carga
`promolog-scan-targets?slot=a&slots=2` devuelve una partición estable por creadora
(hash del `creator_id`), así todas las cuentas de IG de una misma creadora caen en
el mismo slot y no se pisan entre cuentas. Verificado: slot A ~34 creadoras, slot B
~23, cero solapamiento, 57 cubiertas.
