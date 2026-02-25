

## Diagnóstico: El líder con Crown ya está implementado

Revisé el código y el cambio **ya existe** en ambos archivos:

**`ProjectsListContent.tsx` (líneas 267-273):**
```tsx
{leader && (
  <div className="flex items-center gap-2">
    <Crown className="h-4 w-4 text-amber-500" />
    <span className="text-sm font-semibold">{leader.full_name || "Sin nombre"}</span>
  </div>
)}
```

**`TareasContent.tsx` (líneas 139-145):**
```tsx
{projectLeader && (
  <div className="flex items-center gap-2 mt-2 ml-11">
    <Crown className="h-4 w-4 text-amber-500" />
    <span className="text-sm font-semibold">{projectLeader.full_name}</span>
  </div>
)}
```

### Por qué no lo ves

El líder **solo se muestra si el proyecto tiene un `leader_id` asignado**. Si el proyecto no tiene líder, la sección se oculta completamente. Esto explica por qué no ves el cambio.

### Propuesta: Mostrar siempre la línea de líder

Para que sea siempre visible, cambiar la lógica para mostrar un placeholder cuando no hay líder asignado:

| Archivo | Cambio |
|---------|--------|
| `src/pages/tareas/ProjectsListContent.tsx` | Eliminar el condicional `{leader && ...}` y mostrar siempre: si hay líder → Crown + nombre, si no → Crown + "Sin líder asignado" en texto muted |
| `src/pages/tareas/TareasContent.tsx` | Mismo cambio: mostrar siempre la línea de líder con un fallback "Sin líder asignado" |

Esto hará que la sección de líder sea siempre visible independientemente de si el proyecto tiene un líder configurado.

