

# Plan: Reestructurar página principal de Tareas

## Problema actual

En el header hay un toggle de 3 botones (Proyectos / Kanban / Analíticas) arriba a la derecha. El tab "Proyectos" es redundante porque es el contenido base de la página. Además, el patrón es inconsistente con la vista interna de proyecto donde Kanban/Lista/Analíticas están en la barra de filtros (abajo, junto al toggle de vista).

## Cambios propuestos

### `ProjectsListContent.tsx`

1. **Eliminar el toggle de 3 botones del header** (líneas 363-388) — quitar los botones Proyectos/Kanban/Analíticas del área superior derecha.

2. **Eliminar el tab "Proyectos"** — la lista de proyectos es siempre visible como contenido base. Kanban y Analíticas se convierten en vistas alternativas.

3. **Mover Kanban y Analíticas a la barra de filtros** — en la fila donde está el buscador + filtros + toggle grid/list (línea 430-466), agregar un `TabsList` con Kanban y Analíticas al lado del toggle grid/list, usando el mismo patrón que `TareasContent.tsx`:

```text
[Buscar...] [Carpeta ▼] [Estado ▼]         [Kanban] [Analíticas] | [≡] [⊞]
```

- Cuando se selecciona Kanban o Analíticas, se muestra esa vista en vez de la lista de proyectos.
- Cuando no hay ningún tab seleccionado (default), se muestra la lista de proyectos con el toggle grid/list.
- El toggle grid/list solo se muestra cuando estamos en la vista de proyectos (no en kanban/analíticas).

4. **Estado `mainView`** cambia de `"projects" | "kanban" | "analytics"` a seguir funcionando igual pero con UI diferente (tabs en la barra de filtros en vez de botones en el header).

### Resultado visual

El header queda más limpio con solo título + botones "Nueva Carpeta" y "Nuevo Proyecto". La barra de filtros absorbe la navegación entre vistas, consistente con la vista interna de proyecto.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `ProjectsListContent.tsx` | Mover toggle de vistas del header a la barra de filtros, eliminar tab "Proyectos" |

