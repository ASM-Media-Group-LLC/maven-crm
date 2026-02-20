

## Fix: Tab bar consistente en Onboarding + Margenes en Nuevo Empleado

### Problema 1 — Tab bar de Onboarding usa estilo diferente

En `OnboardingContent.tsx` (linea 154), la tab activa usa `variant="default"` que renderiza el boton con el gradiente premium (el CTA principal). En el resto de la plataforma (`CreadoresContent`, `ContactosContent`, `HRAbsences`, `HRPermisos`, `AdminUsuarios`, etc.), la tab activa usa `variant="secondary"` que es un fondo sutil sin gradiente.

**Fix**: Cambiar `variant={activeTab === tab ? "default" : "ghost"}` a `variant={activeTab === tab ? "secondary" : "ghost"}` para que coincida con el patron estandar.

### Problema 2 — EmployeeNew: contenido y footer con max-w restringido

El area de contenido (linea 186) tiene `max-w-3xl mx-auto` que centra el formulario en un ancho reducido. El footer (linea 452) tambien tiene `max-w-3xl mx-auto`. Esto rompe la alineacion con los margenes laterales `px-6` del header y stepper.

**Fix**: Eliminar `max-w-3xl mx-auto` tanto del contenedor del contenido como del footer, para que ambos respeten el mismo `px-6` que el resto del layout.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | Linea 154: cambiar `"default"` a `"secondary"` en la variante del tab activo |
| `src/pages/hr/EmployeeNew.tsx` | Linea 186: eliminar `max-w-3xl mx-auto` del contenedor del contenido; linea 452: eliminar `max-w-3xl mx-auto` del contenedor del footer |

