

## Permitir reingreso de modelos + campo "Tipo de registro" (Nuevo/Reactivado)

### Resumen
Eliminar el bloqueo cuando un Instagram ya existe en leads/contactos. En su lugar, detectar si el handle ya fue registrado previamente y marcar el nuevo registro como "Reactivado", mostrando un mensaje informativo (no bloqueante). Agregar columna `record_type` a `leadgen_entries` y `closers_contacts`.

### 1. Migración SQL
Agregar columna `record_type` con default `'nuevo'` a ambas tablas:
```sql
ALTER TABLE public.leadgen_entries 
  ADD COLUMN record_type text NOT NULL DEFAULT 'nuevo';

ALTER TABLE public.closers_contacts 
  ADD COLUMN record_type text NOT NULL DEFAULT 'nuevo';
```

### 2. `src/lib/lead-validation.ts`
- **Renombrar** `checkRecentLead` → mantener pero cambiar su uso. Crear nueva función `checkPreviousLead(handle, onlyfansUrl)` que busque cualquier registro previo (sin límite de 24h) en `leadgen_entries` y `closers_contacts` por handle.
- Retorna `{ existed: boolean }` — solo informativo, **no bloquea**.
- **Mantener** `checkCreatorExists` (bloqueo si ya es creadora de la agencia — esto sigue vigente).
- **Eliminar** la validación de 24h (`checkRecentLead`) que actualmente bloquea duplicados por handle.
- **Mantener** `checkDuplicateOnlyFans` como validación (OnlyFans sí debe seguir siendo único).

### 3. `src/pages/leadgen/AddLeadModal.tsx`
- **Eliminar** VALIDATION 2 (checkRecentLead bloqueante, líneas 114-124).
- **Agregar** antes del insert: llamar a `checkPreviousLead(handle)`. Si `existed === true`:
  - Mostrar toast informativo (no destructive): "Esta modelo ya existía en el sistema. Se registrará como un nuevo lead reactivado."
  - Insertar con `record_type: 'reactivado'`
- Si no existía: insertar con `record_type: 'nuevo'` (default).

### 4. `src/pages/contactos/NuevoContactoForm.tsx`
- **Eliminar** VALIDATION 2 (checkRecentLead bloqueante, líneas 156-166).
- **Agregar** misma lógica: detectar si handle ya existía → insertar con `record_type: 'reactivado'` y mostrar mensaje informativo.

### 5. `src/pages/leadgen/LeadGenTable.tsx`
- Agregar columna "Tipo" en la tabla con badge visual:
  - `nuevo` → Badge verde ("Nuevo")
  - `reactivado` → Badge amarillo ("Reactivado")
- Ubicar después de la columna de categoría/calidad.

### 6. `src/pages/contactos/ContactosTable.tsx`
- Agregar columna "Tipo" con mismos badges (verde/amarillo) basado en `record_type`.

### 7. Tipo TypeScript
- En `useLeadGen.ts` (tipo `LeadGenEntry`): agregar `record_type?: string`.
- Actualizar el tipo de contacto en `ContactosTable` si tiene interfaz explícita.

### Archivos a modificar
- Migración SQL (1 archivo)
- `src/lib/lead-validation.ts` — nueva función, eliminar bloqueo 24h
- `src/pages/leadgen/AddLeadModal.tsx` — nueva lógica de reactivación
- `src/pages/contactos/NuevoContactoForm.tsx` — misma lógica
- `src/pages/leadgen/LeadGenTable.tsx` — columna visual
- `src/pages/contactos/ContactosTable.tsx` — columna visual
- Tipos en hooks correspondientes

