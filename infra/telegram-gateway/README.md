# telegram-gateway

Microservicio que **lee canales de Telegram** vía MTProto (GramJS) para la verificación
automática de promos de **Promolog** en Telegram. Equivalente al scraper de IG, pero
usando la **API oficial** de Telegram con una cuenta logueada. Leer canales públicos
como usuario es benigno (no es granja de cuentas ni evasión).

## Qué valida este spike

1. Que con la sesión podemos resolver un canal por `@handle` y leer sus posts recientes.
2. Qué pasa en **canales con DRM** (contenido protegido / `noforwards`): confirmamos que
   el **texto + links llegan** (suficiente, porque promo = referencia a su OnlyFans) y
   medimos si la **media se puede bajar** (`mediaDownloadable` por post).

## Secretos (env — se setean en Dokploy, NUNCA en el repo ni en chat)

| Variable | De dónde sale |
|---|---|
| `TELEGRAM_API_ID` | https://my.telegram.org → API development tools → crear app |
| `TELEGRAM_API_HASH` | idem |
| `TELEGRAM_SESSION` | lo genera `node login.js` (ver abajo) |
| `SPIKE_TOKEN` | secreto compartido con las edge functions de Maven (auth del micro) |

## Paso 1 — generar la sesión (UNA vez, en tu compu)

```bash
cd infra/telegram-gateway
npm install
TELEGRAM_API_ID=123456 TELEGRAM_API_HASH=abc... node login.js
# pide teléfono + código + (2FA si tenés) → imprime el SESSION string
```

Copiá ese string y pegalo como secreto **`TELEGRAM_SESSION`** en Dokploy. **No lo
pegues en el chat ni lo commitees.**

## Paso 2 — deploy en Dokploy

App nueva apuntando a `infra/telegram-gateway` (autodeploy desde `main`). Seteá los 4
secretos de arriba. Puerto interno `8091`. Recomendado: subdominio propio (evitar
traefik.me; ver lección del cloudphone-gateway).

## Endpoints

- `GET /diag` (header `x-spike-token`) → conecta + `getMe`; confirma que la sesión sirve.
- `GET /channel/:handle/recent?hours=24` (header `x-spike-token`) → posts recientes:
  `{ id, date, text, links[], hasMedia, mediaDownloadable, permalink }` + `protected`.

## Siguiente (post-spike)

- Bajar+guardar la media en Storage cuando se pueda; clasificar (promo = referencia a OF)
  vía links/CTA + Gemini para lo ambiguo; escribir a `promolog_entries` (network='telegram').
- Wire al cron de Promolog + UI (TelegramPostCard como evidencia).
