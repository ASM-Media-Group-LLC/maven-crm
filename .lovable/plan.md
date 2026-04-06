
# Plan: Limpiar filtros duplicados

## Dentro del proyecto (TareasContent.tsx)
- **Quitar**: Select "Asignado" (líneas 366-376) — ya existe el tab bar de miembros con avatares que hace lo mismo
- **Mantener**: Search, Estado, Prioridad — estos son útiles y no están duplicados

## Página principal (ProjectsListContent.tsx)
Filtros actuales: Search, Carpeta, Estado, Miembro, Prioridad, toggle Grid/List.

**Recomendación**:
- **Mantener**: Search (esencial), Estado (activo/archivado — útil para filtrar archivados), Carpeta (si hay carpetas), toggle Grid/List
- **Quitar**: "Miembro" — en la página principal filtra proyectos donde alguien es miembro, pero es poco usado y agrega ruido visual
- **Quitar**: "Prioridad" — filtra proyectos que tienen tareas con cierta prioridad, lo cual es confuso a nivel de proyecto (la prioridad es de tareas, no de proyectos)

## Resultado final

| Vista | Filtros que quedan |
|-------|-------------------|
| Dentro del proyecto | Search, Estado, Prioridad + avatar tabs para miembros |
| Página principal | Search, Carpeta (condicional), Estado, toggle Grid/List |

## Archivos modificados
- `TareasContent.tsx` — eliminar select "Asignado" y su estado `assignedFilter` (ya lo maneja el tab bar)
- `ProjectsListContent.tsx` — eliminar selects "Miembro" y "Prioridad" y sus estados
