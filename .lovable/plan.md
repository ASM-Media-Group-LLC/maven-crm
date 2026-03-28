

## Plan: Corregir flujo LeadGen → Closers (eliminar "Pendiente LG")

### Flujo correcto (como lo defines)
```text
LeadGen entry (link de redes) 
    ↓ agente crea un Contacto desde ese lead
closers_contacts (trigger existente)
    ↓ sync_closers_contact_to_creators  
closer_creators (stage = "Nuevo") → listo para asignación
```

El entry de LeadGen por si solo NO debe pasar a Closers. Solo cuando se crea un contacto a partir de ese entry.

### Problema actual
El trigger `auto_sync_leadgen_to_closers` inserta CADA leadgen entry directamente en `closer_creators` con stage `'Pendiente LG'`, creando registros fantasma que saturan el pipeline.

### Cambios

#### 1. Migración SQL: desactivar el trigger de sincronización automática
- Eliminar (DROP) el trigger que dispara `auto_sync_leadgen_to_closers` en la tabla `leadgen_entries`
- La función se puede conservar pero el trigger debe dejar de ejecutarse
- Esto detiene la inserción automática de entries en `closer_creators`

#### 2. Migración SQL: limpiar registros huérfanos (opcional pero recomendado)
- Actualizar los registros existentes con `stage = 'Pendiente LG'` a `stage = 'Nuevo'` para que entren al pipeline normal, O eliminarlos si se prefiere que solo pasen por el flujo correcto de contactos

#### 3. `useCloserLeads.ts` — eliminar lógica de "Pendiente LG"
- Eliminar entrada `"Pendiente LG"` de `STAGE_LABELS`
- Eliminar `pendiente_lg` de `TAB_STAGE_MAP`
- En el query principal: eliminar la rama `activeTab === "pendiente_lg"`
- En el tab "Nuevo": quitar el filtro `source_contact_id IS NOT NULL` — ahora TODOS los registros con stage "Nuevo" son legítimos (solo llegan por contactos)
- En el tab "todas": dejar de excluir "Pendiente LG" (ya no existirá)
- En `assignCreator`: quitar la referencia a "Pendiente LG" en la condición de auto-stage

#### 4. `LeadTable.tsx` — eliminar caso "pendiente_lg"
- Eliminar el case `"pendiente_lg"` en headers y rows del switch
- Eliminar el color badge de "Pendiente LG"

#### 5. Validación de duplicados en `AddContactoModal.tsx`
- Cambiar la verificación de duplicados: en vez de buscar en `closers_contacts`, buscar en `creators` (tabla oficial) por handle normalizado
- Si ya existe en `creators`, informar al usuario que esa creadora ya está en el sistema

### Archivos a modificar
- **Nueva migración SQL** (drop trigger + limpiar datos)
- `src/pages/closers/hooks/useCloserLeads.ts`
- `src/pages/closers/components/LeadTable.tsx`
- `src/pages/leadgen/AddContactoModal.tsx`

### Resultado
- LeadGen solo registra entries (prospección)
- Solo al crear un contacto desde el lead, este pasa a Closers como "Nuevo"
- Desaparece completamente el concepto de "Pendiente LG"
- La validación de duplicados se hace contra `creators` (la fuente real)

