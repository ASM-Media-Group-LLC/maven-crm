

# Agregar boton "+ Nueva categoria" en cada seccion de lineamientos

## Resumen

Agregar un boton "+ Nueva categoria" alineado a la derecha en el encabezado de cada seccion (Operacion Core, Gestion de Chats, Horarios, etc.) cuando se muestra la vista de categorias. El boton permitira crear un lineamiento con categoria y titulo personalizados.

## Cambios

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx`

1. **Modificar el encabezado de cada categoria** (linea 203-206): Cambiar el `h4` a un `div` con `flex justify-between items-center` que contenga el titulo a la izquierda y un boton "+ Nueva categoria" a la derecha.

```tsx
// Antes
<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
  {cat.category}
</h4>

// Despues
<div className="flex items-center justify-between mb-2">
  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
    {cat.category}
  </h4>
  <Button
    variant="ghost"
    size="sm"
    className="text-xs text-muted-foreground h-auto py-1 px-2"
    onClick={() => openCustomForCategory(cat.category)}
  >
    <Plus className="h-3.5 w-3.5 mr-1" />
    Nueva categoría
  </Button>
</div>
```

2. **Agregar estado y modal para categoria personalizada**: Nuevo estado `customCategory` para saber desde que seccion se abrio. Al hacer clic en "+ Nueva categoria", se abre el modal existente pero con campos de titulo y contenido editables (titulo libre en lugar de uno predefinido).

3. **Agregar nuevo handler `openCustomForCategory`**:

```tsx
const openCustomForCategory = (category: string) => {
  setEditingId(null);
  setForm({ title: "", guideline_type: category, content: "" });
  setCustomCategory(category);
  setModalOpen(true);
};
```

4. **Modificar el modal** para mostrar un campo de titulo editable cuando se abre desde "+ Nueva categoria" (cuando `customCategory` tiene valor):

```tsx
// Agregar campo de titulo en el modal cuando customCategory esta activo
{customCategory && (
  <div className="space-y-1.5">
    <Label>Título</Label>
    <Input
      value={form.title}
      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      placeholder="Nombre del lineamiento..."
    />
  </div>
)}
```

5. **Actualizar `handleSubmit`** para validar que el titulo no este vacio cuando es categoria personalizada.

6. **Actualizar `closeModal`** para limpiar `customCategory`.

7. **Agregar import** de `Plus` de lucide-react (ya importado) y `Input` de componentes UI.

