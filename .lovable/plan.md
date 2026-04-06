

# Plan: Estandarizar buscadores y selects de miembros en Tareas

## Cambios

### 1. Buscadores — igualar al estilo LeadGen (`flex-1 max-w-xs h-9`)

LeadGen usa: `className="relative flex-1 max-w-xs"` con input `className="pl-9 h-9"`.

**Archivos a modificar:**
- **`TareasContent.tsx`** (línea 350): Cambiar `w-64 shrink-0` → `flex-1 max-w-xs`, agregar `h-9` al Input
- **`ProjectsListContent.tsx`** (línea 431): Cambiar `flex-1` → `flex-1 max-w-xs`, agregar `h-9` al Input

### 2. Selects de miembros — estandarizar en todos los archivos

Problemas actuales: los profiles no se ordenan alfabéticamente, y los PopoverContent no fuerzan `side="bottom"`.

**Archivos a modificar (agregar `side="bottom"` a PopoverContent y ordenar profiles alfabéticamente antes del `.map`):**

| Archivo | Cambio |
|---------|--------|
| `CreateProjectModal.tsx` | `PopoverContent` → agregar `side="bottom"`, ordenar profiles por `full_name` |
| `EditProjectModal.tsx` | Mismo cambio |
| `CreateTaskModal.tsx` | Mismo cambio |
| `EditTaskModal.tsx` | Mismo cambio |
| `InlineAssigneeSelect.tsx` | Mismo cambio |
| `SubtaskItem.tsx` | Mismo cambio |
| `SubtasksPanel.tsx` | Mismo cambio |

El ordenamiento se aplica inline: `profiles.slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))`.

### Resumen técnico

- 2 archivos para buscadores (tamaño consistente con LeadGen)
- 7 archivos para selects de miembros (side="bottom" + orden alfabético)
- Sin dependencias nuevas

