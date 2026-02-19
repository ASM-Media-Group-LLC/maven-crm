

## Convertir el modal de Onboarding en formulario inline

### Resumen

Reemplazar el Dialog/modal actual por un formulario que se renderiza directamente en la pagina, debajo de las KPIs. Al hacer clic en "Iniciar Onboarding", se oculta la tabla y se muestra el wizard en su lugar dentro de un Card. Un boton "Cancelar" permite volver a la vista de tabla.

### Cambios

**Archivo 1: `src/pages/creadores/onboarding/StartOnboardingModal.tsx`**

Refactorizar para eliminar el Dialog wrapper y convertirlo en un componente inline:

- Eliminar imports de Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
- Cambiar la prop `onClose` por `onCancel` (misma funcion)
- Eliminar la prop `open` (ya no es necesaria, el padre controla la visibilidad)
- Envolver todo el contenido en un `Card` con bordes suaves
- Mover el header (titulo + descripcion) a un `CardHeader`
- El stepper y contenido van en `CardContent`
- Los botones van en `CardFooter` con un boton "Cancelar" adicional (icono ArrowLeft + texto "Volver a la lista")
- El footer incluye: a la izquierda "Volver a la lista" y "Guardar Borrador", a la derecha "Anterior"/"Siguiente"/"Finalizar"
- Renombrar el archivo/componente a `OnboardingWizard` para reflejar que ya no es un modal

**Archivo 2: `src/pages/creadores/onboarding/OnboardingContent.tsx`**

- Cambiar el estado `showModal` a `showWizard`
- Cuando `showWizard` es true: ocultar tabs, filtros y tabla/grid; mostrar el componente wizard inline
- Cuando `showWizard` es false: mostrar la vista normal (tabs, filtros, tabla)
- Las KPIs se mantienen siempre visibles
- Al completar o cancelar el wizard, se vuelve a `showWizard = false`
- Actualizar imports (reemplazar StartOnboardingModal por OnboardingWizard)

### Seccion tecnica

**`StartOnboardingModal.tsx` -> renombrar logicamente a OnboardingWizard:**

```text
Antes:
  <Dialog> -> <DialogContent> -> <DialogHeader> -> stepper -> content -> footer

Despues:
  <Card> -> <CardHeader> -> stepper (dentro de CardContent) -> content -> <CardFooter>
```

Estructura del Card:
- `Card` con clase `rounded-lg border`
- `CardHeader`: titulo "Iniciar Onboarding" + descripcion + boton "Volver a la lista" alineado a la derecha
- `CardContent`: stepper + progress bar + contenido del paso actual
- `CardFooter`: botones de navegacion con `border-t`

**`OnboardingContent.tsx` - logica condicional:**

```text
{showWizard ? (
  <OnboardingWizard onCancel={() => setShowWizard(false)} />
) : (
  <>
    {/* Area Tabs */}
    {/* Filters */}
    {/* Table/Grid */}
  </>
)}
```

La funcion `resetAndClose` del wizard llamara a `onCancel()` que pone `showWizard = false`.
