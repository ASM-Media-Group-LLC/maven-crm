# mail-sync

El **único** proceso que habla IMAP con el proveedor de correo. Mantiene una
conexión tranquila por casilla (IDLE sobre INBOX = el servidor EMPUJA cuando
llega correo), baja lo nuevo, lo sanea con la misma lista blanca que las edge
functions y lo deja en Postgres (`mail_messages`). La interfaz de Maven lee
de la base — instantánea siempre — y se entera de lo nuevo por Supabase
Realtime.

Nació el 21/08/2026 después de que el patrón "una sesión IMAP por clic"
colgara la cuenta varias veces en un día (el proveedor raciona conexiones
concurrentes y castiga el comportamiento acumulado).

## Correr

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MAIL_CRED_KEY=... npm start
```

| Env | Default | Qué es |
|---|---|---|
| `SUPABASE_URL` | — | proyecto de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | — | escribe mail_messages (RLS no aplica) |
| `MAIL_CRED_KEY` | — | la MISMA clave AES que usan las edge functions |
| `SWEEP_INBOX_MS` | 60000 | cadencia de las carpetas calientes (`SWEEP_INTERVAL_MS` sigue valiendo como alias) |
| `SWEEP_FULL_MS` | 300000 | barrido de TODAS las carpetas. En prod está en **1800000** (30 min) desde el 10/09: 58 casillas × todas sus carpetas cada 5 min era lo que Zoho castigaba |
| `RECONCILIAR_MS` | 900000 | piso para abrir una carpeta aunque el STATUS diga que nada cambió (red de seguridad de banderas y conteos) |
| `LATIDO_MS` | 300000 | como mucho cada tanto escribe `mail_credentials.last_sync_at`: responde "¿está vivo el worker para esta casilla?" |
| `PER_FOLDER_INIT` | 50 | mensajes iniciales por carpeta |
| `HEREDAR_DEL_HILO` | 1 | una respuesta NUEVA en Recibidos a una charla etiquetada hereda sus etiquetas; si la charla ya estaba fuera de Recibidos, se archiva con ella (`hilos.mjs`). `0` lo apaga. Nunca en la primera carga ni con respuestas de más de 7 días |
| `HOT_FOLDERS` | INBOX,Notification,Newsletter | carpetas revisadas con la cadencia de `SWEEP_INBOX_MS` en vez de esperar el barrido completo. ⚠️ **Tienen que estar las tres**: las reglas de Zoho sacan del INBOX lo más urgente (códigos de GitHub y resets en `Notification`, códigos de Facebook en `Newsletter`). Con solo `INBOX` (10/09 → 16/09) esas dos carpetas entregaban con hasta **30 min** de atraso. No es caro: `revisarCarpeta` filtra con un STATUS y solo abre si algo cambió |
| `STARTUP_STAGGER_MS` | 6000 | espaciado entre logins al arrancar — los logins en ráfaga (cada deploy) son lo que el proveedor castiga |
| `PORT` | 4610 | `/health` |

## Cómo decide abrir una carpeta

Antes de abrir una carpeta (SELECT + FETCH de las banderas de los últimos 50:
lo caro) le pregunta al servidor con un `STATUS (MESSAGES UIDNEXT UIDVALIDITY
UNSEEN)`, un solo comando liviano. Si esos cuatro números son los mismos que la
última vez y no pasaron `RECONCILIAR_MS`, la carpeta se salta. Llegó correo →
sube UIDNEXT; alguien leyó → baja UNSEEN; se borró algo → baja MESSAGES:
cualquiera de los tres la abre. Además, en INBOX (que queda en IDLE) el servidor
avisa los cambios de banderas con un FETCH suelto y el worker la revisa al
instante, igual que con el EXISTS del correo nuevo. `/health` cuenta
`carpetas_abiertas` y `carpetas_saltadas` por casilla; la decisión pura vive en
`barrido.mjs` y tiene tests.

## Dokploy

Servicio tipo Application, repo este, build path `infra/mail-sync`,
Dockerfile. Env: las tres obligatorias. Healthcheck: `GET /health`.

## Tests

`npm test` — los casos de `barrido.mjs` (STATUS: abrir o saltar) y los 19 del saneador (espejo de
`supabase/functions/_shared/html-sanitize.test.ts`; las dos copias se
mantienen en sincronía a mano).

## Qué NO hace (todavía)

- No baja adjuntos (solo metadatos) — igual que el cliente en vivo.
- No borra de la caché lo que se borra en el buzón (v1: la caché solo crece;
  el volumen es chico y borrar datos es decisión humana).
- Marca de leído: la escribe el usuario en la base al abrir (optimista) y la
  acción `mark_seen` de `mail-fetch` la lleva al proveedor; este worker
  además reconcilia banderas en cada barrido.
