

## Plan: Agregar badge de miembros en cards y columna de miembros en tabla

### Análisis actual

Las cards ya muestran avatares de miembros en la parte inferior (líneas 299-325 de `ProjectsListContent.tsx`), pero el usuario quiere un **badge en la esquina** de la card con hover para ver los miembros. La tabla (`ProjectsTable.tsx`) no tiene ninguna columna de miembros.

### Cambios

#### 1. Cards — Badge de miembros en la esquina (`ProjectsListContent.tsx`)

- Mover los avatares de miembros de la parte inferior a la **esquina superior derecha** de la card (junto al botón de acciones).
- Envolver los avatares en un `HoverCard` que al hacer hover muestre una lista completa de los miembros del proyecto con sus nombres.
- Si no hay miembros, no mostrar nada (como está ahora).
- Eliminar los avatares de la sección inferior de task counts.

#### 2. Tabla — Columna de miembros (`ProjectsTable.tsx`)

- Agregar una nueva prop `getMembersForProject` que retorne los perfiles de miembros para un proyecto.
- Agregar una columna "Miembros" en la tabla después de "Líder".
- Mostrar avatares apilados (máx 3) con `+N` si hay más, usando `Tooltip` para mostrar el nombre de cada uno.
- Actualizar la llamada en `ProjectsListContent.tsx` para pasar la función `getMembersForProject`.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Mover avatares de miembros a esquina superior de card con HoverCard; pasar `getMembersForProject` a ProjectsTable |
| `src/pages/tareas/ProjectsTable.tsx` | Agregar columna "Miembros" con avatares + tooltip, nueva prop `getMembersForProject` |

