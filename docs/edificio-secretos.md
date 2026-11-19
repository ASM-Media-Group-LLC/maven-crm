# Edificio vivo — secretos, entrada, relojes y base al día

Tren de agencias, **vagón 1** (19/11/2026). El edificio es el proyecto de Supabase
`maven-agencias` (ref **`ezeigddgkaemxpshghmu`**), donde viven los clientes nuevos.
**Kash (`lsagslbkliprespbyhts`) no se toca bajo ninguna situación**: todo lo de este
documento corre solo contra el edificio y cada workflow lo comprueba antes de hacer
nada (`infra/casas/guarda-kash.sh` → `solo_edificio`).

## Orden para prender el edificio

1. **Fundir el PR** del vagón (los workflows a mano solo aparecen cuando están en `main`).
2. **Agregar en GitHub los secrets `EDIFICIO_*`** de la tabla de abajo (Settings → Secrets
   and variables → Actions). Solo Alvaro tiene los valores.
3. Correr **«Edificio · base al día»** con `aplicar` = sí (primero hace el ensayo; si una
   migración falla en el ensayo, no aplica nada).
4. Correr **«Edificio · secretos»** (genera los internos del edificio, copia los compartidos
   y llena la bóveda que usan los relojes).
5. Correr **«Edificio · funciones»** (publica las 47 funciones de
   `infra/casas/funciones-edificio.txt`).
6. Correr **«Edificio · entrada (auth)»** con `solo_mirar` = no.
7. Agregar el webhook del edificio en LiveKit (ver «Riesgos»).

Con `gh`: `gh workflow run edificio-al-dia.yml -f aplicar=true`, `gh workflow run edificio-secretos.yml`,
`gh workflow run edificio-funciones.yml`, `gh workflow run edificio-auth.yml -f solo_mirar=false`.

## 1. Secretos de las funciones

Salen de leer cada `Deno.env.get(...)` de las funciones de la lista del edificio y de los
archivos de `_shared/` que importan (19/11). Los valores no se pueden leer desde aquí
(Supabase solo muestra un resumen); por eso los que se comparten con Kash los pone Alvaro.

### 1.a Los pone Supabase solo (no se hace nada)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
(y `SUPABASE_PUBLISHABLE_KEY` donde exista). Cada proyecto tiene los suyos: el edificio
nunca recibe los de Kash.

### 1.b Internos del edificio — DISTINTOS a los de Kash, los genera el workflow

| Secreto | Para qué | Bóveda (vault) |
|---|---|---|
| `CRON_INTERNAL_TOKEN` (+ `INTERNAL_CRON_TOKEN`, `CRON_SECRET`, mismo valor) | Los relojes y los disparadores despiertan funciones con `X-Cron-Token` | `cron_internal_token` (mismo valor) |
| `RECORDINGS_CRON_TOKEN` | Cierre y vencimiento de grabaciones | `recordings_cron_token` (mismo valor) |
| `MEET_LINK_SECRET` | Firma de los links de invitado de Meet | — |
| `MEET_GUEST_IP_SALT` | Sal para no guardar la IP del invitado | — |

La bóveda además lleva `project_url` (`https://ezeigddgkaemxpshghmu.supabase.co`) y
`supabase_anon_key` (la llave pública del edificio, que el workflow pide a la API).

### 1.c Configuración fija (la pone el workflow)

| Secreto | Valor |
|---|---|
| `APP_URL` | `https://app.maven-ai.me` |
| `NOTIFICATION_FROM_EMAIL` | `noreply@envios.maven-ai.me` (decisión del 19/11: los correos los manda Maven por Resend) |

### 1.d Compartidos con Kash — MISMO valor que Kash

