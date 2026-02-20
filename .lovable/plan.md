
## Problema detectado: Enlace "Asistencia" en el sidebar deshabilitado

### Diagnóstico

El archivo `src/pages/hr/HRAttendance.tsx` existe (666 líneas) y la ruta `/hr/asistencia` está registrada correctamente en `App.tsx` (línea 135). El problema es que en `src/components/dashboard/DashboardSidebar.tsx`, línea 70, el ítem "Asistencia" tiene `url: null`:

```ts
// Línea 70 — ACTUAL (bloqueado)
{ title: "Asistencia", url: null },

// Línea 70 — CORRECTO (activado)
{ title: "Asistencia", url: "/hr/asistencia" },
```

Esto hace que el enlace se renderice sin navegación (aparece opaco, no clickeable). La página existe y funciona — solo falta activar el enlace.

### Cambio a realizar

| Archivo | Línea | Cambio |
|---|---|---|
| `src/components/dashboard/DashboardSidebar.tsx` | 70 | `url: null` → `url: "/hr/asistencia"` |

Un solo carácter de cambio activa el acceso completo al módulo.
