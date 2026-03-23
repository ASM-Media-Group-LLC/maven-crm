

## Plan: Sincronizar contactos nuevos hacia Closers

### Problema raíz
Existen **dos tablas independientes** que no se comunican:
- `closers_contacts` — donde escribe AddContactoModal y donde lee /contactos
- `closer_creators` — donde lee /closers

Cuando un agente crea un contacto desde LeadGen (AddContactoModal), se inserta en `closers_contacts` pero **nunca llega a `closer_creators`**, por lo que no aparece en Closers.

### Solución
Crear un **trigger de base de datos** que sincronice automáticamente cada nuevo registro de `closers_contacts` hacia `closer_creators`, similar al trigger existente `auto_sync_leadgen_to_closers` que sincroniza `leadgen_entries → closer_creators`.

### Cambios

#### 1. Migración SQL: Trigger `sync_closers_contact_to_creators`
Crear una función + trigger en `closers_contacts` que al hacer INSERT:
- Inserte en `closer_creators` con stage **"Pendiente LG"** (mismo flujo que LeadGen)
- Mapeo de campos:
  - `handle` → `instagram_handle`
  - `company` → `source_account`
  - `physical_appearance` → `category`
  - `phone` → `phone`
  - `notes` → `notes`
  - `created_by` → `created_by`
- Manejo de `UNIQUE VIOLATION` para evitar duplicados (igual que el trigger existente)

#### 2. Backfill de registros existentes
Un segundo statement en la misma migración que inserte los `closers_contacts` ya existentes que no tengan correspondencia en `closer_creators` (por handle), para que los contactos creados antes de este fix también aparezcan en Closers.

#### 3. Actualizar `AddContactoModal.tsx`
- Además de invalidar `closers-contacts`, también invalidar `closer-creators-list` para que la tabla de Closers se refresque inmediatamente sin necesitar reload.

### Archivos a modificar
1. **Nueva migración SQL** — función + trigger + backfill
2. `src/pages/leadgen/AddContactoModal.tsx` — agregar invalidación de query `closer-creators-list`

### Lo que NO cambia
- La tabla de Contactos (/contactos) sigue leyendo de `closers_contacts` — sin cambios
- La tabla de Closers (/closers) sigue leyendo de `closer_creators` — sin cambios
- El trigger existente de LeadGen (`auto_sync_leadgen_to_closers`) no se toca

