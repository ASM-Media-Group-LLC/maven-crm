

## Corregir defaults de filtros en Tareas y Proyectos

### Problema
Los selects de filtro en TareasContent y ProjectsListContent usan `"all"` como valor por defecto, mostrando "Todos" en vez del nombre del filtro (ej: "Estado", "Prioridad"). El usuario quiere que el placeholder descriptivo sea lo que se muestre cuando no hay filtro activo.

### Cambios

#### 1. `src/pages/tareas/TareasContent.tsx`
- Cambiar los estados iniciales de `"all"` a `""`:
  - `statusFilter`: `""` (placeholder: "Estado")
  - `assignedFilter`: `""` (placeholder: "Asignado")
  - `priorityFilter`: `""` (placeholder: "Prioridad")
- En los `Select`, cambiar `value={statusFilter}` a `value={statusFilter || undefined}` para que cuando sea `""` se muestre el placeholder
- Cambiar `<SelectItem value="all">` a `<SelectItem value="__all__">` y en `onValueChange` convertir `__all__` a `""`
- Actualizar la logica de filtrado: cambiar `statusFilter === "all"` a `!statusFilter` (o `statusFilter === ""`)

#### 2. `src/pages/tareas/ProjectsListContent.tsx`
- Mismo patron: cambiar `statusFilter` de `"all"` a `""`
- Actualizar el Select para usar `__all__` y placeholder
- Actualizar la logica de filtrado

### Patron aplicado
Seguir el mismo patron que ya usa `CreadoresFilters.tsx`:
```
value={value || undefined}
onValueChange={(v) => onChange(v === "__all__" ? "" : v)}
```

Esto garantiza consistencia con el resto de modulos del sistema (Contactos, Creadores, Eventos, Tickets, Promolog) que ya siguen este patron.
