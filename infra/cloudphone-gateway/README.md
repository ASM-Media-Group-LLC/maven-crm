# cloudphone-gateway

Microservicio que permite operar los **cloud phones de Multilogin desde Maven** sin que el
empleado sepa qué herramienta hay de fondo. **Todo el cerebro + infra vive acá** (Dokploy);
Maven tendrá apenas **un tab** que consume este servicio. Mismo patrón que `infra/baileys-gateway`.

> Temporal: Multilogin es el backend de hoy. A futuro se reemplaza por la granja propia
> cambiando solo el "adapter" — el resto (asignaciones, auth, UI de Maven) queda.

## Arquitectura
```
VPS / Dokploy (1 servicio):
  Xvfb (:99) ──> Agente MLX headless ──> launcher local :45001
                                           ▲
  microservicio Node ──(start profile)─────┘
       │
       ├─ adb connect IP:PORT ; adb shell glogin PASSWORD   (control del device)
       ├─ [Slice 2] scrcpy/ADB → WebRTC                      (stream a Maven)
       └─ [Slice 3] asignaciones closer↔celular + auth (JWT Supabase) + auditoría
Maven: 1 tab (closer ve SOLO sus celulares + stream embebido | admin asigna). Cero marca MLX.
```

## Estado: Slice 1 (de-risk) — SCAFFOLD, pendiente de verificación en runtime
El objetivo del Slice 1 es **probar la cadena real en el VPS**: arrancar un cloud phone →
`adb connect` + `glogin` → capturar 1 frame. Endpoints:
- `GET /health` — vivo.
- `GET /diag` — confirma que `adb` y `xcli` están en el PATH y responden.
- `POST /spike/capture` (header `x-spike-token`) — body `{folderId, profileId}` → corre la cadena
  y devuelve 1 frame PNG en base64.

## `[CONFIRMAR]` (se resuelve corriendo el contenedor — ese es el punto del Slice 1)
1. Ruta real de `xcli` / `mlx-launcher` dentro del `.deb` extraído (PATH del Dockerfile).
2. Flags exactos de `xcli login` (token vs email/password; 2FA) — ver `entrypoint.sh`.
3. Nombre/flags del binario del launcher (`mlx-launcher`?).
4. Comando `xcli` para **arrancar un MOBILE profile** y para **obtener el ADB** (IP:PORT + glogin password)
   → `server.js` `startProfile()` / `getAdbInfo()` son tentativos. Descubrir con `xcli --help` dentro del contenedor.
5. Libs exactas que pide el agente (lista de `apt-get` del Dockerfile).

## Deploy (Dokploy)
1. Crear un **servicio nuevo** (tipo Dockerfile) en el proyecto `maven_v3`, apuntando a `infra/cloudphone-gateway/`.
2. Cargar **secretos** (Environment): `MLX_TOKEN` (o `MLX_EMAIL`+`MLX_PASSWORD`) y `SPIKE_TOKEN`. **Nunca** en el repo.
3. Deploy. Revisar logs: que Xvfb arranque, `xcli login` autentique y el launcher quede en :45001.
4. `GET /diag` → confirmar adb + xcli. Luego `docker exec` al contenedor → `xcli --help` para descubrir los comandos del punto 4.
5. `POST /spike/capture` con un `folderId`/`profileId` reales → si vuelve un PNG, **cadena validada** ✅.

## Notas
- Auth por **token del Owner** → los closers NO tienen cuenta Multilogin (marca oculta + sin plan team).
- Arrancar teléfonos **gasta minutos de cloud** → en Slice 5, start/stop on-demand.
- Riesgos a medir: latencia (device→VPS→browser), concurrencia (N streams), CPU del VPS.
