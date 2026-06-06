# cloudphone-gateway

Microservicio que permite operar los **cloud phones de Multilogin desde Maven** sin que el
empleado sepa qué herramienta hay de fondo. **Todo el cerebro + infra vive acá** (Dokploy);
Maven tiene apenas **un tab** que consume este servicio. Mismo patrón que `infra/baileys-gateway`.

> Temporal: Multilogin es el backend de hoy. A futuro se reemplaza por la granja propia
> cambiando solo este micro (el "adapter") — el resto (asignaciones, auth, UI de Maven) queda.

## Cómo funciona de verdad (hallazgos del de-risk)
- Los cloud phones de Multilogin **son GeeLark por debajo**. Se manejan 100% por la **cloud API**
  `api.multilogin.com/mobile_profiles/phone/*` (body `{ids:[...]}`, `Authorization: Bearer <token>`).
- `POST .../phone/start` devuelve una **URL web del teléfono** (`https://phone.geelark.com/...&token=`)
  que es **iframe-embebible** → Maven la mete en un `<iframe>`. **No** hace falta ADB/scrcpy/WebRTC,
  **ni** el agente MLX (que encima hijackeaba `api.multilogin.com`).
- **El bloqueo nunca fue el agente: era un TOKEN VENCIDO.** Con token malo, `GET .../phone/list`
  responde `401 "Wrong JWT token"`, pero el mismo token malo en un POST responde
  `501 "Unsupported method (POST)"` (un espejismo que nos mandó a perseguir un fantasma).

## Auth (auto-gestionado)
El micro maneja su propio token para no romperse por vencimiento:
1. `POST /user/signin` `{email, password: md5(password)}` → `data.token` (regular, ~30 min).
2. `GET /workspace/automation_token?expiration_period=8760h` → `data.token` (largo, ~1 año).
3. Cachea en memoria; si una llamada da `401/403/501`, **re-mintea una vez y reintenta**.

Configurás **una** de estas dos formas (ver `.env.example`):
- **Recomendado:** `MLX_EMAIL` + `MLX_PASSWORD` (cuenta dueña). Cero mantenimiento.
- **Manual:** `MLX_TOKEN` con un automation token 8760h (lo renovás vos ~1×/año).

## Endpoints (los consume Maven; todos menos `/health` piden header `x-spike-token`)
- `GET  /health` — vivo + modo de auth (no filtra secretos).
- `GET  /diag` — hace un GET real a la cloud API y devuelve el status (`200` = todo OK). Para verificar.
- `GET  /folders` — folders mobile (asignación **folder-por-closer**).
- `GET  /phones?page=1&page_size=50` — lista de teléfonos.
- `POST /phones/status` `{ids}` — estado.
- `POST /phones/:id/start` → `{ ok, url }` (URL geelark para el `<iframe>`).
- `POST /phones/:id/stop` — apaga (¡gasta minutos de cloud!).
- `POST /phones/adb-info` `{ids}` — info ADB (alternativa; no se usa para el iframe).

## Deploy (Dokploy)
1. Servicio tipo **Dockerfile** en `maven_v3`, apuntando a `infra/cloudphone-gateway/`. Imagen
   `node:20-slim` (sin agente). Autodeploy ON + watch path `infra/cloudphone-gateway/**`.
2. Cargar **secretos** (Environment): `MLX_EMAIL`+`MLX_PASSWORD` (o `MLX_TOKEN`) y `SPIKE_TOKEN`.
   **Nunca** en el repo. Ojo: en Dokploy, cambiar env **requiere redeploy** para inyectarse.
3. Redeploy. Verificar: `GET /diag` con el `x-spike-token` → `{ ok: true, status: 200, phoneCount: N }`.

## Modelo de asignación
- **Folder-por-closer**: un folder mobile de Multilogin por closer; asignar = mover el teléfono a su folder.
- Auth del micro hacia Maven: hoy `SPIKE_TOKEN`. **Slice 3** = JWT de Supabase mapeando closer→folder.

## Notas
- Arrancar teléfonos **gasta minutos de cloud** → start/stop on-demand (cerrar al salir del iframe).
- A medir en Slice 4: latencia del iframe y cuántas sesiones simultáneas aguanta el plan.
