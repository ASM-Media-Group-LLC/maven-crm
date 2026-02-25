

## Plan: Corregir layout, Selects y DatePickers en Onboarding y Offboarding

### Problemas identificados

1. **Layout roto**: El contenedor raíz usa `h-full` pero necesita `h-screen overflow-hidden` para que el patrón header fijo + contenido scrolleable funcione correctamente (el `h-full` no tiene un padre con altura definida).

2. **DatePicker abre hacia arriba**: El `DateInput` no especifica `side="bottom"` en su `PopoverContent`, y Radix elige `top` automáticamente. En el session replay se confirma: `data-side="top"` con `transform: translate(657px, -14px)`.

3. **Fecha de Inicio y Mentor desalineados**: El botón-trigger de `DateInput` no tiene `w-full`, así que no ocupa el ancho completo de su columna del grid, mientras que el `SelectTrigger` del Mentor sí lo hace.

4. **Selects con contenido truncado**: El `SelectContent` tiene en su viewport `max-w-[var(--radix-select-trigger-width)]`, lo que trunca los nombres largos de empleados. Necesita permitir un ancho mayor cuando el contenido lo requiera.

### Cambios propuestos

| Archivo | Cambio |
|---------|--------|
| `src/components/ui/date-input.tsx` | 1) Agregar `side="bottom"` al `PopoverContent` para forzar apertura hacia abajo. 2) Agregar `className="w-full"` al `Button` trigger para que ocupe todo el ancho disponible. |
| `src/components/ui/select.tsx` | Remover `max-w-[var(--radix-select-trigger-width)]` del viewport del `SelectContent` para que los items largos no se trunquen. |
| `src/pages/hr/HROnboardingNew.tsx` | Cambiar `h-full` → `h-screen overflow-hidden` en el div raíz (línea 221). |
| `src/pages/hr/HROffboardingNew.tsx` | Cambiar `h-full` → `h-screen overflow-hidden` en el div raíz (línea 278). |

### Detalle técnico

**DateInput (`date-input.tsx`)**:
- Línea del `PopoverContent`: agregar `side="bottom"` para que el calendario siempre abra hacia abajo
- Línea del `Button` trigger: agregar la clase `w-full` para que el botón ocupe todo el ancho del contenedor padre, alineándose correctamente con los Selects adyacentes

**Select (`select.tsx`)**:
- En el `SelectPrimitive.Viewport`, cambiar `max-w-[var(--radix-select-trigger-width)]` por `min-w-[var(--radix-select-trigger-width)]` para que el dropdown sea al menos tan ancho como el trigger pero pueda crecer si el contenido lo necesita

**Layout de ambos wizards**:
- El div raíz necesita `h-screen overflow-hidden` en lugar de `h-full` para establecer una altura explícita que permita el scroll interno del contenido