| Secreto | De dónde sale | Estado |
|---|---|---|
| `LIVEKIT_API_KEY` | GitHub `LIVEKIT_API_KEY_NUEVA` (ya existe) | lo pone el workflow |
| `LIVEKIT_API_SECRET` | GitHub `LIVEKIT_API_SECRET_NUEVA` (ya existe) | lo pone el workflow |
| `ONLYOFFICE_JWT_SECRET` | GitHub `ONLYOFFICE_JWT_SECRET_NUEVO` (ya existe) | lo pone el workflow |
| `LIVEKIT_URL` | **GitHub `EDIFICIO_LIVEKIT_URL`** (la `wss://` del VPS de llamadas) | falta, Alvaro |
| `RESEND_API_KEY` | **`EDIFICIO_RESEND_API_KEY`** (la Resend Pro de Alvaro, dominio envios.maven-ai.me) | falta, Alvaro |
| `GEMINI_API_KEY` | **`EDIFICIO_GEMINI_API_KEY`** (Argos, cámara, Clari) | falta, Alvaro |
| `ELEVENLABS_API_KEY` | **`EDIFICIO_ELEVENLABS_API_KEY`** (voz de avisos) | falta, Alvaro |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | **`EDIFICIO_VAPID_*`** — tienen que ser los MISMOS de Kash: la app es una sola (app.maven-ai.me) y las suscripciones de push se hacen con esa llave pública | falta, Alvaro |
| `ONLYOFFICE_URL` | **`EDIFICIO_ONLYOFFICE_URL`** (hoy el editor vive en 195.26.254.111) | falta, Alvaro |
| `GOTENBERG_URL`, `GOTENBERG_USER`, `GOTENBERG_PASS` | **`EDIFICIO_GOTENBERG_*`** (también van a la bóveda: `gotenberg_url/user/pass`) | falta, Alvaro |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **`EDIFICIO_R2_*`** | falta, Alvaro |
| `R2_BUCKET_OFICINA`, `R2_BUCKET_CONVERTIDOS`, `R2_BUCKET_GRABACIONES` | **`EDIFICIO_R2_BUCKET_*`** — decisión: mismos baldes que Kash (carpetas por base) o baldes nuevos para clientes | decisión de Alvaro |
| `RECORDINGS_BASE_URL`, `RECORDINGS_SIGNING_SECRET` | **`EDIFICIO_RECORDINGS_*`** (servidor de grabaciones rec.asmtech.ai, firma compartida) | falta, Alvaro |
| `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` | `EDIFICIO_*` — opcionales (respaldos de IA; OpenRouter y Anthropic están muertas en Kash) | opcional |

Opcionales con valor por defecto en el código (solo si en Kash se cambiaron):
`ARGOS_GEMINI_MODEL`, `ARGOS_GEMINI_CHICA`, `ARGOS_CARA_MODEL`, `ARGOS_ANTHROPIC_MODEL`,
`ARGOS_CONCURRENCIA`, `ARGOS_ESPACIO_MS`, `ARGOS_REJUZGAR_MIN`, `ARGOS_TOPE`,
`MONITOR_GEMINI_MODEL`, `MONITOR_LLM_MODEL`, `CLARI_HELP_MODEL`, `CLARI_HELP_MODEL_GEMINI`,
`CLARI_HELP_PROVIDER`, `GROQ_BASE_URL`, `IA_MODELO_OPENROUTER`, `APORTE_NAS_*`, `ARGOS_NAS_*`.

### 1.e Propios del edificio que Alvaro saca del panel del edificio

| Secreto | De dónde |
|---|---|
| `MAVEN_JWT_SECRET` | **El JWT secret del EDIFICIO** (Supabase → maven-agencias → Settings → JWT). Lo usa `public-api` para la «sesión como la persona». NUNCA el de Kash. GitHub: `EDIFICIO_MAVEN_JWT_SECRET` |

### 1.f Del NAS — decisión de Alvaro, no se ponen todavía

`DRIVE_NAS_URL`, `DRIVE_SECRETO` (y `DRIVE_NAS_AVISO_EMAIL`, `DRIVE_NAS_AVISO_FROM`). El NAS es
el de Kash: conectarlo al edificio guarda archivos de clientes en el mismo disco. Sin
ellos, Drive, Oficina sobre el NAS, «Argos al NAS» y «grabaciones al Drive» quedan
apagados en el edificio (las funciones fallan sin tocar nada) y sus relojes nacen apagados.

