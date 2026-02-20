

## Mejora de la vista "Nuevo Empleado" — Layout profesional con scroll interno

### Cambios a implementar en `src/pages/hr/EmployeeNew.tsx`

#### 1. Layout full-height con scroll interno

Reemplazar el contenedor actual (`p-6 max-w-3xl mx-auto space-y-6`) por la arquitectura estandar de la plataforma:

```text
div.flex.flex-col.h-full
  |-- header (shrink-0, border-b, bg-background, px-6 py-4)
  |     |-- Boton "Volver al Directorio" con ArrowLeft
  |     |-- Titulo "Nuevo Empleado" + subtitulo (sin icono)
  |-- stepper (shrink-0, border-b, bg-background, px-6 py-3)
  |-- contenido (flex-1, overflow-auto, px-6 py-6)
  |     |-- Card del paso actual (max-w-3xl mx-auto)
  |-- footer (shrink-0, border-t, bg-background, px-6 py-4)
  |     |-- Cancelar | Anterior | Siguiente/Crear
```

#### 2. Header estandarizado

- Eliminar el uso de `HRPageHeader` con icono
- Agregar boton de retorno con `ArrowLeft` + "Volver al Directorio" (patron de detalle de registro)
- Titulo `text-xl font-semibold` y subtitulo `text-sm text-muted-foreground`
- Sin caja de icono

#### 3. Stepper fijo

- Mover el stepper a su propia franja `shrink-0` con `border-b` para que no se desplace con el scroll
- Mantener la misma logica visual (circulos numerados, lineas de progreso)

#### 4. Footer fijo

- Mover los botones de navegacion (Cancelar, Anterior, Siguiente/Crear) a un footer fijo con `shrink-0 border-t`
- Alinear: Cancelar a la izquierda, Anterior + Siguiente a la derecha

#### 5. Area de contenido con scroll

- El `Card` de cada paso se renderiza dentro de un contenedor `flex-1 overflow-auto` con padding
- Se aplica `max-w-3xl mx-auto` al contenido interno para mantener el ancho limitado

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/EmployeeNew.tsx` | Reestructurar layout completo: header con back button, stepper fijo, contenido scrollable, footer fijo |

