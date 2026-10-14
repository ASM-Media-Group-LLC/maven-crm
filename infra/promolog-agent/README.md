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

## Otras redes en el panel (Plan B local) — Telegram y X
Además de IG, el panel tiene una sección **"Otras redes (Plan B local)"**. Estas
corren donde conviene, pero se disparan desde el mismo panel:
- **Telegram**: los canales **públicos** se leen por `t.me/s/` (sin cuenta). Los
  **privados** (invite) necesitan **loguear la cuenta dedicada** (botón Loguear →
  QR con el teléfono de esa cuenta) **y que esa cuenta sea miembro del canal**
  (ver abajo). El scan solo LEE: unirse es una acción aparte y deliberada.
- **X**: **loguear una cuenta de X** (botón Loguear). Navega los perfiles y lee los
  tweets. ⚠️ Los selectores del DOM de x.com cambian seguido — si no extrae tweets,
  se ajusta `extractTweets()` en `x-scraper.mjs`.

Ambas mandan lo scrapeado a `telegram-scan`/`x-scan` en **modo ingest** → reusan la
MISMA clasificación que las corridas server-side (cron). Los targets salen **en vivo**
de Maven (`mode:targets`): creadora inactiva deja de escanearse, nueva activa entra sola.

Requiere `CRON_INTERNAL_TOKEN` en el `.env` (solo Telegram/X lo usan; IG no).

### Unirse a los canales de Telegram
Un canal privado que la cuenta no tiene **no se puede leer** — el scan lo reporta
como "no revisado" (nunca como "no promocionó"). Para meter la cuenta:

En el panel, en la tarjeta de Telegram:
- **🔎 Revisar canales** — dice en cuáles está y cuáles faltan. **No se une a nada.**
- **🚪 Unirme a los que faltan** — se une **de a 4 por tanda**. Apretalo de nuevo
  para la siguiente. De a poco a propósito: unirse a muchos canales seguidos es lo
  que dispara el `FLOOD_WAIT` de Telegram, y esta cuenta es la única que ve los
  privados. Si Telegram empieza a limitar, corta la corrida sola.

Por terminal, lo mismo con más control:
```bash
node --env-file=.env tg-join.mjs                       # releva, no se une
node --env-file=.env tg-join.mjs --join --max 4        # tanda de 4
node --env-file=.env tg-join.mjs --only moramay        # uno solo
node --env-file=.env tg-join.mjs --all                 # incluye los públicos
```
El estado queda en `sessions/tg-membership.json` (se retoma donde quedó).

Dos casos que **no** se resuelven solos y salen en el informe:
- **Pide aprobación del admin** — mandar la solicitud le aparece a la creadora con
  el nombre y la foto de esta cuenta, así que no pasa de rebote: hay que pedirlo
  con `--pedir-aprobacion`.
- **Link vencido/revocado** — hay que pedirle uno nuevo a la creadora y
  actualizarlo en su ficha de Maven.

## Cómo se reparte la carga
`promolog-scan-targets?slot=a&slots=2` devuelve una partición estable por creadora
(hash del `creator_id`), así todas las cuentas de IG de una misma creadora caen en
el mismo slot y no se pisan entre cuentas. Verificado: slot A ~34 creadoras, slot B
~23, cero solapamiento, 57 cubiertas.

---

## Mudarlo a una Mac Mini (siempre encendida)

El agente pensado para correr en una laptop tiene un problema: cuando la cerrás,
deja de escanear. En una Mac Mini queda como servicio y corre solo.

### 1. Traer el código y los tokens

```bash
git clone https://github.com/ASM-Media-Group-LLC/maven-crm.git
cd maven-crm/infra/promolog-agent
npm install
npx playwright install chromium
```

Copiá el `.env` desde la máquina donde ya funciona (tiene `PROMOLOG_EXT_TOKEN` y
`CRON_INTERNAL_TOKEN`). **No está en el repo a propósito.**

Si vas a correr el agente en **varias** Mac Minis, agregale a cada `.env` un
nombre propio para poder distinguirlas en el latido:

```
AGENT_ID=macmini-1
```

### 2. Las sesiones se hacen EN la Mac Mini, no se copian

`sessions/*.json` son los logins de Instagram, X, Telegram y Facebook.

Se pueden copiar, pero **conviene loguear de nuevo desde la Mac Mini**: las
sesiones traen huellas de IP y navegador, y una sesión de Instagram que aparece
de golpe desde otra IP es exactamente lo que dispara el bloqueo (ya se quemó una
cuenta así). Logueá desde el panel, una red por vez.

### 3. Instalarlo como servicio

Doble clic en **`instalar-servicio.command`**.

Deja el agente como LaunchAgent de macOS: arranca al iniciar sesión y se
**relevanta solo si se cae**. Detecta Tailscale y ata el panel a esa IP.

> ⚠️ **Activá el inicio de sesión automático** en la Mac Mini
> (Ajustes → Usuarios y grupos → Inicio de sesión automático).
> Un LaunchAgent necesita una sesión de usuario iniciada: sin esto, después de un
> corte de luz la máquina arranca, nadie inicia sesión y el agente **no corre**.

Para detenerlo: `launchctl bootout gui/$(id -u)/com.maven.promolog-agent`

### 4. Entrar al panel desde tu laptop (Tailscale)

El panel **no tiene contraseña**: quien lo abre puede lanzar escaneos y abrir
ventanas de login con las cuentas. Por eso escucha en `127.0.0.1` por defecto.

El instalador, si encuentra Tailscale, lo ata a la IP de Tailscale (`100.x.y.z`)
en vez de a `0.0.0.0`. La diferencia importa: por Tailscale llegan solo tus
equipos; con `0.0.0.0` lo alcanza **cualquiera en la red de la oficina**.

Desde tu laptop, con Tailscale conectado: `http://100.x.y.z:4599`

### 5. Programar las corridas

En el panel, por red: switch de **Automático**, intervalo y ventana horaria.
Queda guardado en `sessions/schedules.json` y sobrevive reinicios.

### 6. Confirmar que Maven lo está viendo

El agente le avisa a Maven que sigue vivo cada 5 minutos. Para verificarlo:

```sql
select id, hostname, last_seen_at, detalle from promolog_agents
order by last_seen_at desc;
```

**Si `last_seen_at` se quedó viejo, esa máquina dejó de escanear** — que es
justamente lo que antes pasaba sin que nadie se enterara.

### Cuando algo no anda

| Síntoma | Dónde mirar |
|---|---|
| El panel no abre | `logs/agente.error.log` |
| Arrancó pero no escanea | En el panel, la franja de última corrida por red |
| Maven no lo ve | La tabla `promolog_agents` (paso 6) |
| Una red da 0 siempre | Su sesión: re-logueá esa cuenta desde el panel |