### 1.g Que NO van en el edificio (integraciones de Kash)

`ZOHO_*` (casillas de correo de Kash: sin ellos, crear una cuenta no crea casilla Zoho),
`MAIL_CRED_KEY`, `MAIL_TEAM_DOMAIN`, `WHATSAPP_EVOLUTION_URL`, `TELEGRAM_GW_URL`, `BOT_LIDS`,
`NOTIFICATION_ALLOWED_DOMAINS` (vacío = solo correos de la propia agencia).

### Comando a mano (si no se usa el workflow)

```bash
# NUNCA con --project-ref lsagslbkliprespbyhts (Kash).
supabase secrets set --project-ref ezeigddgkaemxpshghmu \
  APP_URL=https://app.maven-ai.me \
  NOTIFICATION_FROM_EMAIL=noreply@envios.maven-ai.me \
  CRON_INTERNAL_TOKEN=<nuevo> INTERNAL_CRON_TOKEN=<el mismo> CRON_SECRET=<el mismo> \
  RECORDINGS_CRON_TOKEN=<nuevo> MEET_LINK_SECRET=<nuevo> MEET_GUEST_IP_SALT=<nuevo> \
  LIVEKIT_URL=<wss://...> LIVEKIT_API_KEY=<...> LIVEKIT_API_SECRET=<...> \
  RESEND_API_KEY=<...> GEMINI_API_KEY=<...> ELEVENLABS_API_KEY=<...> \
  VAPID_PUBLIC_KEY=<los de Kash> VAPID_PRIVATE_KEY=<...> VAPID_SUBJECT=<...> \
  ONLYOFFICE_URL=<...> ONLYOFFICE_JWT_SECRET=<...> \
  GOTENBERG_URL=<...> GOTENBERG_USER=<...> GOTENBERG_PASS=<...> \
  R2_ACCOUNT_ID=<...> R2_ACCESS_KEY_ID=<...> R2_SECRET_ACCESS_KEY=<...> \
  R2_BUCKET_OFICINA=<...> R2_BUCKET_CONVERTIDOS=<...> R2_BUCKET_GRABACIONES=<...> \
  RECORDINGS_BASE_URL=<...> RECORDINGS_SIGNING_SECRET=<...> \
  MAVEN_JWT_SECRET=<JWT secret del edificio>
```

Y la bóveda (en el editor SQL **del edificio**):
`select vault.create_secret('<valor>', 'cron_internal_token');` — igual para
`recordings_cron_token`, `project_url`, `supabase_anon_key` y `gotenberg_url/user/pass`.

## 2. Funciones del edificio

Lista en `infra/casas/funciones-edificio.txt` (47): cuentas (admin-user-actions,
manage-user-roles, forgot-password), llamadas (livekit-*, cowork-session, meet-room,
meet-guest, send-call-invitation, recordings, prueba-de-red), Argos y monitoreo (argos-*,
monitor-vision, equipo-vigilante, detectar-tardanzas), avisos (send-notification-email,
notification-automations, web-push, push-entregado, anuncio-tts, ticket-notify,
send-report, dispatch-reports), API (public-api, manage-api-keys, messenger-webhooks),
Oficina y Drive (oficina-doc, document-convert, drive, drive-aporte, drive-aporte-nas,
argos-al-nas, salud-nas-ping, grabaciones-al-drive), salud y asistentes (limpieza-storage,
storage-retencion, salud-diagnostico, salud-vigilante, conexiones-ping, centro-operaciones,
clari-help, ai-orchestrator).

Fuera (de Kash): blu-mp, chatter-*, closers-*, promolog-*, scouter-*, scrape-*, qa-*,
whatsapp-*, wa-*, tg-*, telegram-*, zoho-provision, mail-connect/fetch/despertador,
role-email-groups, buzones-por-borrar, creator-*, creators-avatar-sync, creadora-accesos,
portal-*, parrilla-*, cloudphone, ai-sales-chat, fb-scan, x-scan, profile-analyses-poll,
demo-request, dominio-legacy-hit, correo-prueba-tardanza.

