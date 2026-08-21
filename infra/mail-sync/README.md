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
| `SWEEP_INTERVAL_MS` | 180000 | barrido de carpetas no-INBOX |
| `PER_FOLDER_INIT` | 50 | mensajes iniciales por carpeta |
| `PORT` | 4610 | `/health` |

## Dokploy

Servicio tipo Application, repo este, build path `infra/mail-sync`,
Dockerfile. Env: las tres obligatorias. Healthcheck: `GET /health`.

## Tests

`npm test` — los 19 casos del saneador (espejo de
`supabase/functions/_shared/html-sanitize.test.ts`; las dos copias se
mantienen en sincronía a mano).

## Qué NO hace (todavía)

- No baja adjuntos (solo metadatos) — igual que el cliente en vivo.
- No borra de la caché lo que se borra en el buzón (v1: la caché solo crece;
  el volumen es chico y borrar datos es decisión humana).
- Marca de leído: la escribe el usuario en la base al abrir (optimista) y la
  acción `mark_seen` de `mail-fetch` la lleva al proveedor; este worker
  además reconcilia banderas en cada barrido.
