# telegram-gateway

Microservicio que **lee canales de Telegram** vía MTProto (GramJS) para la verificación
automática de promos de **Promolog** en Telegram. Mismo patrón que el **baileys-gateway**:
login por web en `/manager`, sesión persistida en un volumen `/data`, auth `apikey`.
API oficial de Telegram (sin Apify ni scraping de HTML). Leer canales públicos como
usuario es benigno (no es granja de cuentas ni evasión).

## Secretos (env — en Dokploy, NUNCA en repo ni chat)

| Variable | Qué es |
|---|---|
| `TELEGRAM_GW_API_KEY` → `API_KEY` | apikey de las APIs hacia Maven (la inventás; va también en las edge functions) |
| `MANAGER_PASSWORD` | contraseña del login del dashboard `/manager` |
| `TELEGRAM_API_ID` | de https://my.telegram.org (API development tools) |
| `TELEGRAM_API_HASH` | idem |

> La **sesión NO es un secreto/env**: se genera logueándote por web y se guarda en el
> volumen `/data`. No hay que correr scripts locales ni pegar session strings.

## Deploy (Dokploy)

App nueva, Provider = Git → repo `maven-crm`, branch `main`,
**Compose Path = `infra/telegram-gateway/docker-compose.yml`**. Cargá los 4 secretos de
arriba. Dominio: **nip.io o subdominio propio, NO traefik.me** (lección del cloudphone).

## Login (una sola vez, por web)

1. Abrí `https://<dominio>/manager` → entrá con `MANAGER_PASSWORD`.
2. Poné el teléfono de la cuenta → "Enviar código" → escribí el código que te llega por
   Telegram (+ password 2FA si la cuenta tiene). Listo: la sesión queda guardada en el volumen.
3. En el mismo `/manager`, "Probar un canal" → escribís `@canal` y ves los posts de las
   últimas 24h (texto, links, si la media es descargable, permalink).

Recomendado: usar una **cuenta dedicada** (no la personal). Para canales **privados**,
esa cuenta tiene que estar **unida** al canal.

## Endpoints (auth header `apikey: <API_KEY>`)

- `GET /diag` → conecta + `getMe` (¿la sesión sirve?).
- `GET /channel/:handle/recent?hours=24` → posts recientes:
  `{ id, date, text, links[], hasMedia, mediaDownloadable, permalink }` + `protected`.

## DRM / canales protegidos (noforwards)

El **texto + links siempre llegan** (alcanza, porque promo = referencia a su OnlyFans).
La **media puede no poder bajarse** (`mediaDownloadable:false`) → ahí se usa evidencia
texto-only, o se marca "revisar manual" si fuera media sin texto.

## Siguiente (post-spike)

Bajar+guardar media cuando se pueda; clasificar (promo = referencia a OF) por links/CTA
+ Gemini para lo ambiguo; escribir a `promolog_entries` (network='telegram'); UI
`TelegramPostCard` como evidencia; cron de Promolog.
