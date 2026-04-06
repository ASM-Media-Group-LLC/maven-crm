

# Plan: Fix Promolog agents + Upgrade Collections

## 1. Promolog — Solo muestra 1 agente activo

**Causa raíz**: El hook `usePromologActiveAgents` hace `SELECT reviewed_by FROM promolog_entries ... LIMIT 1000`. Con 34K filas y sin `DISTINCT`, las 1000 filas devueltas probablemente son todas del mismo agente (Lorena, que tiene 292+ entradas como revisora pero miles como reviewed_by). La DB confirma que hay 13 reviewed_by distintos y 4 created_by distintos, con 4 agentes con perfil.

**Solución**: Crear una función RPC `get_distinct_promolog_agents()` que retorne `SELECT DISTINCT` de ambos campos en una sola query server-side eficiente:

```sql
CREATE FUNCTION public.get_distinct_promolog_agents()
RETURNS TABLE(agent_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT reviewed_by FROM promolog_entries WHERE reviewed_by IS NOT NULL
  UNION
  SELECT DISTINCT created_by FROM promolog_entries WHERE created_by IS NOT NULL
$$;
```

Luego en `usePromologAgentStats.ts`, reemplazar las dos queries con `.limit(1000)` por una sola llamada `.rpc("get_distinct_promolog_agents")` y filtrar por `profileIds` en el cliente.

## 2. Collections — Buscador en select de Creadora

Reemplazar el `<Select>` de creadora en el modal de registro (línea 382-387) con el patrón `Popover + Command` (combobox con búsqueda interna), igual que el estándar del proyecto para selectores de miembros.

## 3. Collections — Adjuntar evidencia

- Agregar campo `evidence_url` a la tabla `invoices` (text, nullable) via migración
- En el modal de registro, agregar un input de archivo (imagen/PDF) debajo de "Detalle/Nota"
- Subir al bucket `custom-request-attachments` (ya existe, público) y guardar la URL en `evidence_url`
- Mostrar link/icono de evidencia en la tabla cuando existe

## 4. Collections — Acciones en tabla

Agregar columna "Acciones" con `DropdownMenu` conteniendo:
- **Ver**: Modal de detalle con toda la info del cobro + evidencia
- **Editar**: Modal para modificar monto, estado, notas, evidencia
- **Imprimir**: `window.print()` con formato del cobro
- **Eliminar**: Confirmación + delete de la fila
- **Exportar**: Exportar fila individual a Excel/CSV

## Archivos modificados
| Recurso | Cambio |
|---------|--------|
| DB migration | Función RPC `get_distinct_promolog_agents` + columna `evidence_url` en invoices |
| `usePromologAgentStats.ts` | Usar `.rpc()` en vez de queries con limit |
| `CollectionsPage.tsx` | Combobox creadora, upload evidencia, columna acciones con view/edit/print/delete/export |

