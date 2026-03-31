

## Plan: Agregar acción "Asignar Agente" en Promolog

### Contexto
Las entradas de Promolog que llegan del sistema externo no tienen `reviewed_by`, por lo que no se sabe qué agente las subió. Se necesita una acción en el dropdown de acciones para asignar o reasignar un agente manualmente.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `PromologEntryCard.tsx` | Agregar `reviewed_by?: string` al interface `PromologEntry` |
| `PromologTable.tsx` | Agregar nueva prop `onAssignAgent`, nuevo `DropdownMenuItem` "Asignar agente" con icono `UserPlus` en el menú de acciones |
| `PromologContent.tsx` | 1) Incluir `reviewed_by` en el mapeo de entries. 2) Agregar state para dialog de asignación (`assignAgentOpen`, `assignTarget`). 3) Dialog con lista de perfiles para seleccionar agente. 4) Al confirmar, hacer `UPDATE promolog_entries SET reviewed_by = selectedUserId WHERE id = entry.id`. 5) Invalidar query. 6) Pasar `onAssignAgent` al `PromologTable`. |

### Detalle del flujo

1. En el dropdown de acciones de cada fila, nuevo item **"Asignar agente"** (icono `UserPlus`)
2. Al hacer clic, abre un dialog con un combobox/select que lista todos los perfiles (ya cargados en `profiles`)
3. Si la entrada ya tiene agente asignado, aparece preseleccionado
4. Al confirmar, ejecuta `supabase.from("promolog_entries").update({ reviewed_by: selectedId }).eq("id", entryId)`
5. Invalida el query para refrescar la tabla
6. Toast de confirmación

### Visibilidad
Solo visible para roles de gestión (`isManagement`), ya que un agente no debería reasignar entradas.

