

# Unificar toasts en NotasTabContent con el patron del sistema

## Situacion actual

- `NotasTabContent.tsx` usa `toast` de **sonner** (`toast.success()`, `toast.error()`)
- `DocumentosTabContent.tsx` usa `toast` de **@/hooks/use-toast** (`toast({ title, description, variant })`)
- El sistema de diseno (FeedbackSection) documenta el patron de `useToast` con variantes `destructive` y default

## Cambio

### Modificar `src/pages/creadores/NotasTabContent.tsx`

- Cambiar el import de `toast` de `"sonner"` a `"@/hooks/use-toast"`
- Reemplazar `toast.success("Nota guardada")` por `toast({ title: "Nota guardada", description: "La nota se ha registrado correctamente." })`
- Reemplazar `toast.error("Error al guardar nota: " + e.message)` por `toast({ title: "Error al guardar nota", description: e.message, variant: "destructive" })`

Esto mantiene consistencia con DocumentosTabContent y el patron documentado en el design system.

