

## Diagnóstico

**Problema 1 — Edición inline solo funciona en la primera fila:**
Los componentes `InlineCategorySelect` e `InlineSourceSelect` usan `<Popover>` **sin `modal={true}`**. Dentro de un contenedor con `overflow-x-auto` (la tabla), los clicks en popovers de filas inferiores no se propagan correctamente. El `ContactCountCell` ya usa `modal={true}` y funciona bien — los demás no.

Además, los `PopoverTrigger` envuelven un `<span>`, que no es un elemento interactivo nativo y puede causar problemas con `asChild`. Deben ser `<button>`.

El `InlineStageSelect` usa un `<Select>` estándar sin Popover, que también puede tener problemas de z-index/portal dentro del scroll container.

**Problema 2 — AssignCloserDialog muestra todos los usuarios:**
El dialog actual filtra por roles `closer` y `admin`, pero no tiene buscador interno. Necesita un `Command` + `CommandInput` para filtrar por nombre, y debe excluir roles que no son `closer`.

## Plan

### 1. Arreglar `InlineCategorySelect` y `InlineSourceSelect`
- Agregar `modal={true}` a ambos `<Popover>`
- Cambiar `<span>` por `<button>` en los `PopoverTrigger`

### 2. Arreglar `InlineStageSelect`
- Convertir de `<Select>` a patrón `Popover` + badges clickeables (consistente con Category), con `modal={true}`

### 3. Rediseñar `AssignCloserDialog`
- Reemplazar el `<Select>` por un `Popover` + `Command` + `CommandInput` con búsqueda
- Filtrar la query para traer solo usuarios con rol `closer` (no admin ni otros)
- Mostrar nombre completo y permitir búsqueda por nombre

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — fixes en InlineCategorySelect, InlineSourceSelect, InlineStageSelect
- `src/pages/closers/components/AssignCloserDialog.tsx` — searchable combobox, solo closers

