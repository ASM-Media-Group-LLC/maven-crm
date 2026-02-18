

## Edicion Inline Completa del Roadmap

### Descripcion

Hacer que todos los campos del roadmap sean editables inline: nombre de tarea, submodulo, nombre de categoria y descripcion. Actualmente solo se pueden editar el estado, checkbox y fecha de delivery.

---

### Cambios en `useRoadmap.ts`

Agregar 3 nuevas mutations:

1. **`updateItem`** - Mutation generica para actualizar cualquier campo de un item (`task`, `submodule`, `description`)
2. **`updateCategory`** - Mutation para renombrar una categoria

### Cambios en `RoadmapContent.tsx`

**Nombre de categoria editable:**
- Doble click en el nombre de la categoria abre un Input inline
- Al presionar Enter o blur, se guarda el nuevo nombre
- Estado local `editingCategoryId` controla cual esta en edicion

**Nombre de tarea editable:**
- Doble click en el texto de la tarea lo convierte en un Input
- Enter o blur guarda el cambio
- Estado local `editingItemField` con `{ id, field }` controla la edicion

**Submodule editable:**
- Click en el badge de submodulo o en el "---" abre un Input inline
- Enter o blur guarda. Si queda vacio, se envia `null`

**Descripcion editable:**
- Agregar una fila expandible o un tooltip editable debajo de cada tarea (icono de nota al lado del nombre de la tarea)
- Click abre un Popover con un Textarea para editar la descripcion

**Boton de eliminar categoria:**
- Agregar un boton de eliminar (Trash2) al lado del nombre de cada categoria en el header del Collapsible, visible en hover

---

### Seccion tecnica

**`useRoadmap.ts`** - Agregar:
```
updateItem({ id, data: { task?, submodule?, description? } })
updateCategory({ id, name })
```

Ambas mutations hacen `supabase.from("roadmap_items/categories").update(data).eq("id", id)` e invalidan queries.

**`RoadmapContent.tsx`** - Estado local:
- `editingCategoryId: string | null` - categoria en edicion
- `editingField: { id: string; field: "task" | "submodule" | "description" } | null` - item/campo en edicion
- `editValue: string` - valor temporal del input

Cada celda editable muestra el texto normal por defecto. Al hacer doble click se reemplaza por un Input con el valor actual. Al presionar Enter o onBlur se llama la mutation correspondiente y se limpia el estado de edicion. Escape cancela la edicion.