## 3. Entrada (Supabase Auth del edificio)

Lo aplica «Edificio · entrada (auth)» por la API de administración:

- **Site URL**: `https://app.maven-ai.me`
- **Redirect URLs**: `https://app.maven-ai.me/**`, `https://app.maven-ai.me/reset-password`,
  `http://localhost:8080/**` (vista local).
- **Registro abierto: apagado** (`disable_signup`). Las cuentas las crean el dueño y los
  admins (admin-user-actions, con la llave de servicio); el frontend no usa `signUp` ni
  OAuth (revisado el 19/11).
- **Correo**: SMTP de Resend (`smtp.resend.com:465`, usuario `resend`, clave = la de Resend),
  remitente `noreply@envios.maven-ai.me`, nombre «Maven». Solo si existe
  `EDIFICIO_RESEND_API_KEY`.
- **Plantillas en español**: recuperar contraseña, invitación, enlace mágico, cambio de
  correo y confirmación. La de «Crear mi contraseña» propia de Maven (token de 7 días) es
  del vagón 3; los correos de cuentas nuevas y de olvidé mi contraseña ya los mandan las
  funciones por Resend, no Supabase.

## 4. Relojes (pg_cron) del edificio

Kash tiene 98 relojes (19/11). El edificio lleva 43 (40 prendidos y 3 del NAS apagados):
los 42 propios del edificio más `vigia-audio-de-llamada` (cada 5 min), que crea la
migración `calidad_de_llamadas`. **Ojo:** ese reloj está en el archivo del repo pero Kash
no lo tiene programado: allá se aplicó otra versión o se quitó a mano.
Los 42 propios viven en
`infra/casas/edificio-migraciones/20261119230000_edificio_crons.sql` (fuera de
`supabase/migrations` a propósito: nunca se aplica a Kash). Los que llaman funciones usan
`public.edificio_llamar()`, que lee dirección y token de la bóveda: no hay ninguna
dirección ni llave escrita.

- **Funciones**: argos-mirar, argos-vigia, argos-escalar-persona, detectar-tardanzas,
  equipo-vigilante, salud-vigilante, dispatch-reports-hourly, equipo-webhooks-tick,
  argos-clips-purga, monitor_limpiar_capturas, monitor-capturas-limpieza,
  storage-retencion-diaria.
- **SQL**: argos-casos-7am/9am/armar, argos-graves, argos-resumen-dia, argos-tendencia-semana,
  argos-uso-apps-limpieza, api-escritura-idem-purga, cerrar-grabaciones-huerfanas,
  chat-programados, drive-intentos-limpieza, expire-meeting-recordings-daily,
  hub-estado-supervisores, llamada-salud-limpieza, pg-net-watchdog, purgar-cuentas-vencidas,
  purgar-entregas-equipo, purgar-entregas-webhooks, purgar-historial-cron,
  purge_old_ai_conversations, rescatar-huerfanos, vigia-cortes-de-llamada,
  vigia-fuera-de-cowork, vigia-marcas-de-turno, vigia-subidas-trabadas,
  vigia-supervisores-hub, vigia-tiempo-sin-pantalla.
- **Apagados (NAS)**: argos-al-nas, drive-aporte-nas, grabaciones-al-drive.
- **No van** (Kash): alvaro-pulse, argos-tope-vuelve-* (de una sola vez), borrar-buzones-vencidos,
  chatter-*, cleanup-of-gross-earnings-daily, cleanup-old-scouter-jobs-monthly,
  closer-contact-alerts, closers-analyze-screenshot, costos-foto-del-mes, creators-avatar-sync-daily,
  fb-scan-*, mail-despertador, mail-programados, messenger-webhooks-tick (apagado en Kash),
  parrilla-weekly, profile-analyses-poll-stuck-jobs, promolog-*, qa-analysis-retry,
  reporte-baja-actividad-grace, retry-pending-qa-report-emails, role-email-groups-sync,
  scouter-*, sync-models-recent, telegram-scan-*, vigilar-saldo-ia (lo vigila Kash),
  wa-*, whatsapp-*, x-scan-*.

