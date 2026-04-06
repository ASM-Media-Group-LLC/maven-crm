
# Plan: Fix layout en página principal de Tareas

## Problemas detectados

1. **Stats cards** están dentro del bloque condicional `mainView === "projects"` (línea 462), por lo que desaparecen al cambiar a Kanban o Analíticas.
2. **Filtros** (Carpeta, Estado) se ocultan con `mainView === "projects"` (línea 379), dejando al usuario sin forma de volver a la vista de proyectos.
3. **No hay botón "Proyectos"** en la barra de tabs para regresar a la vista base.

## Cambios en `ProjectsListContent.tsx`

1. **Mover KPI cards fuera del condicional** — Sacarlas del bloque `mainView === "projects"` y colocarlas justo después del header, antes de la barra de filtros. Siempre visibles.

2. **Agregar tab "Proyectos"** al grupo de botones (líneas 407-445) para que el usuario pueda volver a la vista de proyectos desde Kanban o Analíticas.

3. **Mostrar filtros siempre** — Quitar el `mainView === "projects"` guard de los selects de Carpeta y Estado (línea 379). Así están disponibles en todas las vistas.

## Estructura resultante

```text
Header (título + botones crear)
─────────────────────────────────
KPI Stats Cards (siempre visibles)
─────────────────────────────────
Buscador + Filtros + [Proyectos | Kanban | Analíticas] + [Grid/List]
─────────────────────────────────
Contenido de la vista activa
```

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `ProjectsListContent.tsx` | Reordenar layout: KPIs arriba, filtros siempre visibles, agregar tab "Proyectos" |
