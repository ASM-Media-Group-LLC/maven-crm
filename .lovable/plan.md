
## Agregar Notificaciones de Toast para Acciones de Cancelación

### Problema Identificado
Los modales `ViewLeadModal.tsx` y `ConvertLeadModal.tsx` tienen notificaciones de éxito y error para operaciones de base de datos, pero faltan las notificaciones de cancelación cuando el usuario cierra los formularios o los modales sin guardar cambios.

### Solución

#### 1. En `ViewLeadModal.tsx` - Agregar toast al cancelar la nota
Modificar la función `handleCancelNote()` (línea 113-116) para agregar un toast de cancelación antes de limpiar el estado.

**Cambio:**
```tsx
const handleCancelNote = () => {
  setNoteText("");
  setShowNoteForm(false);
  toast({ title: "Edición cancelada" });
};
```

#### 2. En `ConvertLeadModal.tsx` - Agregar toast al cancelar la conversión
Crear un handler personalizado para el botón "Cancelar" que agregue un toast antes de cerrar el modal.

**Cambio:**
```tsx
const handleCancel = () => {
  toast({ title: "Conversión cancelada" });
  onOpenChange(false);
};
```

Luego actualizar el botón "Cancelar" (línea 111):
```tsx
<Button 
  variant="outline" 
  onClick={handleCancel}
  disabled={convert.isPending}
>
  Cancelar
</Button>
```

### Patrón Consistente
Todas las acciones de cancelación usarán:
- `{ title: "Edición cancelada" }` para cancelación de formularios
- `{ title: "Conversión cancelada" }` para cancelación de operaciones destructivas
- Sin variante (usa la variante default/neutral)
- Sin description
- Sigue el estándar `useToast` ya implementado en la aplicación

### Archivos a Modificar
- `src/pages/leadgen/ViewLeadModal.tsx` - Agregar toast a `handleCancelNote()`
- `src/pages/leadgen/ConvertLeadModal.tsx` - Crear `handleCancel()` y agregar toast al botón "Cancelar"
