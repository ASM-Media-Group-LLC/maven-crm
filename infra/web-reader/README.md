# web-reader (Playwright, Dokploy)

<!-- Migrado a ASM-Media-Group-LLC/maven-crm; auto-deploy por la conexión dkowe5 de la org (2026-10-13). -->


Micro headless que renderiza una URL con JS y devuelve **texto limpio + HTML +
metadata**. Para que los bots de Maven lean páginas que el edge de Supabase no
puede: SPAs, dashboards con JS (ej. `radar.marketingkash.com`), links que pega el
equipo, contenido que aparece después del render.

**Datacenter está bien acá** — este micro NO se usa para Instagram. Las historias
de IG van por IP residencial vía el agente local (`../promolog-agent`), porque IG
banea IPs de datacenter. Este micro es para web abierta, donde no hay ese problema.

## Endpoints
- `GET /health` → `{ ok: true }`
- `POST /read` (header `x-reader-token: <READER_TOKEN>`)
  ```json
  { "url": "https://…", "wait": 1500, "selector": ".tabla", "max_chars": 40000 }
  ```
  → `{ ok, url, final_url, title, text, html, status }`
  - `wait` (ms, opcional): espera extra tras el render.
  - `selector` (opcional): espera a que aparezca ese CSS antes de leer.
  - `max_chars` (opcional): tope de texto devuelto.

## Deploy en Dokploy
1. Nueva app → git `maven-crm/main`, Build Path `/infra/web-reader`, Dockerfile, watch `infra/web-reader/**`, Autodeploy ON (mismo patrón que blu-bridge/hubstaff-bridge).
2. ENV:
   - `READER_TOKEN` = un token aleatorio largo (guardalo; el bot lo usa).
   - `ALLOWED_HOSTS` (opcional) = lista separada por comas de hosts permitidos (vacío = cualquiera). Recomendado limitar (ej. `radar.marketingkash.com`) para que el bot no lo use de proxy abierto.
   - `PORT` = 8080 (o el que exponga Dokploy).
3. Copiá también `READER_TOKEN` y la URL interna del micro a los **secrets de Supabase** (`WEB_READER_URL`, `WEB_READER_TOKEN`) para que la tool `read_webpage` del bot lo llame.

## Tool del bot
`read_webpage(url)` en el catálogo (`_shared/agent-tools/equipo.ts`) llama a este
micro con `WEB_READER_URL`/`WEB_READER_TOKEN`. Si el micro no responde, la tool lo
dice — nunca inventa el contenido.
