

## Plan: Contactos de agentes → Closers con estado "Nuevo"

### Problema
El trigger `sync_closers_contact_to_creators` ya sincroniza `closers_contacts` → `closer_creators`, pero usa stage **"Pendiente LG"**, mezclando los ~472 contactos de agentes con los 81K+ leads de LeadGen. No hay forma de distinguirlos.

### Cambios

#### 1. Migración SQL
- **Actualizar función** `sync_closers_contact_to_creators`: cambiar stage de `'Pendiente LG'` a `'Nuevo'`
- **Corregir registros existentes**: `UPDATE closer_creators SET stage = 'Nuevo' WHERE leadgen_entry_id IS NULL AND stage = 'Pendiente LG'` — los que no vienen de LeadGen pasan a "Nuevo"

#### 2. Hook: agregar stage "Nuevo" (`useCloserLeads.ts`)
- Agregar `"Nuevo"` a `STAGE_LABELS`
- Agregar `nuevo: ["Nuevo"]` a `TAB_STAGE_MAP`

#### 3. Tab "Nuevo" en UI (`ClosersContent.tsx`)
- Agregar `{ value: "nuevo", label: "Nuevo" }` a `ALL_TABS` (después de "Todas")

#### 4. Tabla: color + columna fecha creación (`LeadTable.tsx`)
- Agregar color teal para badge "Nuevo" en `stageColor`
- Agregar headers y renderizado de filas para tab "nuevo" con columnas: Instagram, Fecha creación, Cuenta origen, Categoría, Teléfono, Notas, Acciones
- Agregar columna "Creación" (`format(created_at, "dd/MM/yyyy")`) en los tabs existentes relevantes

### Archivos a modificar
1. **Nueva migración SQL** — actualizar trigger + corregir datos
2. `src/pages/closers/hooks/useCloserLeads.ts` — stage maps
3. `src/pages/closers/ClosersContent.tsx` — tab nuevo
4. `src/pages/closers/components/LeadTable.tsx` — color + headers/filas + columna creación

