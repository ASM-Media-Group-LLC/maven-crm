

## Plan: Corregir layout de header/footer fijos en Candidatos, Onboarding y Offboarding

### Problema raíz

Las tres páginas están envueltas por `HRLayout`, que proporciona sidebar + topbar y envuelve los children en un `<div className="flex-1 overflow-auto">`. Las páginas usan `h-screen` (100vh) como contenedor raíz, pero 100vh incluye la altura del topbar y sidebar, por lo que el contenido es más alto que el espacio disponible. Esto hace que el wrapper de HRLayout haga scroll de **toda** la página — incluyendo header y footer — en vez de mantenerlos fijos.

### Solución

Dos cambios coordinados:

1. **`HRLayout.tsx` (línea 11)**: Cambiar `overflow-auto` → `overflow-hidden` en el wrapper de children. Esto evita que el layout padre haga scroll y delega el control de scroll a cada página individual. Las demás páginas HR (Dashboard, Directorio, etc.) ya usan `h-full overflow-hidden` con su propio scroll interno, así que no se ven afectadas.

2. **Las tres páginas**: Cambiar `h-screen` → `h-full` para que su altura sea el 100% del espacio disponible (después del topbar), no el 100% del viewport.

### Cambios

| Archivo | Línea | Cambio |
|---------|-------|--------|
| `src/pages/hr/HRLayout.tsx` | 11 | `overflow-auto` → `overflow-hidden` |
| `src/pages/hr/HROnboardingNew.tsx` | 221 | `h-screen overflow-hidden` → `h-full overflow-hidden` |
| `src/pages/hr/HROffboardingNew.tsx` | 278 | `h-screen overflow-hidden` → `h-full overflow-hidden` |
| `src/pages/hr/HRApplicantNew.tsx` | 75 | `h-full` (ya correcto) — verificar que tenga `overflow-hidden` |

Esto hace que el header (con botón "Volver" y título), el stepper y el footer (con botones Anterior/Siguiente/Cancelar) permanezcan siempre visibles, mientras que solo el área de contenido central hace scroll.

