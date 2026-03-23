

## Plan: Limpiar duplicados, mostrar creador, y edición inline en tab Nuevo

### Problema 1: Los 418 "Nuevo" pueden incluir handles ya registrados como Creators

El trigger `cleanup_closer_on_creator_insert` deberia limpiar al insertar un creator, pero puede haber registros previos que no se limpiaron. Solución en dos partes:

**a) Limpieza one-time** via migration SQL:
```sql
DELETE FROM closer_creators
WHERE stage = 'Nuevo'
  AND leadgen_entry_id IS NULL
  AND lower(trim(both '@' from instagram_handle)) IN (
    SELECT lower(trim(both '@' from instagram_handle)) FROM creators
  );
```

**b) Filtro en la query del tab "Nuevo"**: Crear un RPC `get_nuevo_closer_creators` que haga un `NOT EXISTS` contra la tabla `creators`, asegurando que nunca se muestren handles duplicados. O alternativamente, mantener la query actual y confiar en el trigger + la limpieza one-time (más simple).

Recomiendo opcion b-simple: la limpieza one-time + confiar en el trigger existente. Si se quiere extra seguridad, crear el RPC.

### Problema 2: Mostrar nombre del usuario que creó el contacto

Actualmente en el tab "Nuevo", `agent_name` se setea a `null` (línea 148 del hook). Se necesita:

**En `useCloserLeads.ts`** (tab "nuevo"):
- Recoger los `created_by` IDs de los rows
- Fetch profiles para esos IDs
- Mapear `created_by` → `full_name` y agregar al campo `agent_name` (o un nuevo campo `creator_name`)

**En `LeadTable.tsx`** (tab "nuevo", línea 755):
- Ya existe la columna "Agente" que muestra `c.agent_name`. Una vez que el hook lo llene con el nombre del creador, se mostrará correctamente. Cambiar el header de "Agente" a "Creado por" para este tab.

### Problema 3: Edición inline de Categoría y Estado en tab "Nuevo"

**En `LeadTable.tsx`**:
- **Categoría** (línea 757-758): Reemplazar el Badge estático por `InlineCategorySelect` (ya existe en el mismo archivo)
- **Estado**: Agregar columna "Estado" con `InlineStageSelect` para poder mover registros directamente desde la tabla

**Headers del tab "nuevo"** (líneas 519-532): Agregar header "Estado" y actualizar "Agente" → "Creado por"

### Archivos a modificar

1. **Migration SQL** -- Limpieza de handles duplicados en closer_creators
2. **`src/pages/closers/hooks/useCloserLeads.ts`** -- Fetch profiles para `created_by` en tab "nuevo"
3. **`src/pages/closers/components/LeadTable.tsx`** -- Inline editing en tab "nuevo", agregar columna Estado, cambiar header Agente → Creado por

### Resultado
- Solo contactos realmente nuevos aparecen en el tab Nuevo
- Se ve quién creó cada contacto
- Categoría y Estado son editables inline con dropdowns

