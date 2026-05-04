# servicios

Carpeta reservada para microservicios externos al frontend y al backend de
Supabase. Hoy está vacía a propósito — el split en `frontend/` (Vite/React)
y `backend/` (Edge Functions + migrations) ya cubre todo lo que la app
necesita para correr.

Cuando portemos piezas como las siguientes, vivirán acá cada una en su
propia subcarpeta:

- `scouter-worker/` — worker tipo cron que dispara Apify, drena
  `scouter_jobs`, score AI, refresh de profiles. Hoy es UI placeholder
  ("Descubrir" botón pendiente) hasta que aterrice este servicio.
- `qa-analyzer/` — pipeline de análisis de calls (transcript → IA →
  scoring → secciones).

Cada microservicio aquí debería ser **independiente** del frontend:
contenedor separado, deploy separado en Dokploy, env vars propios. La
única dependencia compartida es Supabase (DB y auth) y, donde aplique,
los providers externos (MiniMax, LiveKit, Apify, Resend).

Convención sugerida cuando vayamos a crear el primero:

```
servicios/<nombre>/
  Dockerfile
  package.json    (independiente del root)
  src/
  README.md
```

Si en el futuro cualquiera de estos servicios necesita compartir tipos
con el frontend (por ejemplo, los DTOs de `scouter_leads`), la opción
limpia es exportarlos desde un paquete compartido en
`servicios/_shared/types` y consumirlo vía workspace — pero eso lo
decidimos cuando aparezca el primer servicio real.