## 5. Base al día (diferencias con Kash)

- El molde se sacó de Kash el **16/11 a las 02:16 UTC** (commit `33dfa8099`). El edificio
  tiene 3 versiones (`20261116000000..02`): 391 tablas, 857 funciones, 657 políticas en
  `public`, 23 baldes, 0 usuarios, 0 relojes, bóveda vacía, sin funciones edge.
- Kash, el 19/11: 455 tablas, 968 funciones, 696 políticas, 98 relojes. La diferencia de
  tablas incluye los respaldos de Kash que el molde no copia a propósito.
- Kash recibió **55 migraciones** después del molde. En el repo están como **49 archivos**
  de `supabase/migrations` (varias se juntaron en un archivo: `posiciones_mandan` = 3,
  `turno_marcar_entrada` ya trae la `pausa_generada`). Solo una de Kash no está en el repo:
  `cowork_app_obligatoria` (tabla con 3 probadores de Kash), reemplazada después por
  columnas de `monitor_config`; ningún código la usa → **no va al edificio**.
- `infra/casas/al-dia.sh` las prepara saneadas: dirección de Kash → la del edificio;
  código de la agencia Kash → uuid nulo (los «solo si es Kash» no hacen nada); uuids de
  personas de Kash → uuid nulo; `grupo.kashagency.me` → `.invalid`; versiones repetidas
  renumeradas (+1 s); y al final borra los respaldos que esas migraciones crean
  (`cowork_libres_respaldo_20261116`, `posiciones_respaldo`). Dos archivos van con
  reemplazo escrito a mano (`infra/casas/al-dia/reemplazos/`): los anfitriones de Kash
  en todos los Coworks y los probadores de «Cowork solo en la app».
- El ensayo corre en cada push de la rama `claude/edificio-vivo` (Postgres vacío del
  runner, nunca el edificio) y deja la tabla «entra / falla» en el resumen del workflow.
- **Ensayo del 19/11 (run 44583748488): las 51 entran, 0 fallan.** Resultado: 429 tablas
  y 969 funciones en `public` (Kash: 968 + `edificio_llamar`), 43 relojes (40 prendidos).
  Las 26 tablas que Kash tiene de más son respaldos (`*_respaldo_*`, `*_backup_*`) y
  `cowork_app_obligatoria`.

## Riesgos y pendientes

- **Webhook de LiveKit**: el servidor de llamadas manda sus eventos a UNA dirección (la de
  Kash). Para que el edificio sepa cuándo empieza/termina una llamada o una grabación hay
  que agregar `https://ezeigddgkaemxpshghmu.supabase.co/functions/v1/livekit-webhook` en la
  configuración de LiveKit del VPS (LiveKit acepta varias). Mientras tanto, los eventos de
  salas del edificio llegan a Kash, que no las conoce y las ignora.
- **Datos de configuración**: el molde no trae filas. Tablas que en Kash tienen su fila de
  configuración y en el edificio están vacías: `monitor_config` (id 1), `argos_gracia_config`,
  `argos_voz`, `argos_situaciones` (4), `app_flags` (3), `notification_settings` (3),
  `roles_config`/`role_groups`/`role_permissions`, `rol_turnos`, `posiciones_catalogo`.
  Varias funciones esperan la fila `monitor_config` id 1. Sembrarlas (sin uuids de Kash)
  es el primer paso del vagón 3, junto con el alta de cada agencia
  (`sembrar_roles_de_agencia`, `sembrar_cowork_de_agencia`).
- **Misma app, dos bases**: hasta el vagón 2 (la puerta que pregunta el correo y manda a
  Kash o al edificio), app.maven-ai.me solo habla con Kash.
- **NAS y R2 compartidos**: decisión de Alvaro antes de conectar el Drive del edificio.
- Gemini es una sola cuenta para Kash y el edificio: el gasto de Argos del edificio sale
  del mismo saldo hasta el vagón 7 (créditos por cliente).
